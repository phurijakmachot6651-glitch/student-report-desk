
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Companies (9 platoons)
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  full_strength INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO anon, authenticated;
GRANT UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view companies" ON public.companies
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can update companies" ON public.companies
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dispatch category enum
CREATE TYPE public.dispatch_category AS ENUM ('sick','leave','absent','official','suspended','other');

-- Daily reports
CREATE TABLE public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  reporter_name TEXT NOT NULL DEFAULT '',
  reporter_position TEXT NOT NULL DEFAULT '',
  report_time TEXT NOT NULL DEFAULT '05.45',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, report_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO anon, authenticated;
GRANT ALL ON public.daily_reports TO service_role;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view reports" ON public.daily_reports
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can insert reports" ON public.daily_reports
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update reports" ON public.daily_reports
  FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Admins can delete reports" ON public.daily_reports
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dispatch entries
CREATE TABLE public.dispatch_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  category public.dispatch_category NOT NULL,
  cadet_name TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  subcategory TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_entries TO anon, authenticated;
GRANT ALL ON public.dispatch_entries TO service_role;
ALTER TABLE public.dispatch_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view entries" ON public.dispatch_entries
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can insert entries" ON public.dispatch_entries
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update entries" ON public.dispatch_entries
  FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Public can delete entries" ON public.dispatch_entries
  FOR DELETE TO anon, authenticated USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed 9 companies
INSERT INTO public.companies (name, full_strength, display_order) VALUES
  ('หมวด ๑', 36, 1),
  ('หมวด ๒', 36, 2),
  ('หมวด ๓', 36, 3),
  ('หมวด ๔', 36, 4),
  ('หมวด ๕', 36, 5),
  ('หมวด ๖', 36, 6),
  ('หมวด ๗', 36, 7),
  ('หมวด ๘', 36, 8),
  ('หมวด ๙', 36, 9);
