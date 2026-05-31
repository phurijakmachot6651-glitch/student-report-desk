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
import { DEFAULT_REPORT_TIME, isValidReportTime, normalizeReportTime } from "@/lib/report-rows";
import { fetchReportTimes, saveReportTimes } from "@/lib/report-settings";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: Settings,
});

type CompanyRow = { id: string; name: string; full_strength: number };
type ReporterRow = { id?: string; _local?: string; name: string };
type ReportTimeRow = { _local: string; time: string };

const REPORT_TIME_STEP_MINUTES = 60;
const REPORT_TIME_DAY_MINUTES = 24 * 60;

function parseReportTimeMinutes(value: string): number | null {
  if (!isValidReportTime(value)) return null;

  const [hours, minutes] = normalizeReportTime(value).split(".").map(Number);
  return hours * 60 + minutes;
}

function formatReportTimeMinutes(minutes: number): string {
  const normalizedMinutes =
    ((minutes % REPORT_TIME_DAY_MINUTES) + REPORT_TIME_DAY_MINUTES) % REPORT_TIME_DAY_MINUTES;
  const hours = Math.floor(normalizedMinutes / 60);
  const remainingMinutes = normalizedMinutes % 60;

  return `${String(hours).padStart(2, "0")}.${String(remainingMinutes).padStart(2, "0")}`;
}

function normalizeEditableReportTime(value: string): string {
  const trimmedValue = value.trim();
  return trimmedValue ? normalizeReportTime(trimmedValue) : "";
}

