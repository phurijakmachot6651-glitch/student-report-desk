import { createFileRoute, Outlet, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <div className="flex items-center justify-between gap-3">
              <Link to="/admin" className="flex min-w-0 items-center gap-2 font-bold">
                <img
                  src="/tiger_logo.png"
                  alt="Tiger Logo"
                  className="h-7 w-7 shrink-0 rounded-full border border-primary/20 object-contain"
                />
                <span className="truncate">แอดมิน</span>
              </Link>
              <Button variant="ghost" size="sm" onClick={logout} className="md:hidden">
                <LogOut className="h-4 w-4 mr-1" /> ออก
              </Button>
            </div>
            <nav className="-mx-3 flex items-center gap-1 overflow-x-auto px-3 pb-1 text-sm sm:mx-0 sm:px-0 md:pb-0">
              <Link
                to="/admin"
                className="flex h-10 shrink-0 items-center rounded-md px-3 hover:bg-secondary/40"
                activeProps={{
                  className:
                    "flex h-10 shrink-0 items-center rounded-md bg-secondary/60 px-3 font-medium",
                }}
              >
                สรุปยอด
              </Link>
              <Link
                to="/admin/report"
                className="flex h-10 shrink-0 items-center rounded-md px-3 hover:bg-secondary/40"
                activeProps={{
                  className:
                    "flex h-10 shrink-0 items-center rounded-md bg-secondary/60 px-3 font-medium",
                }}
              >
                ส่งออกรายงาน
              </Link>
              <Link
                to="/admin/settings"
                className="flex h-10 shrink-0 items-center rounded-md px-3 hover:bg-secondary/40"
                activeProps={{
                  className:
                    "flex h-10 shrink-0 items-center rounded-md bg-secondary/60 px-3 font-medium",
                }}
              >
                ตั้งค่า
              </Link>
            </nav>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
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
