import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import {
  buildReportText,
  buildStretchExerciseReportText,
  parseISODate,
  todayISO,
  type Entry,
} from "@/lib/thai";
import { DEFAULT_REPORT_TIME, getReportRow, normalizeReportTime } from "@/lib/report-rows";
import { fetchActiveReportTime, fetchReportTimes } from "@/lib/report-settings";

export const Route = createFileRoute("/_admin/admin/report")({
  component: ReportPage,
});

type ReportTemplate = "strength" | "stretchExercise";

type ReporterFields = {
  selectedReporter: string;
  reporterName: string;
  reporterPosition: string;
};

const COMPANY_REPORT_HEADER =
  "กองร้อยที่ ๒ ฝ่ายปกครอง ๑\nกองบังคับการปกครอง\n(นักเรียนนายร้อยตำรวจชั้นปีที่ ๒)";

const DEFAULT_REPORTER_FIELDS: Record<ReportTemplate, ReporterFields> = {
  strength: {
    selectedReporter: "",
    reporterName: "นรต.ธัชชัย อ่อนแก้ว",
    reporterPosition: "ผู้ช่วย ผบ.มว. ร้อย ๒ ปค.๑ บก.ปค.",
  },
  stretchExercise: {
    selectedReporter: "",
    reporterName: "นรต.ธนพล นราพันธ์",
    reporterPosition: "ผู้ช่วย ผบ.มว.ร้อย ๒ ปค.๑ บก.ปค.",
  },
};

