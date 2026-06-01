CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
GRANT SELECT ON public.app_settings TO anon;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view app settings" ON public.app_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert app settings" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update app settings" ON public.app_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Public can view report time settings" ON public.app_settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('active_report_time', 'report_times'));

CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reporters TO authenticated;
GRANT ALL ON public.reporters TO service_role;
ALTER TABLE public.reporters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reporters" ON public.reporters
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert reporters" ON public.reporters
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update reporters" ON public.reporters
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete reporters" ON public.reporters
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_reporters_updated BEFORE UPDATE ON public.reporters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created_first_admin ON auth.users;
DROP FUNCTION IF EXISTS public.auto_grant_first_admin();

CREATE INDEX IF NOT EXISTS idx_daily_reports_report_date ON public.daily_reports (report_date);
CREATE INDEX IF NOT EXISTS idx_dispatch_entries_report_id_order ON public.dispatch_entries (report_id, display_order);
CREATE INDEX IF NOT EXISTS idx_reporters_display_order ON public.reporters (display_order);