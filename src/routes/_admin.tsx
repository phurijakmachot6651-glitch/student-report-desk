import { createFileRoute, Outlet, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Shield, LogOut } from "lucide-react";

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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="flex items-center gap-2 font-bold">
              <Shield className="h-5 w-5 text-primary" />
              แอดมิน
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link to="/admin" className="px-3 py-1.5 rounded hover:bg-slate-100" activeProps={{ className: "px-3 py-1.5 rounded bg-slate-100 font-medium" }}>
                สรุปยอด
              </Link>
              <Link to="/admin/report" className="px-3 py-1.5 rounded hover:bg-slate-100" activeProps={{ className: "px-3 py-1.5 rounded bg-slate-100 font-medium" }}>
                ส่งออกรายงาน
              </Link>
              <Link to="/admin/settings" className="px-3 py-1.5 rounded hover:bg-slate-100" activeProps={{ className: "px-3 py-1.5 rounded bg-slate-100 font-medium" }}>
                ตั้งค่า
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
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
