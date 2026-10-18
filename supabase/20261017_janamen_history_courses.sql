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
