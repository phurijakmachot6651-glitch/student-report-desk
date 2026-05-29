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
  normalizeOtherSubcategory,
  todayISO,
  type DispatchCategory,
  type Entry,
} from "@/lib/thai";
import {
  DEFAULT_REPORT_TIME,
  decodeReportRows,
  encodeReportRows,
  getReportRow,
  getReportRowFromReports,
  normalizeReportTime,
  type ReportRowData,
} from "@/lib/report-rows";

export const Route = createFileRoute("/company/$id")({
  validateSearch: (search): { date?: string; time?: string } => ({
    date: typeof search.date === "string" ? search.date : undefined,
    time: typeof search.time === "string" ? search.time : undefined,
  }),
  component: CompanyPage,
});

type EntryRow = Entry & { id?: string; _local?: string };
type OtherOption = {
  name: string;
  count: number;
  companyNames: string[];
};

function CompanyPage() {
  const { id } = useParams({ from: "/company/$id" });
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [date, setDate] = useState(() => search.date || todayISO());
  const [reporterName, setReporterName] = useState("");
  const [reporterPosition, setReporterPosition] = useState("");
  const [reportTime, setReportTime] = useState(() => search.time || DEFAULT_REPORT_TIME);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const selectedReportTime = normalizeReportTime(reportTime);

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

  const { data: reports = [] } = useQuery({
    queryKey: ["report", id, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select(
          "id,reporter_name,reporter_position,report_time,dispatch_entries(id,category,cadet_name,reason,location,subcategory,count,display_order)",
        )
        .eq("company_id", id)
        .eq("report_date", date);
      if (error) throw error;
      return data || [];
    },
  });
  const currentReportMatch = getReportRowFromReports(reports as any[], selectedReportTime);
  const report = currentReportMatch?.report || reports[0] || null;

  const { data: otherOptions = [] } = useQuery({
    queryKey: ["other-options", id, date, selectedReportTime],
    queryFn: async (): Promise<OtherOption[]> => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select(
          "id,report_time,reporter_name,reporter_position,company_id,companies(name),dispatch_entries(category,cadet_name,reason,location,subcategory,count,display_order)",
        )
        .eq("report_date", date)
        .neq("company_id", id);
      if (error) throw error;

      const grouped = new Map<string, OtherOption>();

      (data || []).forEach((dailyReport: any) => {
        const companyName = dailyReport.companies?.name || "";
        const row = getReportRow(dailyReport, selectedReportTime);
        if (!row) return;

        row.entries.forEach((entry: any) => {
          if (entry.category !== "other") return;

          const name = normalizeOtherSubcategory(entry.subcategory || "");
          if (!name) return;

          const count = Number(entry.count) || 0;
          if (count <= 0) return;

          const current = grouped.get(name) || { name, count: 0, companyNames: [] };
          current.count += count;
          if (companyName && !current.companyNames.includes(companyName)) {
            current.companyNames.push(companyName);
          }
          grouped.set(name, current);
        });
      });

      return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
    },
  });

  useEffect(() => {
    const row = currentReportMatch?.row || null;

    if (row) {
      setReporterName(row.reporterName || "");
      setReporterPosition(row.reporterPosition || "");
      setEntries(
        row.entries.map((entry: any) => ({
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
      setEntries([]);
    }
  }, [date, currentReportMatch?.report.id, selectedReportTime]);

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

  const selectOtherSubcategory = (idx: number, subcategory: string) => {
    updateEntry(idx, { subcategory, count: Math.max(1, entries[idx]?.count || 1) });
  };

  const save = useMutation({
    mutationFn: async () => {
      const row: ReportRowData = {
        reportTime: selectedReportTime,
        reporterName,
        reporterPosition,
        entries: cleanReportEntries(entries),
      };
      const existingRows = decodeReportRows(report);
      const nextRows = [
        ...existingRows.filter(
          (existingRow) => normalizeReportTime(existingRow.reportTime) !== selectedReportTime,
        ),
        row,
      ].sort((a, b) => normalizeReportTime(a.reportTime).localeCompare(normalizeReportTime(b.reportTime)));
      const reportPayload = {
        company_id: id,
        report_date: date,
        reporter_name: nextRows[0]?.reporterName || "",
        reporter_position: nextRows[0]?.reporterPosition || "",
        report_time: nextRows[0]?.reportTime || selectedReportTime,
      };

      const reportResult = report
        ? await supabase
            .from("daily_reports")
            .update(reportPayload)
            .eq("id", report.id)
            .select()
            .single()
        : await supabase.from("daily_reports").insert(reportPayload).select().single();

      const { data: savedReport, error: reportError } = reportResult;
      if (reportError) throw reportError;

      const { error: deleteError } = await supabase
        .from("dispatch_entries")
        .delete()
        .eq("report_id", savedReport.id);
      if (deleteError) throw deleteError;

      const encodedEntries = encodeReportRows(nextRows);
      if (encodedEntries.length > 0) {
        const { error: entriesError } = await supabase.from("dispatch_entries").insert(
          encodedEntries.map((entry) => ({
            report_id: savedReport.id,
            category: entry.category,
            cadet_name: entry.cadet_name,
            reason: entry.reason,
            location: entry.location,
            subcategory: entry.subcategory,
            count: entry.count,
            display_order: entry.display_order,
          })),
        );
        if (entriesError) throw entriesError;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["report", id, date] });
      qc.invalidateQueries({ queryKey: ["other-options"] });
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
                      <>
                        <div className="grid grid-cols-[1fr_100px_auto] gap-2">
                          <Input
                            list={`other-options-${i}`}
                            placeholder="ภารกิจ(ไม่ต้องใส่ชื่อ)"
                            value={entry.subcategory}
                            onChange={(event) =>
                              updateEntry(i, { subcategory: event.target.value })
                            }
                          />
                          <datalist id={`other-options-${i}`}>
                            {otherOptions.map((option) => (
                              <option key={option.name} value={option.name} />
                            ))}
                          </datalist>
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

                        {otherOptions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {otherOptions.map((option) => {
                              const selected =
                                normalizeOtherSubcategory(entry.subcategory) === option.name;

                              return (
                                <Button
                                  key={option.name}
                                  type="button"
                                  size="sm"
                                  variant={selected ? "default" : "outline"}
                                  onClick={() => selectOtherSubcategory(i, option.name)}
                                  title={`มีใน ${option.companyNames.join(", ") || "หมวดอื่น"} รวม ${option.count} นาย`}
                                >
                                  {option.name}
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </>
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
