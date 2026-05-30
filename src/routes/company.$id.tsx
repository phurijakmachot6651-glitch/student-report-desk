import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
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
  summarizeDispatchEntries,
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
  type StoredDailyReport,
  type StoredDispatchEntry,
} from "@/lib/report-rows";
import { fetchActiveReportTime } from "@/lib/report-settings";

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
type RelatedCompany = { name?: string | null } | { name?: string | null }[] | null;
type ReportWithCompany = StoredDailyReport & {
  company_id: string;
  companies?: RelatedCompany;
};

function CompanyPage() {
  const { id } = useParams({ from: "/company/$id" });
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [date, setDate] = useState(() => search.date || todayISO());
  const [reporterName, setReporterName] = useState("");
  const [reporterPosition, setReporterPosition] = useState("");
  const [reportTime, setReportTime] = useState(DEFAULT_REPORT_TIME);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const selectedReportTime = normalizeReportTime(reportTime);

  const { data: activeReportTime = DEFAULT_REPORT_TIME } = useQuery({
    queryKey: ["active-report-time"],
    queryFn: () => fetchActiveReportTime(supabase),
  });

  useEffect(() => {
    setReportTime(activeReportTime);
  }, [activeReportTime]);

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
  const strengthSummary = summarizeDispatchEntries(entries, company?.full_strength || 0);

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
  const companyReports = reports as StoredDailyReport[];
  const currentReportMatch = useMemo(
    () => getReportRowFromReports(companyReports, selectedReportTime),
    [companyReports, selectedReportTime],
  );
  const report = currentReportMatch?.report || companyReports[0] || null;

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

      ((data || []) as ReportWithCompany[]).forEach((dailyReport) => {
        const relatedCompany = Array.isArray(dailyReport.companies)
          ? dailyReport.companies[0]
          : dailyReport.companies;
        const companyName = relatedCompany?.name || "";
        const row = getReportRow(dailyReport, selectedReportTime);
        if (!row) return;

        row.entries.forEach((entry) => {
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
        row.entries.map((entry: StoredDispatchEntry) => ({
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
  }, [date, currentReportMatch, selectedReportTime]);

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

  const validateReportRequiredFields = () => {
    const missingFields = [];

    if (!reporterName.trim()) missingFields.push("ชื่อผู้ควบคุมแถว");
    if (!reportTime.trim()) missingFields.push("เวลารายงาน");

    if (missingFields.length > 0) {
      toast.error(`กรุณากรอก${missingFields.join(" และ ")}ก่อนบันทึก`);
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!validateReportRequiredFields()) return;
    save.mutate();
  };

  const save = useMutation({
    mutationFn: async () => {
      const row: ReportRowData = {
        reportTime: selectedReportTime,
        reporterName: reporterName.trim(),
        reporterPosition: reporterPosition.trim(),
        entries: cleanReportEntries(entries),
      };
      const existingRows = decodeReportRows(report);
      const nextRows = [
        ...existingRows.filter(
          (existingRow) => normalizeReportTime(existingRow.reportTime) !== selectedReportTime,
        ),
        row,
      ].sort((a, b) =>
        normalizeReportTime(a.reportTime).localeCompare(normalizeReportTime(b.reportTime)),
      );
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
      toast.success(`บันทึกเรียบร้อย ยอดสุทธิหลังบันทึก ${strengthSummary.remaining} นาย`);
      qc.invalidateQueries({ queryKey: ["report", id, date] });
      qc.invalidateQueries({ queryKey: ["other-options"] });
    },
    onError: (error: Error) => toast.error(error.message || "บันทึกไม่สำเร็จ"),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="mx-auto max-w-3xl px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>กลับ</span>
          </Link>
          <h1 className="font-bold text-sm sm:text-base truncate text-center min-w-0">
            {company?.name}
          </h1>
          <div className="w-12 shrink-0" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 sm:px-4 py-4 sm:py-6 pb-28 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ข้อมูลทั่วไป</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-2 gap-3">
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
            <div className="col-span-2">
              <Label>ชื่อผู้ควบคุมแถว</Label>
              <Input
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="นรต.วิจัย กรณี"
              />
            </div>
            <div className="col-span-2">
              <Label>เลขที่ในหมวด</Label>
              <Input
                value={reporterPosition}
                onChange={(e) => setReporterPosition(e.target.value)}
                placeholder="๐"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ยอดสุทธิหลังบันทึก</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted/60 p-2.5 sm:p-3">
                <div className="text-[11px] sm:text-xs text-muted-foreground">ยอดเต็ม</div>
                <div className="text-lg sm:text-xl font-bold">{strengthSummary.fullStrength}</div>
                <div className="text-[11px] sm:text-xs text-muted-foreground">นาย</div>
              </div>
              <div className="rounded-md bg-orange-50 p-2.5 sm:p-3 text-orange-700">
                <div className="text-[11px] sm:text-xs">จำหน่าย</div>
                <div className="text-lg sm:text-xl font-bold">{strengthSummary.dispatched}</div>
                <div className="text-[11px] sm:text-xs">นาย</div>
              </div>
              <div className="rounded-md bg-green-50 p-2.5 sm:p-3 text-green-700">
                <div className="text-[11px] sm:text-xs">คงยอด</div>
                <div className="text-lg sm:text-xl font-bold">{strengthSummary.remaining}</div>
                <div className="text-[11px] sm:text-xs">นาย</div>
              </div>
            </div>

            <div className="space-y-1 text-sm">
              <div className="font-medium text-muted-foreground">รายการจำหน่าย</div>
              {strengthSummary.items.length > 0 ? (
                strengthSummary.items.map((item) => (
                  <div
                    key={`${item.category}-${item.label}`}
                    className="flex items-start justify-between gap-3 rounded-md bg-muted/30 px-3 py-2"
                  >
                    <span className="min-w-0 break-words">
                      <span>{item.label}</span>
                      {item.names.length > 0 && (
                        <span className="text-muted-foreground"> ({item.names.join(", ")})</span>
                      )}
                    </span>
                    <span className="shrink-0 font-medium">{item.count} นาย</span>
                  </div>
                ))
              ) : (
                <div className="rounded-md bg-muted/30 px-3 py-2 text-muted-foreground">
                  ไม่มีรายการจำหน่าย
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {CATEGORY_ORDER.map((category) => {
          const list = entries
            .map((entry, i) => ({ entry, i }))
            .filter((item) => item.entry.category === category);
          return (
            <Card key={category} className={list.length === 0 ? "bg-muted/20" : ""}>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">
                    📍 {CATEGORY_LABELS[category]}
                  </CardTitle>
                  {list.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{list.length} รายการ</p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => addEntry(category)} className="shrink-0">
                  <Plus className="h-4 w-4 mr-1" /> เพิ่ม
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {list.length === 0 && (
                  <div className="rounded-md border border-dashed bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                    ยังไม่มีรายการในหมวดนี้
                  </div>
                )}
                {list.map(({ entry, i }) => (
                  <div
                    key={entry.id ?? entry._local}
                    className="border rounded-md p-3 space-y-2 bg-muted/30"
                  >
                    {category === "other" ? (
                      <>
                        <div className="flex items-start gap-2">
                          <div className="grid grid-cols-[1fr_110px] sm:grid-cols-[1fr_140px] gap-2 flex-1 min-w-0">
                            <Input
                              list={`other-options-${i}`}
                              placeholder="ชื่อภารกิจ เช่น ช่วยงาน"
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
                            <div className="relative">
                              <Input
                                type="number"
                                min={0}
                                value={entry.count}
                                onChange={(event) =>
                                  updateEntry(i, { count: Number(event.target.value) })
                                }
                                placeholder="จำนวน"
                                aria-label="จำนวนคน หน่วยนาย"
                                className="pr-12"
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                                นาย
                              </span>
                            </div>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => removeEntry(i)} className="shrink-0">
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
                          <Button size="icon" variant="ghost" onClick={() => removeEntry(i)} className="shrink-0">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
      </main>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur shadow-lg">
        <div className="mx-auto max-w-3xl px-3 sm:px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">คงยอด {strengthSummary.remaining} นาย</div>
            <div className="text-xs text-muted-foreground">
              จำหน่าย {strengthSummary.dispatched} / {strengthSummary.fullStrength} นาย
            </div>
          </div>
          <Button onClick={handleSave} disabled={save.isPending} className="shrink-0 min-w-[100px]">
            {save.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </div>
    </div>
  );
}
