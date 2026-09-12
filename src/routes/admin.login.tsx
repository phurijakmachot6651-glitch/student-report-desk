import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { registerAdmin } from "@/lib/api/admin-auth.functions";
import {
  getAdminAuthErrorMessage,
  getPasswordRecoveryRedirectUrl,
  hasPasswordRecoveryParams,
  isAdminRegistrationConfigurationError,
} from "@/lib/admin-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
});

function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน";

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-11", className)} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute inset-y-0 right-0 rounded-l-none text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => setVisible((current) => !current)}
        aria-label={toggleLabel}
        aria-pressed={visible}
        title={toggleLabel}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}

function AdminLogin() {
  const nav = useNavigate();
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const getAuthErrorMessage = (error: unknown, fallback: string) => {
    const message = getAdminAuthErrorMessage(error);
    if (
      /SUPABASE_(SECRET_KEY|SERVICE_ROLE_KEY|URL)|Invalid API key|invalid api key/i.test(message)
    ) {
      return "ระบบสมัครแอดมินยังไม่พร้อม: กรุณาตั้งค่า service key ของ Supabase ให้ตรงกับโปรเจกต์ แล้วลองใหม่";
    }
    if (/weak_password|Password.*weak|known to be weak/i.test(message)) {
      return "รหัสผ่านคาดเดาง่ายเกินไป กรุณาตั้งรหัสผ่านใหม่ที่เดายากขึ้น";
    }
    if (/already registered|already exists|มีผู้ใช้งานอีเมลนี้แล้ว/i.test(message)) {
      return "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านเดิม";
    }
    if (/invalid login credentials|invalid credentials|invalid password/i.test(message)) {
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง หากจำรหัสผ่านไม่ได้ ให้กดปุ่มลืมรหัสผ่าน / ตั้งรหัสใหม่ แล้วตรวจสอบอีเมลอีกครั้ง";
    }
    if (/email not confirmed/i.test(message)) {
      return "อีเมลนี้ยังไม่ได้ยืนยัน กรุณาตรวจสอบอีเมลยืนยันก่อนเข้าสู่ระบบ";
    }
    if (/too many requests|rate limit/i.test(message)) {
      return "ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
    }
    if (/Invalid admin registration secret/i.test(message)) {
      return "Secret code ไม่ถูกต้อง";
    }
    return message || fallback;
  };

  useEffect(() => {
    const checkRecoveryUrl = () => {
      setRecoveryMode(hasPasswordRecoveryParams(window.location));
    };

    checkRecoveryUrl();
    window.addEventListener("hashchange", checkRecoveryUrl);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });

    return () => {
      window.removeEventListener("hashchange", checkRecoveryUrl);
      data.subscription.unsubscribe();
    };
  }, []);

  const onRequestPasswordReset = async () => {
    const address = loginEmail.trim().toLowerCase();
    if (!address) return toast.error("กรุณากรอกอีเมลก่อน");

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: getPasswordRecoveryRedirectUrl(),
      });
      if (error) throw error;
      toast.success("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลแล้ว");
    } catch (error) {
      toast.error(getAuthErrorMessage(error, "ส่งลิงก์ตั้งรหัสผ่านไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  };

  const onUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
      if (error) throw error;
      setLoginPassword(recoveryPassword);
      setRecoveryPassword("");
      setRecoveryMode(false);
      window.history.replaceState({}, document.title, window.location.pathname);
      toast.success("ตั้งรหัสผ่านใหม่สำเร็จ");
    } catch (error) {
      toast.error(getAuthErrorMessage(error, "ตั้งรหัสผ่านใหม่ไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });
      if (error) return toast.error(getAuthErrorMessage(error, "เข้าสู่ระบบไม่สำเร็จ"));
      toast.success("เข้าสู่ระบบสำเร็จ");
      nav({ to: "/admin" });
    } catch (error) {
      toast.error(getAuthErrorMessage(error, "เข้าสู่ระบบไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword !== signupPasswordConfirm) {
      return toast.error("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
    }

    const address = signupEmail.trim().toLowerCase();
    setLoading(true);
    try {
      await registerAdmin({
        data: { email: address, password: signupPassword, secretCode: secretCode.trim() },
      });

      const { error } = await supabase.auth.signInWithPassword({
        email: address,
        password: signupPassword,
      });
      if (error) return toast.error(getAuthErrorMessage(error, "เข้าสู่ระบบหลังสมัครไม่สำเร็จ"));
      toast.success("สมัครแอดมินสำเร็จ");
      nav({ to: "/admin" });
    } catch (error) {
      if (isAdminRegistrationConfigurationError(error)) {
        return toast.error(
          "สมัครแอดมินไม่ได้: กรุณาตั้งค่า SUPABASE_SECRET_KEY หรือ SUPABASE_SERVICE_ROLE_KEY ให้ตรงกับโปรเจกต์เดียวกับ SUPABASE_URL แล้วลองใหม่",
        );
      }
      if (/already registered|already exists|user_already_exists/i.test(String(error))) {
        setLoginEmail(address);
        setActiveTab("login");
        return toast.error("อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบหรือตั้งรหัสผ่านใหม่");
      }
      toast.error(getAuthErrorMessage(error, "สมัครแอดมินไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-x-hidden overflow-y-auto bg-[#001c08] px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:p-4">
      <div
        className="pointer-events-none fixed inset-0 scale-110 bg-cover bg-center opacity-35 blur-md"
        style={{ backgroundImage: "url(/dragon_logo.png)" }}
      />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(0,132,49,0.08),rgba(0,12,5,0.72)_72%,rgba(0,7,3,0.94))]" />
      <img
        src="/dragon_logo.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[43%] w-[min(96vw,70svh)] max-w-[620px] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.3] drop-shadow-[0_0_36px_rgba(0,255,90,0.28)]"
      />
      <div className="tiger-stripes pointer-events-none fixed inset-0 opacity-15" />
      <div className="reveal-pop relative my-auto w-full max-w-sm">
        <Link
          to="/"
          className="mb-4 inline-flex h-10 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> หน้าแรก
        </Link>
        <Card className="overflow-hidden rounded-2xl border-white/15 bg-card/90 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
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
            <CardDescription>เช็คยอดกองร้อยที่ 4</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {recoveryMode ? (
              <form onSubmit={onUpdatePassword} className="space-y-3">
                <div>
                  <Label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</Label>
                  <PasswordInput
                    minLength={6}
                    autoComplete="new-password"
                    value={recoveryPassword}
                    onChange={(e) => setRecoveryPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "กำลังตั้งรหัสผ่าน..." : "ตั้งรหัสผ่านใหม่"}
                </Button>
              </form>
            ) : (
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as "login" | "signup")}
              >
                <TabsList className="mb-4 grid w-full grid-cols-2">
                  <TabsTrigger value="login">เข้าสู่ระบบ</TabsTrigger>
                  <TabsTrigger value="signup">สมัคร</TabsTrigger>
                </TabsList>
                <TabsContent value="login">
                  <form onSubmit={onLogin} className="space-y-3">
                    <div>
                      <Label>อีเมล</Label>
                      <Input
                        type="email"
                        autoComplete="username"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label>รหัสผ่าน</Label>
                      <PasswordInput
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto w-full p-0 text-xs"
                      onClick={onRequestPasswordReset}
                      disabled={loading}
                    >
                      ลืมรหัสผ่าน / ตั้งรหัสใหม่
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup">
                  <form onSubmit={onSignup} className="space-y-3">
                    <div>
                      <Label>อีเมล</Label>
                      <Input
                        type="email"
                        autoComplete="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label>รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)</Label>
                      <PasswordInput
                        minLength={6}
                        autoComplete="new-password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label>ยืนยันรหัสผ่าน</Label>
                      <PasswordInput
                        minLength={6}
                        autoComplete="new-password"
                        value={signupPasswordConfirm}
                        onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label>Secret code</Label>
                      <PasswordInput
                        autoComplete="off"
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
