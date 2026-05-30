import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { updateAdminRegisterSecret } from "@/lib/api/admin-auth.functions";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: Settings,
});

type CompanyRow = { id: string; name: string; full_strength: number };
type ReporterRow = { id?: string; _local?: string; name: string };

function Settings() {
  const qc = useQueryClient();
  const [companyRows, setCompanyRows] = useState<CompanyRow[]>([]);
  const [reporterRows, setReporterRows] = useState<ReporterRow[]>([]);
  const [newSecretCode, setNewSecretCode] = useState("");
  const [isResetOpen, setIsResetOpen] = useState(false);

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,full_strength,display_order")
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: reporters } = useQuery({
    queryKey: ["reporters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reporters")
        .select("id,name,display_order")
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (companies)
      setCompanyRows(
        companies.map((c) => ({ id: c.id, name: c.name, full_strength: c.full_strength })),
      );
  }, [companies]);

  useEffect(() => {
    if (reporters) setReporterRows(reporters.map((r) => ({ id: r.id, name: r.name })));
  }, [reporters]);

  const saveCompanies = useMutation({
    mutationFn: async () => {
      await Promise.all(
        companyRows.map(async (row) => {
          const { error } = await supabase
            .from("companies")
            .update({ name: row.name.trim(), full_strength: row.full_strength })
            .eq("id", row.id);
          if (error) throw error;
        }),
      );
    },
    onSuccess: () => {
      toast.success("บันทึกหมวดแล้ว");
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveReporters = useMutation({
    mutationFn: async () => {
      const existingIds = new Set((reporters || []).map((r) => r.id));
      const rows = reporterRows
        .map((r, display_order) => ({ ...r, name: r.name.trim(), display_order }))
        .filter((r) => r.name.length > 0);
      const activeIds = new Set(rows.map((r) => r.id).filter(Boolean));
      const deletedIds = [...existingIds].filter((id) => !activeIds.has(id));

      if (deletedIds.length > 0) {
        const { error } = await supabase.from("reporters").delete().in("id", deletedIds);
        if (error) throw error;
      }

      const newRows = rows.filter((r) => !r.id);
      const existingRows = rows.filter((r) => r.id);

      if (newRows.length > 0) {
        const { error } = await supabase.from("reporters").insert(
          newRows.map((row) => ({
            name: row.name,
            display_order: row.display_order,
          })),
        );
        if (error) throw error;
      }

      if (existingRows.length > 0) {
        const { error } = await supabase.from("reporters").upsert(
          existingRows.map((row) => ({
            id: row.id,
            name: row.name,
            display_order: row.display_order,
          })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกรายชื่อผู้รายงานแล้ว");
      qc.invalidateQueries({ queryKey: ["reporters"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveSecret = useMutation({
    mutationFn: async () => {
      await updateAdminRegisterSecret({ data: { newSecretCode } });
    },
    onSuccess: () => {
      toast.success("ตั้งค่า secret code แล้ว");
      setNewSecretCode("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetReports = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("daily_reports").delete().not("id", "is", null);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ล้างข้อมูลที่กรอกทั้งหมดแล้ว");
      setIsResetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
      qc.invalidateQueries({ queryKey: ["report-export"] });
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["other-options"] });
    },
    onError: (error: any) => toast.error(error.message || "ล้างข้อมูลไม่สำเร็จ"),
  });

  return (
    <main className="mx-auto max-w-3xl px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">ตั้งค่าหมวด</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {companyRows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[1fr_110px] sm:grid-cols-[1fr_140px] gap-2">
              <Input
                value={r.name}
                onChange={(e) =>
                  setCompanyRows((p) =>
                    p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
                placeholder="ชื่อหมวด"
              />
              <Input
                type="number"
                value={r.full_strength}
                onChange={(e) =>
                  setCompanyRows((p) =>
                    p.map((x, j) =>
                      j === i ? { ...x, full_strength: Number(e.target.value) } : x,
                    ),
                  )
                }
                placeholder="ยอดเต็ม"
              />
            </div>
          ))}
          <Button
            onClick={() => saveCompanies.mutate()}
            disabled={saveCompanies.isPending}
            className="w-full sm:w-auto"
          >
            {saveCompanies.isPending ? "กำลังบันทึก..." : "บันทึกหมวด"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">รายชื่อผู้รายงาน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reporterRows.map((r, i) => (
            <div key={r.id ?? r._local} className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                value={r.name}
                onChange={(e) =>
                  setReporterRows((p) =>
                    p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
                placeholder="ชื่อผู้รายงาน"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setReporterRows((p) => p.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setReporterRows((p) => [...p, { _local: crypto.randomUUID(), name: "" }])
              }
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-1" /> เพิ่มชื่อ
            </Button>
            <Button
              onClick={() => saveReporters.mutate()}
              disabled={saveReporters.isPending}
              className="w-full sm:w-auto"
            >
              {saveReporters.isPending ? "กำลังบันทึก..." : "บันทึกรายชื่อ"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Secret code สมัครแอดมิน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Secret code ใหม่</Label>
            <Input
              type="password"
              value={newSecretCode}
              onChange={(e) => setNewSecretCode(e.target.value)}
              minLength={4}
            />
            <p className="text-xs text-muted-foreground mt-1">ค่าเริ่มต้นคือ 0000</p>
          </div>
          <Button
            onClick={() => saveSecret.mutate()}
            disabled={saveSecret.isPending || newSecretCode.trim().length < 4}
            className="w-full sm:w-auto"
          >
            {saveSecret.isPending ? "กำลังบันทึก..." : "ตั้งค่า secret code"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg text-destructive">โซนอันตราย</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ใช้สำหรับล้างข้อมูลรายงานที่ทุกหมวดกรอกไว้ทั้งหมด ทุกวัน และทุกเวลา โดยไม่ลบข้อมูลหมวด
            ยอดเต็ม รายชื่อผู้รายงาน หรือการตั้งค่า
          </p>
          <AlertDialog open={isResetOpen} onOpenChange={setIsResetOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={resetReports.isPending}
                className="w-full sm:w-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                ล้างข้อมูลทั้งหมด
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ล้างข้อมูลที่กรอกทั้งหมด?</AlertDialogTitle>
                <AlertDialogDescription>
                  คำสั่งนี้จะลบข้อมูลรายงานที่ทุกหมวดกรอกไว้ทุกวันทุกเวลา
                  และทำให้สถานะกลับเป็นยังไม่ส่ง โดยไม่ลบข้อมูลหมวด ยอดเต็ม รายชื่อผู้รายงาน
                  หรือการตั้งค่า
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={resetReports.isPending}>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={resetReports.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    resetReports.mutate();
                  }}
                >
                  {resetReports.isPending ? "กำลังล้าง..." : "ล้างทั้งหมด"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </main>
  );
}
