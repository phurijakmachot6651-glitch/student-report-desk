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
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          <Link to="/admin" className="flex items-center gap-2 font-bold shrink-0">
            <img
              src="/tiger_logo.png"
              alt="Tiger Logo"
              className="h-7 w-7 object-contain rounded-full border border-primary/20"
            />
            <span className="hidden xs:inline">แอดมิน</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <span className="hidden md:inline text-xs text-muted-foreground truncate max-w-[160px]">
              {email}
            </span>
            <Button variant="ghost" size="sm" onClick={logout} className="shrink-0">
              <LogOut className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">ออก</span>
            </Button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-2 sm:px-4 pb-2 flex items-center gap-1 text-sm overflow-x-auto">
          <Link
            to="/admin"
            className="px-3 py-1.5 rounded-md hover:bg-secondary/40 whitespace-nowrap"
            activeProps={{
              className: "px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium whitespace-nowrap",
            }}
          >
            สรุปยอด
          </Link>
          <Link
            to="/admin/report"
            className="px-3 py-1.5 rounded-md hover:bg-secondary/40 whitespace-nowrap"
            activeProps={{
              className: "px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium whitespace-nowrap",
            }}
          >
            ส่งออกรายงาน
          </Link>
          <Link
            to="/admin/settings"
            className="px-3 py-1.5 rounded-md hover:bg-secondary/40 whitespace-nowrap"
            activeProps={{
              className: "px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium whitespace-nowrap",
            }}
          >
            ตั้งค่า
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
