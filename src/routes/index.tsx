import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Tiger backdrop: cover image + gradient wash + stripe motif blended in */}
      <div className="pointer-events-none fixed inset-0 select-none">
        <img
          src="/tiger-bg.jpg"
          alt=""
          className="h-full w-full object-cover opacity-[0.07] dark:opacity-[0.05]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background/60 to-background" />
        <div className="tiger-stripes absolute inset-0 opacity-40" />
      </div>

      <header className="sticky top-0 z-20 border-b border-primary/15 bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/tiger_logo.png"
              alt="Tiger Logo"
              className="float-soft h-9 w-9 shrink-0 rounded-full border border-primary/30 object-contain shadow-sm ring-2 ring-primary/10"
            />
            <h1 className="min-w-0 truncate text-base font-bold leading-tight sm:text-lg">
              ยอดกำลังพล นรต. กองร้อยที่ ๒
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <Link to="/admin/login">
              <Button variant="outline" size="sm" className="px-3">
                <LogIn className="h-4 w-4" />
                แอดมิน
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
        <div className="reveal mb-6 text-center sm:mb-10">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            <span className="gold-text">เลือกหมวดเพื่อจำหน่ายยอด</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            เลือกหมวดของท่านเพื่อกรอกยอดกำลังพลประจำวัน
          </p>
          <div className="gold-gradient mx-auto mt-4 h-1 w-24 rounded-full opacity-80" />
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-full" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
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
                    className={`h-10 min-w-24 shrink-0 snap-start rounded-full backdrop-blur-sm ${
                      selected ? "glow-pulse" : ""
                    }`}
                  >
                    เวลา {time}
                  </Button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4 md:grid-cols-3">
              {rows.map(({ company, summary }, index) => (
                <Link
                  key={company.id}
                  to="/company/$id"
                  params={{ id: company.id }}
                  search={{ date: reportDate, time: reportTime }}
                  className="reveal-stagger block h-full"
                  style={{ "--i": index } as React.CSSProperties}
                >
                  <Card className="card-lift group h-full cursor-pointer overflow-hidden rounded-xl border-border/70 bg-card/95 shadow-md backdrop-blur-sm hover:border-primary/60">
                    <div className="gold-gradient h-1 w-full opacity-70 transition-opacity group-hover:opacity-100" />
                    <CardHeader className="p-4 pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary transition-transform group-hover:scale-110">
                          <Users className="h-5 w-5" />
                        </span>
                        {company.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 pt-0">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-muted/60 p-2">
                          <div className="text-muted-foreground">ยอดเต็ม</div>
                          <div className="font-semibold text-foreground">
                            {summary.fullStrength}
                          </div>
                        </div>
                        <div className="rounded-lg bg-warning-muted/70 p-2 text-warning">
                          <div>จำหน่าย</div>
                          <div className="font-semibold">{summary.dispatched}</div>
                        </div>
                        <div className="rounded-lg bg-success-muted/70 p-2 text-success">
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
