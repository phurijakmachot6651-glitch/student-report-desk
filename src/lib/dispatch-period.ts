import type { DispatchCategory, Entry } from "@/lib/thai";

const DISPATCH_PERIOD_PREFIX = "__dispatch_period_v1__:";

export type DispatchDateTimeParts = {
  date: string;
  hour: string;
  minute: string;
};

export type DispatchPeriod = {
  id: string;
  start: DispatchDateTimeParts;
  end: DispatchDateTimeParts;
};

const emptyDateTimeParts = (): DispatchDateTimeParts => ({
  date: "",
  hour: "",
  minute: "",
});

export function createDispatchPeriod(id = ""): DispatchPeriod {
  return {
    id,
    start: emptyDateTimeParts(),
    end: emptyDateTimeParts(),
  };
}

export function hasDispatchPeriod(category: DispatchCategory): boolean {
  return category === "leave" || category === "official";
}

function normalizeParts(value: unknown): DispatchDateTimeParts {
  if (!value || typeof value !== "object") return emptyDateTimeParts();

  const candidate = value as Partial<DispatchDateTimeParts>;
  return {
    date: typeof candidate.date === "string" ? candidate.date : "",
    hour: typeof candidate.hour === "string" ? candidate.hour : "",
    minute: typeof candidate.minute === "string" ? candidate.minute : "",
  };
}

function parseLegacyDateTime(value: string): DispatchDateTimeParts {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2})[.:](\d{1,2}))?/);

  if (!match) return emptyDateTimeParts();

  return {
    date: match[1],
    hour: match[2]?.padStart(2, "0") || "",
    minute: match[3]?.padStart(2, "0") || "",
  };
}

export function parseDispatchPeriod(value: string | null | undefined): DispatchPeriod {
  const normalizedValue = value?.trim() || "";

  if (normalizedValue.startsWith(DISPATCH_PERIOD_PREFIX)) {
    try {
      const parsed = JSON.parse(
        normalizedValue.slice(DISPATCH_PERIOD_PREFIX.length),
      ) as Partial<DispatchPeriod>;
      return {
        id: typeof parsed.id === "string" ? parsed.id : "",
        start: normalizeParts(parsed.start),
        end: normalizeParts(parsed.end),
      };
    } catch {
      return createDispatchPeriod();
    }
  }

  return {
    ...createDispatchPeriod(),
    start: parseLegacyDateTime(normalizedValue),
  };
}

export function serializeDispatchPeriod(period: DispatchPeriod): string {
  return `${DISPATCH_PERIOD_PREFIX}${JSON.stringify(period)}`;
}

export function dispatchDateTimeToTimestamp(parts: DispatchDateTimeParts): string | null {
  if (!parts.date || !/^\d{2}$/.test(parts.hour) || !/^\d{2}$/.test(parts.minute)) {
    return null;
  }

  const hours = Number(parts.hour);
  const minutes = Number(parts.minute);
  if (hours > 23 || minutes > 59) return null;

  return `${parts.date}T${parts.hour}:${parts.minute}`;
}

export function reportDateTimeToTimestamp(reportDate: string, reportTime: string): string | null {
  const match = reportTime.trim().match(/^(\d{1,2})[.:](\d{1,2})$/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !match) return null;

  return dispatchDateTimeToTimestamp({
    date: reportDate,
    hour: match[1].padStart(2, "0"),
    minute: match[2].padStart(2, "0"),
  });
}

export function validateDispatchPeriod(period: DispatchPeriod): "incomplete" | "order" | null {
  const startsAt = dispatchDateTimeToTimestamp(period.start);
  const endsAt = dispatchDateTimeToTimestamp(period.end);

  if (!startsAt || !endsAt) return "incomplete";
  return startsAt < endsAt ? null : "order";
}

export function isDispatchPeriodActiveAt(period: DispatchPeriod, timestamp: string): boolean {
  const startsAt = dispatchDateTimeToTimestamp(period.start);
  const endsAt = dispatchDateTimeToTimestamp(period.end);

  return Boolean(startsAt && endsAt && startsAt <= timestamp && timestamp < endsAt);
}

export function getDispatchPeriodKey(
  entry: Pick<Entry, "category" | "cadet_name" | "reason" | "location" | "subcategory">,
): string {
  const period = parseDispatchPeriod(entry.subcategory);
  if (period.id) return period.id;

  return [
    "legacy",
    entry.category,
    entry.cadet_name.trim(),
    entry.reason.trim(),
    entry.location.trim(),
    dispatchDateTimeToTimestamp(period.start) || "",
    dispatchDateTimeToTimestamp(period.end) || "",
  ].join("\u0000");
}
