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