function createReportTimeRow(rows: ReportTimeRow[]): ReportTimeRow {
  const usedTimes = new Set(
    rows
      .map((row) => normalizeEditableReportTime(row.time))
      .filter((time) => isValidReportTime(time))
      .map((time) => normalizeReportTime(time)),
  );
  const lastValidMinutes =
    [...rows]
      .reverse()
      .map((row) => parseReportTimeMinutes(row.time))
      .find((minutes): minutes is number => minutes !== null) ??
    parseReportTimeMinutes(DEFAULT_REPORT_TIME) ??
    0;

  for (
    let offset = REPORT_TIME_STEP_MINUTES;
    offset <= REPORT_TIME_DAY_MINUTES;
    offset += REPORT_TIME_STEP_MINUTES
  ) {
    const candidate = formatReportTimeMinutes(lastValidMinutes + offset);

    if (!usedTimes.has(candidate)) {
      return { _local: crypto.randomUUID(), time: candidate };
    }
  }

  return { _local: crypto.randomUUID(), time: "" };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function Settings() {
  const qc = useQueryClient();
  const [companyRows, setCompanyRows] = useState<CompanyRow[]>([]);
  const [reporterRows, setReporterRows] = useState<ReporterRow[]>([]);
  const [reportTimeRows, setReportTimeRows] = useState<ReportTimeRow[]>([]);
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

  const { data: reportTimes } = useQuery({
    queryKey: ["report-times"],
    queryFn: () => fetchReportTimes(supabase),
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

  useEffect(() => {
    if (reportTimes) {
      setReportTimeRows(reportTimes.map((time) => ({ _local: crypto.randomUUID(), time })));
    }
  }, [reportTimes]);

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
    onError: (error: unknown) => toast.error(getErrorMessage(error, "บันทึกหมวดไม่สำเร็จ")),
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
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "บันทึกรายชื่อผู้รายงานไม่สำเร็จ")),
  });

  const saveTimes = useMutation({
    mutationFn: async () => {
      const editableTimes = reportTimeRows.map((row) => normalizeEditableReportTime(row.time));
      const invalidTimes = editableTimes.filter((time) => time && !isValidReportTime(time));
      const rows = editableTimes
        .filter((time) => time.trim())
        .map((time) => normalizeReportTime(time));
      const duplicateTimes = rows.filter((time, index) => rows.indexOf(time) !== index);

      if (invalidTimes.length > 0) {
        throw new Error(`รูปแบบเวลาไม่ถูกต้อง: ${invalidTimes.join(", ")}`);
      }

      if (duplicateTimes.length > 0) {
        throw new Error(`เวลาแถวซ้ำกัน: ${[...new Set(duplicateTimes)].join(", ")}`);
      }

      return saveReportTimes(supabase, rows.length > 0 ? rows : [DEFAULT_REPORT_TIME]);
    },
    onSuccess: (savedTimes) => {
      toast.success(`บันทึกเวลาแถวแล้ว (${savedTimes.join(", ")})`);
      setReportTimeRows(savedTimes.map((time) => ({ _local: crypto.randomUUID(), time })));
      qc.invalidateQueries({ queryKey: ["report-times"] });
      qc.invalidateQueries({ queryKey: ["active-report-time"] });
      qc.invalidateQueries({ queryKey: ["company-report-times"] });
      qc.invalidateQueries({ queryKey: ["admin-report-times"] });
      qc.invalidateQueries({ queryKey: ["report-export-times"] });
      qc.invalidateQueries({ queryKey: ["home-summary"] });
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
      qc.invalidateQueries({ queryKey: ["report-export"] });
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "บันทึกเวลาแถวไม่สำเร็จ")),
  });

  const saveSecret = useMutation({
    mutationFn: async () => {
      await updateAdminRegisterSecret({ data: { newSecretCode } });
    },
    onSuccess: () => {
      toast.success("ตั้งค่า secret code แล้ว");
      setNewSecretCode("");
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "ตั้งค่า secret code ไม่สำเร็จ")),
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
    onError: (error: unknown) => toast.error(getErrorMessage(error, "ล้างข้อมูลไม่สำเร็จ")),
  });

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
      <Card className="rounded-lg">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle>ตั้งค่าหมวด</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {companyRows.map((r, i) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,1fr)_110px] gap-2 sm:grid-cols-[1fr_140px]"
            >
              <Input
                value={r.name}
                onChange={(e) =>
                  setCompanyRows((p) =>
                    p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
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
          <Button onClick={() => saveCompanies.mutate()} disabled={saveCompanies.isPending}>
            {saveCompanies.isPending ? "กำลังบันทึก..." : "บันทึกหมวด"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle>เวลาแถวสำหรับกรอกยอด</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          <p className="text-sm text-muted-foreground">
            แต่ละเวลาจะเป็นแถวให้ผู้ใช้เลือกกรอกยอด เช่น 05.45 หรือ 18.00
          </p>
          {reportTimeRows.map((row, i) => (
            <div key={row._local} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                value={row.time}
                onChange={(e) =>
                  setReportTimeRows((p) =>
                    p.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)),
                  )
                }
                onBlur={(e) =>
                  setReportTimeRows((p) =>
                    p.map((x, j) =>
                      j === i ? { ...x, time: normalizeEditableReportTime(e.target.value) } : x,
                    ),
                  )
                }
                placeholder="05.45"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setReportTimeRows((p) => p.filter((_, j) => j !== i))}
                disabled={reportTimeRows.length <= 1}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              variant="outline"
              onClick={() => setReportTimeRows((p) => [...p, createReportTimeRow(p)])}
            >
              <Plus className="h-4 w-4 mr-1" /> เพิ่มเวลา
            </Button>
            <Button onClick={() => saveTimes.mutate()} disabled={saveTimes.isPending}>
              {saveTimes.isPending ? "กำลังบันทึก..." : "บันทึกเวลาแถว"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle>รายชื่อผู้รายงาน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {reporterRows.map((r, i) => (
            <div key={r.id ?? r._local} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              variant="outline"
              onClick={() =>
                setReporterRows((p) => [...p, { _local: crypto.randomUUID(), name: "" }])
              }
            >
              <Plus className="h-4 w-4 mr-1" /> เพิ่มชื่อ
            </Button>
            <Button onClick={() => saveReporters.mutate()} disabled={saveReporters.isPending}>
              {saveReporters.isPending ? "กำลังบันทึก..." : "บันทึกรายชื่อ"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle>Secret code สมัครแอดมิน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
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
          >
            {saveSecret.isPending ? "กำลังบันทึก..." : "ตั้งค่า secret code"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-destructive/50">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-destructive">โซนอันตราย</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          <p className="text-sm text-muted-foreground">
            ใช้สำหรับล้างข้อมูลรายงานที่ทุกหมวดกรอกไว้ทั้งหมด ทุกวัน และทุกเวลา โดยไม่ลบข้อมูลหมวด
            ยอดเต็ม รายชื่อผู้รายงาน หรือการตั้งค่า
          </p>
          <AlertDialog open={isResetOpen} onOpenChange={setIsResetOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={resetReports.isPending}>
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