function ReportPage() {
  const [date, setDate] = useState(todayISO());
  const [selectedReportTimeInput, setSelectedReportTimeInput] = useState<string | null>(null);
  const [reportTemplate, setReportTemplate] = useState<ReportTemplate>("strength");
  const [reporterFieldsByTemplate, setReporterFieldsByTemplate] =
    useState<Record<ReportTemplate, ReporterFields>>(DEFAULT_REPORTER_FIELDS);
  const { selectedReporter, reporterName, reporterPosition } =
    reporterFieldsByTemplate[reportTemplate];

  const updateReporterFields = (fields: Partial<ReporterFields>) => {
    setReporterFieldsByTemplate((current) => ({
      ...current,
      [reportTemplate]: {
        ...current[reportTemplate],
        ...fields,
      },
    }));
  };

  const { data: reportTimeSettings } = useQuery({
    queryKey: ["report-export-times"],
    queryFn: async () => {
      const [activeReportTime, reportTimes] = await Promise.all([
        fetchActiveReportTime(supabase),
        fetchReportTimes(supabase),
      ]);

      return { activeReportTime, reportTimes };
    },
    enabled: reportTemplate === "strength",
  });
  const reportTimes = Array.from(
    new Set(
      [
        reportTimeSettings?.activeReportTime || DEFAULT_REPORT_TIME,
        ...(reportTimeSettings?.reportTimes || [DEFAULT_REPORT_TIME]),
      ].map(normalizeReportTime),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const selectedReportTime =
    selectedReportTimeInput && reportTimes.includes(selectedReportTimeInput)
      ? selectedReportTimeInput
      : reportTimeSettings?.activeReportTime || reportTimes[0] || DEFAULT_REPORT_TIME;

  const { data } = useQuery({
    queryKey: ["report-export", date, selectedReportTime],
    queryFn: async () => {
      const [companiesResult, reportsResult] = await Promise.all([
        supabase.from("companies").select("id,full_strength,display_order").order("display_order"),
        supabase
          .from("daily_reports")
          .select(
            "id,report_time,reporter_name,reporter_position,dispatch_entries(category,cadet_name,reason,location,subcategory,count,display_order)",
          )
          .eq("report_date", date),
      ]);
      if (companiesResult.error) throw companiesResult.error;
      if (reportsResult.error) throw reportsResult.error;
      return { companies: companiesResult.data || [], reports: reportsResult.data || [] };
    },
    enabled: reportTemplate === "strength",
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

  const strengthReportText = useMemo(() => {
    if (!data) return "";

    const entries: Entry[] = [];
    const fullStrength = data.companies.reduce(
      (sum, company) => sum + (company.full_strength || 0),
      0,
    );

    data.reports.forEach((report) => {
      const row = getReportRow(report, selectedReportTime);
      if (!row) return;

      row.entries.forEach((entry: Entry) => {
        entries.push({
          category: entry.category,
          cadet_name: entry.cadet_name,
          reason: entry.reason,
          location: entry.location,
          subcategory: entry.subcategory,
          count: entry.count,
        });
      });
    });

    return buildReportText({
      companyName: COMPANY_REPORT_HEADER,
      fullStrength,
      reportDate: parseISODate(date),
      reporterName: reporterName || "-",
      reporterPosition: reporterPosition || "-",
      reportTime: selectedReportTime,
      entries,
    });
  }, [data, date, reporterName, reporterPosition, selectedReportTime]);

  const stretchExerciseReportText = useMemo(
    () =>
      buildStretchExerciseReportText({
        companyName: COMPANY_REPORT_HEADER,
        reportDate: parseISODate(date),
        reporterName: reporterName || "-",
        reporterPosition: reporterPosition || "-",
      }),
    [date, reporterName, reporterPosition],
  );

  const fullText =
    reportTemplate === "stretchExercise" ? stretchExerciseReportText : strengthReportText;

  const copy = async () => {
    await navigator.clipboard.writeText(fullText);
    toast.success("คัดลอกแล้ว");
  };

  const download = () => {
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      reportTemplate === "stretchExercise"
        ? `stretch-exercise-report-${date}.txt`
        : `report-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
      <Card className="reveal overflow-hidden rounded-xl">
        <div className="gold-gradient h-1 w-full opacity-70" />
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="gold-text text-lg">ส่งออกคำรายงาน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          <Tabs
            value={reportTemplate}
            onValueChange={(value) => {
              if (value) setReportTemplate(value as ReportTemplate);
            }}
          >
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger
                value="strength"
                className="min-h-9 whitespace-normal px-2 py-1.5 text-center leading-tight"
              >
                ยอดกำลังพล
              </TabsTrigger>
              <TabsTrigger
                value="stretchExercise"
                className="min-h-9 whitespace-normal px-2 py-1.5 text-center leading-tight"
              >
                ยืดเหยียดและออกกำลังกาย
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div
            className={`grid gap-3 items-end ${
              reportTemplate === "strength" ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
            <div>
              <Label>วันที่</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full"
              />
            </div>
            {reportTemplate === "strength" ? (
              <div>
                <Label>เวลารายงาน</Label>
                <select
                  value={selectedReportTime}
                  onChange={(e) => setSelectedReportTimeInput(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm"
                >
                  {reportTimes.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Button onClick={copy} variant="outline" className="flex-1">
                <Copy className="h-4 w-4 mr-1" /> คัดลอก
              </Button>
              <Button onClick={download} className="flex-1">
                <Download className="h-4 w-4 mr-1" /> ดาวน์โหลด
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>เลือกผู้รายงาน</Label>
              <select
                value={selectedReporter}
                onChange={(event) => {
                  updateReporterFields({
                    selectedReporter: event.target.value,
                    reporterName: event.target.value,
                  });
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm"
              >
                <option value="">เลือกรายชื่อ</option>
                {(reporters || []).map((reporter) => (
                  <option key={reporter.id} value={reporter.name}>
                    {reporter.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>ชื่อผู้รายงาน</Label>
              <Input
                value={reporterName}
                onChange={(e) => {
                  updateReporterFields({
                    reporterName: e.target.value,
                    selectedReporter: "",
                  });
                }}
                placeholder={DEFAULT_REPORTER_FIELDS[reportTemplate].reporterName}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>ตำแหน่ง</Label>
              <Input
                value={reporterPosition}
                onChange={(e) => updateReporterFields({ reporterPosition: e.target.value })}
                placeholder={DEFAULT_REPORTER_FIELDS[reportTemplate].reporterPosition}
              />
            </div>
          </div>

          <Textarea
            readOnly
            value={fullText}
            className="min-h-[420px] font-mono text-sm sm:min-h-[600px]"
          />
        </CardContent>
      </Card>
    </main>
  );
}
