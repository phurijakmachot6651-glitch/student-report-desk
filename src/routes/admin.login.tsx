import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { registerAdmin } from "@/lib/api/admin-auth.functions";

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
});

function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("เข้าสู่ระบบสำเร็จ");
    nav({ to: "/admin" });
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await registerAdmin({ data: { email, password, secretCode } }).catch(
      (error) => ({ error }),
    );
    setLoading(false);
    if ("error" in result) return toast.error(result.error.message || "สมัครไม่สำเร็จ");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast.error(error.message);
    toast.success("สมัครแอดมินสำเร็จ");
    nav({ to: "/admin" });
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-b from-primary/10 via-background to-secondary/20 px-3 py-6 sm:p-4">
      <div className="tiger-stripes pointer-events-none absolute inset-0 opacity-40" />
      <div className="reveal-pop relative w-full max-w-sm">
        <Link
          to="/"
          className="mb-4 inline-flex h-10 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> หน้าแรก
        </Link>
        <Card className="overflow-hidden rounded-xl shadow-lg">
          <div className="gold-gradient h-1.5 w-full" />
          <CardHeader className="flex flex-col items-center p-4 text-center sm:p-6">
            <div className="mb-2">
              <img
                src="/dragon_logo.png"
                alt="Dragon Logo"
                className="float-soft h-16 w-16 rounded-full border-2 border-primary/30 object-contain shadow-sm ring-4 ring-primary/10"
              />
            </div>
            <CardTitle className="gold-text text-xl">แอดมิน</CardTitle>
            <CardDescription>ระบบจัดทำยอดกำลังพล นรต.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <Tabs defaultValue="login">
              <TabsList className="grid grid-cols-2 w-full mb-4">
                <TabsTrigger value="login">เข้าสู่ระบบ</TabsTrigger>
                <TabsTrigger value="signup">สมัคร</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={onLogin} className="space-y-3">
                  <div>
                    <Label>อีเมล</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>รหัสผ่าน</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={onSignup} className="space-y-3">
                  <div>
                    <Label>อีเมล</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)</Label>
                    <Input
                      type="password"
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Secret code</Label>
                    <Input
                      type="password"
                      value={secretCode}
                      onChange={(e) => setSecretCode(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "กำลังสมัคร..." : "สมัครและเข้าสู่ระบบ"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
