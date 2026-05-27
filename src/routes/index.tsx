import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ระบบจัดทำยอดกำลังพล นรต." },
      { name: "description", content: "ระบบจัดทำยอดกำลังพลนักเรียนนายร้อยตำรวจ" },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: companies, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="font-bold text-lg">ยอดกำลังพล นรต.</h1>
          </div>
          <Link to="/admin/login">
            <Button variant="outline" size="sm">เข้าสู่ระบบแอดมิน</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold tracking-tight">เลือกหมวดเพื่อจำหน่ายยอด</h2>
          <p className="text-muted-foreground mt-2">เลือกหมวดของท่านเพื่อกรอกยอดกำลังพลประจำวัน</p>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground">กำลังโหลด...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {companies?.map((c) => (
              <Link key={c.id} to="/company/$id" params={{ id: c.id }}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer hover:border-primary">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      {c.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">ยอดเต็ม {c.full_strength} นาย</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
