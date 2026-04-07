-- Dashboard widget layout per advisor (advisor id = auth user id)

CREATE TABLE IF NOT EXISTS public.dashboard_preferences (
  advisor_id   uuid PRIMARY KEY REFERENCES public.advisors(id) ON DELETE CASCADE,
  firm_id      uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  widget_layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_preferences_firm_id_idx ON public.dashboard_preferences(firm_id);

ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_preferences_select_own"
  ON public.dashboard_preferences FOR SELECT
  USING (auth.uid() = advisor_id);

CREATE POLICY "dashboard_preferences_insert_own"
  ON public.dashboard_preferences FOR INSERT
  WITH CHECK (auth.uid() = advisor_id);

CREATE POLICY "dashboard_preferences_update_own"
  ON public.dashboard_preferences FOR UPDATE
  USING (auth.uid() = advisor_id);
