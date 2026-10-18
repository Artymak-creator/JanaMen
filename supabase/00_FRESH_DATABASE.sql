-- JanaМен / JanaPost — УСТАНОВКА В НОВОМ ПУСТОМ Supabase-проекте.
-- Запустить ОДИН РАЗ в SQL Editor нового проекта. Не запускать в старой рабочей базе.
-- Этот файл создаёт базовые profiles/requests, затем остальные таблицы,
-- RLS-политики, триггеры согласования, календарь, историю и прогресс курсов.
-- Перед запуском в старой базе обязательно нужна адаптация; данный скрипт для новой базы.

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'employee',
  manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  annual_leave_days_remaining integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type text NOT NULL,
  start_date date,
  end_date date,
  amount numeric(12,2),
  details text NOT NULL DEFAULT '',
  conditions text[] NOT NULL DEFAULT ARRAY[]::text[],
  employee_comment text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'На рассмотрении',
  hr_comment text NOT NULL DEFAULT '',
  hr_signed_by text,
  hr_signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS requests_user_id_idx ON public.requests (user_id);
CREATE INDEX IF NOT EXISTS requests_status_stage_idx ON public.requests (status);

-- JanaМен / JanaPost: ВСЕ миграции одним файлом (порядок: requirements → calendar → history_courses).
-- Перед запуском сделайте backup проекта Supabase.

-- ===== 20261017_janapost_requirements.sql =====
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

-- ===== 20261017_janamen_calendar.sql =====
-- JanaМен: общий календарь, события, дни рождения, имена сотрудников, авто-создание профиля.
-- Запускать ПОСЛЕ 20261017_janapost_requirements.sql, в том же Supabase-проекте. Сначала сделайте backup.

-- 1) Профили: имя и дата рождения (меняет только HR через функцию ниже)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;

-- 2) Автосоздание профиля при регистрации (роль всегда employee; повысить может только админ через SQL)
CREATE OR REPLACE FUNCTION public.janamen_handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  INSERT INTO public.profiles (user_id, role)
  VALUES (NEW.id, 'employee')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS janamen_on_auth_user_created ON auth.users;
CREATE TRIGGER janamen_on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.janamen_handle_new_user();

-- 3) События календаря
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  event_date date NOT NULL,
  event_time text,
  kind text NOT NULL DEFAULT 'company' CHECK (kind IN ('company','meeting','training','holiday')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_date_idx ON public.events (event_date);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS janamen_events_select ON public.events;
DROP POLICY IF EXISTS janamen_events_hr_insert ON public.events;
DROP POLICY IF EXISTS janamen_events_hr_update ON public.events;
DROP POLICY IF EXISTS janamen_events_hr_delete ON public.events;
CREATE POLICY janamen_events_select ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY janamen_events_hr_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.janamen_current_role() = 'hr' AND created_by = auth.uid());
CREATE POLICY janamen_events_hr_update ON public.events FOR UPDATE TO authenticated
  USING (public.janamen_current_role() = 'hr') WITH CHECK (public.janamen_current_role() = 'hr');
CREATE POLICY janamen_events_hr_delete ON public.events FOR DELETE TO authenticated
  USING (public.janamen_current_role() = 'hr');
REVOKE ALL ON public.events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;

-- 4) Справочник: имя + день рождения (без e-mail и без других чувствительных полей)
CREATE OR REPLACE FUNCTION public.janamen_directory()
RETURNS TABLE (user_id uuid, display_name text, birth_date date, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT p.user_id,
         COALESCE(NULLIF(p.full_name, ''), split_part(u.email, '@', 1)),
         p.birth_date,
         p.role::text
  FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
  WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.janamen_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.janamen_directory() TO authenticated;

-- 5) HR задаёт имя и дату рождения сотрудника
CREATE OR REPLACE FUNCTION public.janamen_set_person_info(p_user_id uuid, p_full_name text, p_birth_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.janamen_current_role() IS DISTINCT FROM 'hr' THEN
    RAISE EXCEPTION 'Только HR может менять данные сотрудников';
  END IF;
  UPDATE public.profiles SET full_name = NULLIF(trim(p_full_name), ''), birth_date = p_birth_date
  WHERE user_id = p_user_id;
END $$;
REVOKE ALL ON FUNCTION public.janamen_set_person_info(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.janamen_set_person_info(uuid, text, date) TO authenticated;

-- 6) Realtime: события у всех обновляются без перезагрузки
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

-- ===== 20261017_janamen_history_courses.sql =====
-- JanaМен: история статусов заявок + сохранение прогресса обучения.
-- Запускать ПОСЛЕ двух предыдущих миграций.

-- 1) История заявок
CREATE TABLE IF NOT EXISTS public.request_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id text NOT NULL,
  actor_id uuid DEFAULT auth.uid(),
  event text NOT NULL,
  status text,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_history_req_idx ON public.request_history (request_id, created_at);
ALTER TABLE public.request_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS janamen_history_select ON public.request_history;
CREATE POLICY janamen_history_select ON public.request_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id::text = request_history.request_id));
REVOKE ALL ON public.request_history FROM anon, authenticated;
GRANT SELECT ON public.request_history TO authenticated;

CREATE OR REPLACE FUNCTION public.janamen_log_request_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text; v_comment text := '';
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := CASE WHEN NEW.workflow_stage = 'manager' THEN 'Заявка создана и отправлена руководителю'
                    ELSE 'Заявка создана и отправлена в HR' END;
  ELSE
    IF NEW.workflow_stage = OLD.workflow_stage AND NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF OLD.workflow_stage = 'manager' AND NEW.workflow_stage = 'hr' THEN
      v_event := 'Согласована руководителем, передана в HR'; v_comment := NEW.manager_comment;
    ELSIF OLD.workflow_stage = 'manager' AND NEW.status = 'Отклонена' THEN
      v_event := 'Отклонена руководителем'; v_comment := NEW.manager_comment;
    ELSIF NEW.status = 'Одобрена' THEN
      v_event := 'Одобрена HR'; v_comment := NEW.hr_comment;
    ELSE
      v_event := 'Отклонена HR'; v_comment := NEW.hr_comment;
    END IF;
  END IF;
  INSERT INTO public.request_history (request_id, event, status, comment)
  VALUES (NEW.id::text, v_event, NEW.status, COALESCE(v_comment, ''));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS janamen_log_request_history ON public.requests;
CREATE TRIGGER janamen_log_request_history
AFTER INSERT OR UPDATE ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.janamen_log_request_history();

-- Заявки, созданные до миграции, получают стартовую запись
INSERT INTO public.request_history (request_id, actor_id, event, status, created_at)
SELECT r.id::text, r.user_id, 'Заявка создана', r.status, r.created_at
FROM public.requests r
WHERE NOT EXISTS (SELECT 1 FROM public.request_history h WHERE h.request_id = r.id::text);

-- 2) Прогресс обучения (каждый видит и меняет только свои строки)
CREATE TABLE IF NOT EXISTS public.course_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  course_id text NOT NULL,
  step integer NOT NULL DEFAULT 0 CHECK (step >= 0),
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS janamen_course_own ON public.course_progress;
CREATE POLICY janamen_course_own ON public.course_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.course_progress FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.course_progress TO authenticated;

