import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogIn, Users, CheckCircle2 } from "lucide-react";
import { summarizeDispatchEntries, todayISO, type Entry } from "@/lib/thai";
import { thaiToArabicNumerals } from "@/lib/thai-numerals";
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
import { isReportTimeApproaching } from "@/lib/report-time-alert";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "เช็คยอดกองร้อยที่ 4" },
      { name: "description", content: "ระบบจัดทำยอดกำลังพลนักเรียนนายร้อยตำรวจ" },
    ],
  }),
  component: Home,
});

function toThaiDate(isoDate: string) {
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("th-TH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function Home() {
  const reportDate = todayISO();
  const [selectedReportTime, setSelectedReportTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    const refreshCurrentTime = () => setCurrentTime(new Date());
    refreshCurrentTime();
    const timer = window.setInterval(refreshCurrentTime, 15_000);

    return () => window.clearInterval(timer);
  }, []);

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
    const hasReport = !!match?.row;

    return { company, summary, hasReport };
  });

  const submittedCount = rows.filter((r) => r.hasReport).length;
  const totalCount = rows.length;
  const submissionPct = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0;
  const allSubmitted = submittedCount === totalCount && totalCount > 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Dragon backdrop */}
      <div className="pointer-events-none fixed inset-0 select-none overflow-hidden">
        <img
          src="/dragon-background.png"
          alt=""
          className="h-full w-auto min-w-full object-contain opacity-[0.15] dark:opacity-[0.12]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background/70 to-background" />
      </div>

      <header className="sticky top-0 z-20 border-b border-primary/15 bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/dragon_logo.png"
              alt="Dragon Logo"
              className="float-soft h-9 w-9 shrink-0 rounded-full border border-primary/30 object-contain shadow-sm ring-2 ring-primary/10"
            />
            <h1 className="min-w-0 truncate text-base font-bold leading-tight sm:text-lg">
              เช็คยอดกองร้อยที่ 4
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
        {/* Hero heading */}
        <div className="reveal mb-6 text-center sm:mb-10">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            <span className="gold-text">เลือกหมวดเพื่อจำหน่ายยอด</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {toThaiDate(reportDate)}
          </p>
          <div className="gold-gradient mx-auto mt-4 h-1 w-24 rounded-full opacity-80" />
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="mx-auto h-16 max-w-md rounded-xl" />
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
            {/* Submission progress strip */}
            {totalCount > 0 && (
              <div
                className="reveal mx-auto max-w-md overflow-hidden rounded-xl border border-primary/20 bg-card/90 p-4 shadow-sm backdrop-blur-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {allSubmitted ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Users className="h-4 w-4 text-primary" />
                    )}
                    <span className="text-sm font-medium">
                      {allSubmitted ? "ส่งยอดครบทุกหมวดแล้ว" : "ความคืบหน้าการส่งยอด"}
                    </span>
                  </div>
                  <span className="text-sm font-bold">
                    <span className={allSubmitted ? "text-success" : "text-primary"}>
                      {submittedCount}
                    </span>
                    <span className="text-muted-foreground">/{totalCount} หมวด</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`bar-slide-in h-full rounded-full ${allSubmitted ? "bg-success" : "gold-gradient"}`}
                    style={{ "--bar-width": `${submissionPct}%`, width: `${submissionPct}%` } as React.CSSProperties}
                  />
                </div>
              </div>
            )}

            {/* Report time selector */}
            <div className="-mx-3 flex snap-x items-center gap-4 overflow-x-auto px-3 py-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
              {reportTimes.map((time) => {
                const selected = time === reportTime;
                const alarm = currentTime ? isReportTimeApproaching(time, currentTime) : false;

                return (
                  <Button
                    key={time}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    onClick={() => setSelectedReportTime(time)}
                    aria-current={selected ? "true" : undefined}
                    aria-label={alarm ? `เวลา ${time} ใกล้ถึงเวลาส่งยอด` : `เวลา ${time}`}
                    data-report-time={time}
                    data-alarm={alarm ? "true" : "false"}
                    className={`h-10 min-w-24 shrink-0 snap-start rounded-full backdrop-blur-sm ${
                      alarm ? "report-time-alarm" : selected ? "report-time-active" : ""
                    }`}
                  >
                    เวลา {time}
                  </Button>
                );
              })}
            </div>

            {/* Company card grid */}
            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4 md:grid-cols-3">
              {rows.map(({ company, summary, hasReport }, index) => {
                const dispatchPct =
                  summary.fullStrength > 0
                    ? Math.min(100, Math.round((summary.dispatched / summary.fullStrength) * 100))
                    : 0;

                return (
                  <Link
                    key={company.id}
                    to="/company/$id"
                    params={{ id: company.id }}
                    search={{ date: reportDate, time: reportTime }}
                    className="reveal-stagger block h-full"
                    style={{ "--i": index } as React.CSSProperties}
                  >
                    <Card
                      className={`card-lift group h-full cursor-pointer overflow-hidden rounded-xl shadow-md backdrop-blur-sm ${
                        hasReport
                          ? "border-success/40 bg-card/95 hover:border-success/60"
                          : "border-border/70 bg-card/95 hover:border-primary/60"
                      }`}
                    >
                      {/* Top accent bar */}
                      <div
                        className={`h-1 w-full transition-opacity group-hover:opacity-100 ${
                          hasReport ? "bg-success/60" : "gold-gradient opacity-70"
                        }`}
                      />

                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="flex items-center justify-between gap-2 text-base">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110 ${
                                hasReport
                                  ? "bg-success/15 text-success"
                                  : "bg-primary/15 text-primary"
                              }`}
                            >
                              <Users className="h-5 w-5" />
                            </span>
                            <span className="truncate">{thaiToArabicNumerals(company.name)}</span>
                          </div>
                          <Badge
                            variant={hasReport ? "default" : "secondary"}
                            className={`shrink-0 text-[11px] ${
                              hasReport
                                ? "border-success/30 bg-success/15 text-success hover:bg-success/20"
                                : ""
                            }`}
                          >
                            {hasReport ? "ส่งยอดแล้ว" : "รอส่ง"}
                          </Badge>
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-3 p-4 pt-0">
                        {/* 3-stat grid — คงยอด is deliberately larger */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-muted/60 px-2 py-2">
                            <div className="text-[11px] text-muted-foreground">ยอดเต็ม</div>
                            <div className="text-sm font-semibold text-foreground">
                              {summary.fullStrength}
                            </div>
                          </div>
                          <div className="rounded-lg bg-warning-muted/70 px-2 py-2 text-warning">
                            <div className="text-[11px]">จำหน่าย</div>
                            <div className="text-sm font-semibold">{summary.dispatched}</div>
                          </div>
                          <div className="rounded-lg bg-success-muted/70 px-2 py-2 text-success">
                            <div className="text-[11px]">คงยอด</div>
                            <div className="text-lg font-bold leading-tight">{summary.remaining}</div>
                          </div>
                        </div>

                        {/* Dispatch progress bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>สัดส่วนจำหน่าย</span>
                            <span>{dispatchPct}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="bar-slide-in h-full rounded-full bg-warning/70"
                              style={
                                {
                                  "--bar-width": `${dispatchPct}%`,
                                  width: `${dispatchPct}%`,
                                } as React.CSSProperties
                              }
                            />
                          </div>
                        </div>

                        {/* Dispatch detail items */}
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
                                    {item.details.map((detail, idx) => (
                                      <div
                                        key={`${item.category}-${item.label}-${idx}`}
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
                            <div className="text-muted-foreground">
                              {hasReport ? "ไม่มีจำหน่าย" : "ยังไม่ได้ส่งยอด"}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
