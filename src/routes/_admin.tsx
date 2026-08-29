import { createFileRoute, Outlet, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_admin")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/admin/login" });
    }
    // Check admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin");
    if (!roles || roles.length === 0) {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    nav({ to: "/admin/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-primary/15 bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <div className="flex items-center justify-between gap-3">
              <Link to="/admin" className="flex min-w-0 items-center gap-2 font-bold">
                <img
                  src="/dragon_logo.png"
                  alt="Dragon Logo"
                  className="h-8 w-8 shrink-0 rounded-full border border-primary/30 object-contain ring-2 ring-primary/10"
                />
                <span className="gold-text truncate text-lg">แอดมิน</span>
              </Link>
              <div className="flex items-center gap-1 md:hidden">
                <ThemeToggle />
                <Button variant="ghost" size="sm" onClick={logout}>
                  <LogOut className="h-4 w-4 mr-1" /> ออก
                </Button>
              </div>
            </div>
            <nav className="-mx-3 flex items-center gap-1 overflow-x-auto px-3 pb-1 text-sm sm:mx-0 sm:px-0 md:pb-0">
              <Link
                to="/admin"
                className="relative flex h-10 shrink-0 items-center rounded-md px-3 transition-colors hover:bg-secondary/40"
                activeProps={{
                  className:
                    "relative flex h-10 shrink-0 items-center rounded-md bg-primary/15 px-3 font-semibold text-primary after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                }}
              >
                สรุปยอด
              </Link>
              <Link
                to="/admin/report"
                className="relative flex h-10 shrink-0 items-center rounded-md px-3 transition-colors hover:bg-secondary/40"
                activeProps={{
                  className:
                    "relative flex h-10 shrink-0 items-center rounded-md bg-primary/15 px-3 font-semibold text-primary after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                }}
              >
                ส่งออกรายงาน
              </Link>
              <Link
                to="/admin/settings"
                className="relative flex h-10 shrink-0 items-center rounded-md px-3 transition-colors hover:bg-secondary/40"
                activeProps={{
                  className:
                    "relative flex h-10 shrink-0 items-center rounded-md bg-primary/15 px-3 font-semibold text-primary after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                }}
              >
                ตั้งค่า
              </Link>
            </nav>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1" /> ออก
            </Button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
