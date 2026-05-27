import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_LABELS, CATEGORY_ORDER, buildReportText, parseISODate,
  todayISO, type DispatchCategory, type Entry,
} from "@/lib/thai";

export const Route = createFileRoute("/company/$id")({
  component: CompanyPage,
});

type EntryRow = Entry & { id?: string; _local?: string };

function CompanyPage() {
  const { id } = useParams({ from: "/company/$id" });
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [reporterName, setReporterName] = useState("");
  const [reporterPosition, setReporterPosition] = useState("");
  const [reportTime, setReportTime] = useState("05.45");
  const [entries, setEntries] = useState<EntryRow[]>([]);

  const { data: company } = useQuery({
    queryKey: ["company", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: report } = useQuery({
    queryKey: ["report", id, date],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_reports")
        .select("*, dispatch_entries(*)")
        .eq("company_id", id)
        .eq("report_date", date)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (report) {
      setReporterName(report.reporter_name || "");
      setReporterPosition(report.reporter_position || "");
      setReportTime(report.report_time || "05.45");
      const es: EntryRow[] = (report.dispatch_entries || []).map((e: any) => ({
        id: e.id,
        category: e.category,
        cadet_name: e.cadet_name,
        reason: e.reason,
        location: e.location,
        subcategory: e.subcategory,
        count: e.count,
      }));
      setEntries(es);
    } else {
      setReporterName("");
      setReporterPosition("");
      setReportTime("05.45");
      setEntries([]);
    }
  }, [report?.id]);

  const addEntry = (cat: DispatchCategory) => {
    setEntries((prev) => [
      ...prev,
      {
        _local: crypto.randomUUID(),
        category: cat,
        cadet_name: "",
        reason: "",
        location: "",
        subcategory: "",
        count: 1,
      },
    ]);
  };

  const updateEntry = (idx: number, patch: Partial<EntryRow>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = useMutation({
    mutationFn: async () => {
      // Upsert report
      const { data: r, error: rErr } = await supabase
        .from("daily_reports")
        .upsert(
          {
            company_id: id,
            report_date: date,
            reporter_name: reporterName,
            reporter_position: reporterPosition,
            report_time: reportTime,
          },
          { onConflict: "company_id,report_date" }
        )
        .select()
        .single();
      if (rErr) throw rErr;

      // Replace entries
      await supabase.from("dispatch_entries").delete().eq("report_id", r.id);
      if (entries.length > 0) {
        const { error: eErr } = await supabase.from("dispatch_entries").insert(
          entries.map((e, i) => ({
            report_id: r.id,
            category: e.category,
            cadet_name: e.cadet_name,
            reason: e.reason,
            location: e.location,
            subcategory: e.subcategory,
            count: e.count,
            display_order: i,
          }))
        );
        if (eErr) throw eErr;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["report", id, date] });
    },
    onError: (e: any) => toast.error(e.message || "บันทึกไม่สำเร็จ"),
  });

  const reportText = useMemo(() => {
    if (!company) return "";
    return buildReportText({
      companyName: company.name,
      fullStrength: company.full_strength,
      reportDate: parseISODate(date),
      reporterName,
      reporterPosition: reporterPosition ? `เลขที่ในหมวด ${reporterPosition}` : "-",
      reportTime,
      entries,
    });
  }, [company, date, reporterName, reporterPosition, reportTime, entries]);

  const copy = async () => {
    await navigator.clipboard.writeText(reportText);
    toast.success("คัดลอกคำรายงานแล้ว");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> กลับ
          </Link>
          <h1 className="font-bold">{company?.name}</h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ข้อมูลทั่วไป</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>วันที่</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>เวลารายงาน</Label>
              <Input value={reportTime} onChange={(e) => setReportTime(e.target.value)} placeholder="05.45" />
            </div>
            <div className="sm:col-span-2">
              <Label>ชื่อผู้ควบคุมแถว</Label>
              <Input value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="นรต.ชนสิษฎ์ ทองย่อน" />
            </div>
            <div className="sm:col-span-2">
              <Label>เลขที่ในหมวด</Label>
              <Input value={reporterPosition} onChange={(e) => setReporterPosition(e.target.value)} placeholder="๑" />
            </div>
          </CardContent>
        </Card>

        {CATEGORY_ORDER.map((cat) => {
          const list = entries.map((e, i) => ({ e, i })).filter((x) => x.e.category === cat);
          return (
            <Card key={cat}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">📍 {CATEGORY_LABELS[cat]}</CardTitle>
                <Button size="sm" variant="outline" onClick={() => addEntry(cat)}>
                  <Plus className="h-4 w-4 mr-1" /> เพิ่ม
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {list.length === 0 && (
                  <p className="text-sm text-muted-foreground">ไม่มีรายการ</p>
                )}
                {list.map(({ e, i }) => (
                  <div key={e.id ?? e._local} className="border rounded-md p-3 space-y-2 bg-slate-50">
                    {cat === "other" ? (
                      <div className="grid grid-cols-[1fr_100px_auto] gap-2">
                        <Input
                          placeholder="หัวข้อ เช่น โปโล"
                          value={e.subcategory}
                          onChange={(ev) => updateEntry(i, { subcategory: ev.target.value })}
                        />
                        <Input
                          type="number"
                          min={0}
                          value={e.count}
                          onChange={(ev) => updateEntry(i, { count: Number(ev.target.value) })}
                          placeholder="จำนวน"
                        />
                        <Button size="icon" variant="ghost" onClick={() => removeEntry(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <Input
                            placeholder="ชื่อ เช่น ชยานันท์ พ."
                            value={e.cadet_name}
                            onChange={(ev) => updateEntry(i, { cadet_name: ev.target.value })}
                          />
                          <Button size="icon" variant="ghost" onClick={() => removeEntry(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <Input
                            placeholder="สาเหตุ"
                            value={e.reason}
                            onChange={(ev) => updateEntry(i, { reason: ev.target.value })}
                          />
                          <Input
                            placeholder="สถานที่"
                            value={e.location}
                            onChange={(ev) => updateEntry(i, { location: ev.target.value })}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        <div className="flex flex-wrap gap-2 sticky bottom-4 bg-white p-3 border rounded-lg shadow-lg">
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1">
            {save.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
          <Button variant="outline" onClick={copy}>
            <Copy className="h-4 w-4 mr-1" /> คัดลอก
          </Button>
        </div>
      </main>
    </div>
  );
}
