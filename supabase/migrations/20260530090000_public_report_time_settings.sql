-- Allow public pages to read only the report-time settings needed to build row selectors.

GRANT SELECT ON public.app_settings TO anon;

CREATE POLICY "Public can view report time settings" ON public.app_settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('active_report_time', 'report_times'));
