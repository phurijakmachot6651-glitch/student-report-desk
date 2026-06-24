import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogIn, Users } from "lucide-react";
import { summarizeDispatchEntries, todayISO, type Entry } from "@/lib/thai";
import {
  DEFAULT_REPORT_TIME,
  getReportRowFromReports,
  type StoredDailyReport,
} from "@/lib/report-rows";
import {
  buildReportTimeOptions,
  fetchReportTimeSettings,
  REPORT_TIME_SETTINGS_QUERY_KEY,
  REPORT_TIME_SETTINGS_QUERY_OPTIONS,
} from "@/lib/report-settings";

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
  const reportDate = todayISO();
  const [selectedReportTime, setSelectedReportTime] = useState<string | null>(null);

  const { data: reportTimeSettings, isLoading: isLoadingReportTimes } = useQuery({
    queryKey: REPORT_TIME_SETTINGS_QUERY_KEY,
    queryFn: () => fetchReportTimeSettings(supabase),
    ...REPORT_TIME_SETTINGS_QUERY_OPTIONS,
  });

  const { data, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["home-summary", reportDate],
    queryFn: async () => {
      const [companiesResult, reportsResult] = await Promise.all([
        supabase
          .from("companies")
          .select("id,name,full_strength,display_order")
          .order("display_order"),
        supabase
          .from("daily_reports")
          .select(
            "id,company_id,reporter_name,reporter_position,report_time,dispatch_entries(category,cadet_name,reason,location,subcategory,count,display_order)",
          )
          .eq("report_date", reportDate),
      ]);

      if (companiesResult.error) throw companiesResult.error;
      if (reportsResult.error) throw reportsResult.error;
      return {
        companies: companiesResult.data || [],
        reports: reportsResult.data || [],
      };
    },
  });

  const isLoading = isLoadingReportTimes || isLoadingSummary;
  const activeReportTime = reportTimeSettings?.activeReportTime || DEFAULT_REPORT_TIME;
  const reportTimes = buildReportTimeOptions(activeReportTime, reportTimeSettings?.reportTimes);
  const reportTime =
    selectedReportTime && reportTimes.includes(selectedReportTime)
      ? selectedReportTime
      : activeReportTime || reportTimes[0] || DEFAULT_REPORT_TIME;
  const reports = (data?.reports || []) as (StoredDailyReport & { company_id: string })[];
  const rows = (data?.companies || []).map((company) => {
    const companyReports = reports.filter((report) => report.company_id === company.id);
    const match = getReportRowFromReports(companyReports, reportTime);
    const entries = (match?.row?.entries || []) as Entry[];
    const summary = summarizeDispatchEntries(entries, company.full_strength);

    return { company, summary };
  });

  return (
    <div className="relative min-h-screen bg-background">
      <img src="/tiger-bg.jpg" alt="" className="fixed inset-0 h-full w-full object-contain opacity-20 pointer-events-none select-none" />
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <img
              src="/tiger_logo.png"
              alt="Tiger Logo"
              className="h-8 w-8 shrink-0 rounded-full border border-primary/20 object-contain"
            />
            <h1 className="min-w-0 truncate text-base font-bold leading-tight sm:text-lg">
              ยอดกำลังพล นรต. กองร้อยที่ ๒
            </h1>
          </div>
          <Link to="/admin/login">
            <Button variant="outline" size="sm" className="shrink-0 px-3">
              <LogIn className="h-4 w-4" />
              แอดมิน
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
        <div className="mb-6 text-center sm:mb-10">
          <h2 className="text-2xl font-bold leading-tight sm:text-3xl">เลือกหมวดเพื่อจำหน่ายยอด</h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            เลือกหมวดของท่านเพื่อกรอกยอดกำลังพลประจำวัน
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
            กำลังโหลด...
          </div>
        ) : (
          <div className="space-y-6">
            <div className="-mx-3 flex snap-x items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
              {reportTimes.map((time) => {
                const selected = time === reportTime;

                return (
                  <Button
                    key={time}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    onClick={() => setSelectedReportTime(time)}
                    className="h-10 min-w-24 shrink-0 snap-start backdrop-blur-sm"
                  >
                    เวลา {time}
                  </Button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4 md:grid-cols-3">
              {rows.map(({ company, summary }) => (
                <Link
                  key={company.id}
                  to="/company/$id"
                  params={{ id: company.id }}
                  search={{ date: reportDate, time: reportTime }}
                  className="block h-full"
                >
                  <Card className="h-full cursor-pointer rounded-lg transition hover:border-primary hover:shadow-lg active:scale-[0.99] bg-card/95 backdrop-blur-sm shadow-md">
                    <CardHeader className="p-4 pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-5 w-5 shrink-0 text-primary" />
                        {company.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 pt-0">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-md bg-muted/60 p-2">
                          <div className="text-muted-foreground">ยอดเต็ม</div>
                          <div className="font-semibold text-foreground">
                            {summary.fullStrength}
                          </div>
                        </div>
                        <div className="rounded-md bg-orange-50 p-2 text-orange-700">
                          <div>จำหน่าย</div>
                          <div className="font-semibold">{summary.dispatched}</div>
                        </div>
                        <div className="rounded-md bg-green-50 p-2 text-green-700">
                          <div>คงยอด</div>
                          <div className="font-semibold">{summary.remaining}</div>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        {summary.items.length > 0 ? (
                          summary.items.map((item) => (
                            <div
                              key={`${item.category}-${item.label}`}
                              className="rounded-md bg-muted/30 px-2 py-1.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="min-w-0 font-medium">{item.label}</span>
                                <span className="shrink-0 font-medium">{item.count} นาย</span>
                              </div>
                              {item.details.length > 0 && (
                                <div className="mt-1 space-y-0.5 text-[11px] leading-4 text-muted-foreground">
                                  {item.details.map((detail, index) => (
                                    <div
                                      key={`${item.category}-${item.label}-${index}`}
                                      className="break-words"
                                    >
                                      {detail}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground">ไม่มีรายการจำหน่าย</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
