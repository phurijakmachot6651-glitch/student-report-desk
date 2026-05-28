import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  cleanReportEntries,
  todayISO,
  type DispatchCategory,
  type Entry,
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
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,full_strength")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: report } = useQuery({
    queryKey: ["report", id, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select(
          "id,reporter_name,reporter_position,report_time,dispatch_entries(id,category,cadet_name,reason,location,subcategory,count,display_order)",
        )
        .eq("company_id", id)
        .eq("report_date", date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (report) {
      setReporterName(report.reporter_name || "");
      setReporterPosition(report.reporter_position || "");
      setReportTime(report.report_time || "05.45");
      setEntries(
        (report.dispatch_entries || []).map((entry: any) => ({
          id: entry.id,
          category: entry.category,
          cadet_name: entry.cadet_name,
          reason: entry.reason,
          location: entry.location,
          subcategory: entry.subcategory,
          count: entry.count,
        })),
      );
    } else {
      setReporterName("");
      setReporterPosition("");
      setReportTime("05.45");
      setEntries([]);
    }
  }, [report?.id]);

  const addEntry = (category: DispatchCategory) => {
    setEntries((prev) => [
      ...prev,
      {
        _local: crypto.randomUUID(),
        category,
        cadet_name: "",
        reason: "",
        location: "",
        subcategory: "",
        count: 1,
      },
    ]);
  };

  const updateEntry = (idx: number, patch: Partial<EntryRow>) => {
    setEntries((prev) => prev.map((entry, i) => (i === idx ? { ...entry, ...patch } : entry)));
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: savedReport, error: reportError } = await supabase
        .from("daily_reports")
        .upsert(
          {
            company_id: id,
            report_date: date,
            reporter_name: reporterName,
            reporter_position: reporterPosition,
            report_time: reportTime,
          },
          { onConflict: "company_id,report_date" },
        )
        .select()
        .single();
      if (reportError) throw reportError;

      const { error: deleteError } = await supabase
        .from("dispatch_entries")
        .delete()
        .eq("report_id", savedReport.id);
      if (deleteError) throw deleteError;

      const cleanedEntries = cleanReportEntries(entries);
      if (cleanedEntries.length > 0) {
        const { error: entriesError } = await supabase.from("dispatch_entries").insert(
          cleanedEntries.map((entry, display_order) => ({
            report_id: savedReport.id,
            category: entry.category,
            cadet_name: entry.cadet_name,
            reason: entry.reason,
            location: entry.location,
            subcategory: entry.subcategory,
            count: entry.count,
            display_order,
          })),
        );
        if (entriesError) throw entriesError;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["report", id, date] });
    },
    onError: (error: any) => toast.error(error.message || "บันทึกไม่สำเร็จ"),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
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
              <Input
                value={reportTime}
                onChange={(e) => setReportTime(e.target.value)}
                placeholder="05.45"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>ชื่อผู้ควบคุมแถว</Label>
              <Input
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="นรต.วิจัย กรณี"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>เลขที่ในหมวด</Label>
              <Input
                value={reporterPosition}
                onChange={(e) => setReporterPosition(e.target.value)}
                placeholder="๐"
              />
            </div>
          </CardContent>
        </Card>

        {CATEGORY_ORDER.map((category) => {
          const list = entries
            .map((entry, i) => ({ entry, i }))
            .filter((item) => item.entry.category === category);
          return (
            <Card key={category}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">📍 {CATEGORY_LABELS[category]}</CardTitle>
                <Button size="sm" variant="outline" onClick={() => addEntry(category)}>
                  <Plus className="h-4 w-4 mr-1" /> เพิ่ม
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {list.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีรายการ</p>}
                {list.map(({ entry, i }) => (
                  <div
                    key={entry.id ?? entry._local}
                    className="border rounded-md p-3 space-y-2 bg-muted/30"
                  >
                    {category === "other" ? (
                      <div className="grid grid-cols-[1fr_100px_auto] gap-2">
                        <Input
                          placeholder="หัวข้อ เช่น โปโล"
                          value={entry.subcategory}
                          onChange={(event) => updateEntry(i, { subcategory: event.target.value })}
                        />
                        <Input
                          type="number"
                          min={0}
                          value={entry.count}
                          onChange={(event) =>
                            updateEntry(i, { count: Number(event.target.value) })
                          }
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
                            placeholder="ชื่อ เช่น วิจัย ก."
                            value={entry.cadet_name}
                            onChange={(event) => updateEntry(i, { cadet_name: event.target.value })}
                          />
                          <Button size="icon" variant="ghost" onClick={() => removeEntry(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <Input
                            placeholder="สาเหตุ"
                            value={entry.reason}
                            onChange={(event) => updateEntry(i, { reason: event.target.value })}
                          />
                          <Input
                            placeholder="สถานที่"
                            value={entry.location}
                            onChange={(event) => updateEntry(i, { location: event.target.value })}
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
        </div>
      </main>
    </div>
  );
}
