-- Task comments: comments on tasks
CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  content text NOT NULL,
  author_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_avatar_url text
);

CREATE INDEX idx_task_comments_task_id ON public.task_comments(task_id);
CREATE INDEX idx_task_comments_firm_id ON public.task_comments(firm_id);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read task_comments" ON public.task_comments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated insert task_comments" ON public.task_comments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update task_comments" ON public.task_comments FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated delete task_comments" ON public.task_comments FOR DELETE TO anon, authenticated USING (true);
