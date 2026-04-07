-- Task automation rules + execution log (TaskAutomationSettings)

CREATE TABLE IF NOT EXISTS public.task_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  task_title_template text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  due_days_offset integer NOT NULL DEFAULT 3,
  dedup_window_days integer NOT NULL DEFAULT 7,
  assign_to uuid REFERENCES public.advisors(id) ON DELETE SET NULL,
  times_fired integer NOT NULL DEFAULT 0,
  last_fired_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_automation_rules_firm_trigger_idx ON public.task_automation_rules(firm_id, trigger_type);

ALTER TABLE public.task_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_automation_rules_firm" ON public.task_automation_rules;
CREATE POLICY "task_automation_rules_firm" ON public.task_automation_rules
  FOR ALL USING (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  )
  WITH CHECK (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.task_automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.task_automation_rules(id) ON DELETE SET NULL,
  task_created boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_automation_log_firm_created_idx ON public.task_automation_log(firm_id, created_at DESC);

ALTER TABLE public.task_automation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_automation_log_firm" ON public.task_automation_log;
CREATE POLICY "task_automation_log_firm" ON public.task_automation_log
  FOR SELECT USING (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );
