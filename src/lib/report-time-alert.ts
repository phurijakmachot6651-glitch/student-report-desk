export const REPORT_TIME_ALARM_LEAD_MINUTES = 10;

export function minutesUntilReportTime(reportTime: string, now: Date): number | null {
  const match = reportTime.trim().match(/^(\d{1,2})[.:](\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const targetMinutes = hours * 60 + minutes;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return targetMinutes - currentMinutes;
}

export function isReportTimeApproaching(
  reportTime: string,
  now: Date,
  leadMinutes = REPORT_TIME_ALARM_LEAD_MINUTES,
): boolean {
  const minutesRemaining = minutesUntilReportTime(reportTime, now);
  return minutesRemaining !== null && minutesRemaining >= 0 && minutesRemaining <= leadMinutes;
}
