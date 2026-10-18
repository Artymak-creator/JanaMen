-- JanaМен / JanaPost: three roles, leave types and approval chain
-- Run once in Supabase Dashboard -> SQL Editor using the existing project.
-- Take a backup first. This migration preserves legacy request.status values.

-- 1) Profiles: employee -> assigned manager, current paid-leave balance.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS annual_leave_days_remaining integer;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_annual_leave_days_remaining_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_annual_leave_days_remaining_check
  CHECK (annual_leave_days_remaining IS NULL OR annual_leave_days_remaining >= 0);

-- Extend the existing roles to include manager. Remove only an older role check
-- that explicitly restricts the role to employee/HR, then add the supported list.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND contype = 'c'
  LOOP
    IF c.definition ILIKE '%role%'
       AND c.definition ILIKE '%employee%'
       AND c.definition ILIKE '%hr%' THEN
      EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('employee', 'manager', 'hr'));

-- 2) Requests: keep the existing status field and add separate workflow-stage data.
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS approver_manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS workflow_stage text NOT NULL DEFAULT 'hr';
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS manager_comment text NOT NULL DEFAULT '';
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS manager_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS manager_reviewed_at timestamptz;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS leave_type text;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS leave_days_requested integer;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS leave_balance_at_submission integer;

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_workflow_stage_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_workflow_stage_check
  CHECK (workflow_stage IN ('manager', 'hr', 'done'));

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_leave_type_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_leave_type_check
  CHECK (leave_type IS NULL OR leave_type IN ('paid', 'unpaid'));

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_leave_days_requested_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_leave_days_requested_check
  CHECK (leave_days_requested IS NULL OR leave_days_requested > 0);

-- Legacy pending requests already belonged to the old HR-review flow, therefore
-- their new workflow_stage defaults to 'hr' and they will not be sent backward.
UPDATE public.requests
SET workflow_stage = 'hr'
WHERE workflow_stage IS NULL OR workflow_stage NOT IN ('manager', 'hr', 'done');

-- 3) Safe helper for RLS policies; role lookups always use the signed-in user.
CREATE OR REPLACE FUNCTION public.janamen_current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role::text
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.janamen_current_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.janamen_current_role() TO authenticated;

-- 4) Server-side workflow enforcement and paid-day deduction.
CREATE OR REPLACE FUNCTION public.janamen_guard_request_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_requester_role text;
  v_actor_role text;
  v_reporting_manager_id uuid;
  v_manager_role text;
  v_balance integer;
  v_days integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Нельзя создавать заявку от имени другого пользователя';
    END IF;

    SELECT p.role::text, p.manager_id
      INTO v_requester_role, v_reporting_manager_id
    FROM public.profiles p
    WHERE p.user_id = NEW.user_id;

    IF v_requester_role IS NULL OR v_requester_role NOT IN ('employee', 'manager') THEN
      RAISE EXCEPTION 'Создавать заявки могут только сотрудник и руководитель';
    END IF;

    IF v_requester_role = 'employee' AND v_reporting_manager_id IS NULL THEN
      RAISE EXCEPTION 'Сотруднику не назначен руководитель: заполните profiles.manager_id';
    END IF;

    IF v_reporting_manager_id IS NOT NULL THEN
      SELECT p.role::text INTO v_manager_role
      FROM public.profiles p
      WHERE p.user_id = v_reporting_manager_id;
      IF v_manager_role IS DISTINCT FROM 'manager' THEN
        RAISE EXCEPTION 'Назначенный согласующий должен иметь роль manager';
      END IF;
    END IF;

    NEW.approver_manager_id := v_reporting_manager_id;
    NEW.status := 'На рассмотрении';
    NEW.workflow_stage := CASE WHEN v_reporting_manager_id IS NULL THEN 'hr' ELSE 'manager' END;
    NEW.manager_comment := '';
    NEW.manager_reviewed_by := NULL;
    NEW.manager_reviewed_at := NULL;
    NEW.hr_comment := '';
    NEW.hr_signed_by := NULL;
    NEW.hr_signed_at := NULL;

    IF NEW.request_type = 'Ежегодный отпуск' THEN
      IF NEW.start_date IS NULL OR NEW.end_date IS NULL OR NEW.end_date < NEW.start_date THEN
        RAISE EXCEPTION 'Для отпуска укажите корректные даты начала и окончания';
      END IF;
      IF NEW.leave_type NOT IN ('paid', 'unpaid') THEN
        RAISE EXCEPTION 'Выберите тип отпуска: оплачиваемый или без содержания';
      END IF;

      v_days := (NEW.end_date - NEW.start_date) + 1;
      NEW.leave_days_requested := v_days;

      IF NEW.leave_type = 'paid' THEN
        SELECT p.annual_leave_days_remaining INTO v_balance
        FROM public.profiles p
        WHERE p.user_id = NEW.user_id
        FOR UPDATE;

        IF v_balance IS NULL THEN
          RAISE EXCEPTION 'Остаток оплачиваемых дней не задан в профиле сотрудника';
        END IF;
        IF v_balance < v_days THEN
          RAISE EXCEPTION 'Недостаточно оплачиваемых дней: доступно %, запрошено %', v_balance, v_days;
        END IF;
        NEW.leave_balance_at_submission := v_balance;
      ELSE
        NEW.leave_balance_at_submission := NULL;
      END IF;
    ELSE
      NEW.leave_type := NULL;
      NEW.leave_days_requested := NULL;
      NEW.leave_balance_at_submission := NULL;
    END IF;

    RETURN NEW;
  END IF;

  SELECT p.role::text INTO v_actor_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF OLD.status <> 'На рассмотрении' THEN
    RAISE EXCEPTION 'Заявка уже завершена и не может быть изменена';
  END IF;

  -- Manager stage: approve and forward to HR, or reject.
  IF OLD.workflow_stage = 'manager'
     AND v_actor_role = 'manager'
     AND OLD.approver_manager_id = auth.uid() THEN
    IF (to_jsonb(NEW) - ARRAY['status','workflow_stage','manager_comment','manager_reviewed_by','manager_reviewed_at','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','workflow_stage','manager_comment','manager_reviewed_by','manager_reviewed_at','updated_at']) THEN
      RAISE EXCEPTION 'Руководитель может изменить только решение и комментарий своего этапа';
    END IF;

    IF NEW.status = 'На рассмотрении' THEN
      NEW.workflow_stage := 'hr';
    ELSIF NEW.status = 'Отклонена' THEN
      NEW.workflow_stage := 'done';
    ELSE
      RAISE EXCEPTION 'На этапе руководителя можно согласовать или отклонить заявку';
    END IF;

    NEW.manager_reviewed_by := auth.uid();
    NEW.manager_reviewed_at := now();
    RETURN NEW;
  END IF;

  -- Final HR stage: sign the result and deduct approved paid leave atomically.
  IF OLD.workflow_stage = 'hr'
     AND v_actor_role = 'hr' THEN
    IF (to_jsonb(NEW) - ARRAY['status','workflow_stage','hr_comment','hr_signed_by','hr_signed_at','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','workflow_stage','hr_comment','hr_signed_by','hr_signed_at','updated_at']) THEN
      RAISE EXCEPTION 'HR может изменить только итоговое решение и комментарий HR';
    END IF;

    IF NEW.status NOT IN ('Одобрена', 'Отклонена') THEN
      RAISE EXCEPTION 'HR должен одобрить или отклонить заявку';
    END IF;

    NEW.workflow_stage := 'done';
    NEW.hr_signed_by := COALESCE(auth.jwt() ->> 'email', auth.uid()::text);
    NEW.hr_signed_at := now();

    IF NEW.status = 'Одобрена'
       AND OLD.request_type = 'Ежегодный отпуск'
       AND OLD.leave_type = 'paid' THEN
      UPDATE public.profiles
      SET annual_leave_days_remaining = annual_leave_days_remaining - OLD.leave_days_requested
      WHERE user_id = OLD.user_id
        AND annual_leave_days_remaining IS NOT NULL
        AND annual_leave_days_remaining >= OLD.leave_days_requested;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Не удалось списать оплачиваемые дни: проверьте остаток дней сотрудника';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'У пользователя нет прав на этот этап согласования';
