-- Keep report-time rows readable on public pages after admins change them.

GRANT SELECT ON public.app_settings TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view report time settings" ON public.app_settings;

CREATE POLICY "Public can view report time settings" ON public.app_settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('active_report_time', 'report_times'));