END;
$$;

DROP TRIGGER IF EXISTS janamen_guard_request_workflow ON public.requests;
CREATE TRIGGER janamen_guard_request_workflow
BEFORE INSERT OR UPDATE ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.janamen_guard_request_workflow();

-- 5) Replace request policies so legacy permissive policies cannot bypass stages.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'requests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.requests', c.policyname);
  END LOOP;
END $$;

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY janamen_requests_select ON public.requests
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR approver_manager_id = auth.uid()
  OR (public.janamen_current_role() = 'hr' AND workflow_stage <> 'manager')
);

CREATE POLICY janamen_requests_insert ON public.requests
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.janamen_current_role() IN ('employee', 'manager')
);

CREATE POLICY janamen_requests_manager_update ON public.requests
FOR UPDATE TO authenticated
USING (
  workflow_stage = 'manager'
  AND approver_manager_id = auth.uid()
  AND public.janamen_current_role() = 'manager'
)
WITH CHECK (
  approver_manager_id = auth.uid()
  AND public.janamen_current_role() = 'manager'
  AND (
    (status = 'На рассмотрении' AND workflow_stage = 'hr')
    OR (status = 'Отклонена' AND workflow_stage = 'done')
  )
);

CREATE POLICY janamen_requests_hr_update ON public.requests
FOR UPDATE TO authenticated
USING (
  workflow_stage = 'hr'
  AND status = 'На рассмотрении'
  AND public.janamen_current_role() = 'hr'
)
WITH CHECK (
  workflow_stage = 'done'
  AND status IN ('Одобрена', 'Отклонена')
  AND public.janamen_current_role() = 'hr'
);

GRANT SELECT, INSERT, UPDATE ON public.requests TO authenticated;

-- 6) Lock down profile fields so browser clients cannot promote themselves,
-- change their assigned manager, or edit their own leave balance.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', c.policyname);
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY janamen_profiles_select_own ON public.profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- 7) Assign roles, managers and leave balances after reviewing your real accounts.
-- Use actual emails and the HR-approved balances; don't copy example numbers blindly.
-- Example (replace the example emails with actual addresses):
-- UPDATE public.profiles SET role = 'manager'
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'manager@example.com');
-- UPDATE public.profiles SET manager_id = (SELECT user_id FROM public.profiles WHERE user_id =
--   (SELECT id FROM auth.users WHERE email = 'manager@example.com') AND role = 'manager')
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'employee@example.com');
-- UPDATE public.profiles SET annual_leave_days_remaining = 20
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'employee@example.com');
