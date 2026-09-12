import type { DispatchCategory, Entry } from "@/lib/thai";

const DISPATCH_PERIOD_PREFIX = "__dispatch_period_v1__:";
export const DISPATCH_BATCH_PREFIX = "__dispatch_batch_v1__:";
const DISPATCH_META_PREFIX = "__dispatch_meta_v1__:";

export type DispatchDateTimeParts = {
  date: string;
  hour: string;
  minute: string;
};

export type DispatchPeriod = {
  id: string;
  batchId?: string;
  batchCategory?: DispatchCategory;
  batchValue?: string;
  updatedAt?: string;
  start: DispatchDateTimeParts;
  end: DispatchDateTimeParts;
  /** เมื่อเป็น true จะไม่บังคับวัน/เวลาสิ้นสุด และช่วงเวลาจะมีผลต่อเนื่อง */
  endIndefinite: boolean;
  /** ป่วยแอดมิตกองแพทย์: ยกยอดต่อเนื่องทุกรอบจนกว่าจะลบรายการ */
  medicalAdmission?: boolean;
  /** อื่น ๆ ที่อยู่ระหว่างปฏิบัติหน้าที่: ยกยอดถึงรอบ 07.30 น. ของวันถัดไป */
  dutyAssignment?: boolean;
};

export type DispatchBatch = {
  id: string;
  category: DispatchCategory;
  value?: string;
  updatedAt?: string;
};

const emptyDateTimeParts = (): DispatchDateTimeParts => ({
  date: "",
  hour: "",
  minute: "",
});

function parseDispatchMetadata(value: string | null | undefined): {
  value: string;
  updatedAt?: string;
} {
  const normalizedValue = value?.trim() || "";
  if (!normalizedValue.startsWith(DISPATCH_META_PREFIX)) {
    return { value: normalizedValue };
  }

  try {
    const parsed = JSON.parse(normalizedValue.slice(DISPATCH_META_PREFIX.length)) as {
      value?: unknown;
      updatedAt?: unknown;
    };
    return {
      value: typeof parsed.value === "string" ? parsed.value : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  } catch {
    return { value: normalizedValue };
  }
}

export function unwrapDispatchMetadata(value: string | null | undefined): string {
  return parseDispatchMetadata(value).value;
}

export function createDispatchPeriod(id = ""): DispatchPeriod {
  return {
    id,
    start: emptyDateTimeParts(),
    end: emptyDateTimeParts(),
    endIndefinite: false,
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
  const metadata = parseDispatchMetadata(value);
  const normalizedValue = metadata.value;

  if (normalizedValue.startsWith(DISPATCH_PERIOD_PREFIX)) {
    try {
      const parsed = JSON.parse(
        normalizedValue.slice(DISPATCH_PERIOD_PREFIX.length),
      ) as Partial<DispatchPeriod>;
      return {
        id: typeof parsed.id === "string" ? parsed.id : "",
        batchId: typeof parsed.batchId === "string" ? parsed.batchId : undefined,
        batchCategory:
          typeof parsed.batchCategory === "string"
            ? (parsed.batchCategory as DispatchCategory)
            : undefined,
        batchValue: typeof parsed.batchValue === "string" ? parsed.batchValue : undefined,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : metadata.updatedAt,
        start: normalizeParts(parsed.start),
        end: normalizeParts(parsed.end),
        endIndefinite: parsed.endIndefinite === true,
        medicalAdmission: parsed.medicalAdmission === true,
        dutyAssignment: parsed.dutyAssignment === true,
      };
    } catch {
      return createDispatchPeriod();
    }
  }

  return {
    ...createDispatchPeriod(),
    updatedAt: metadata.updatedAt,
    start: parseLegacyDateTime(normalizedValue),
  };
}

export function serializeDispatchPeriod(period: DispatchPeriod): string {
  return `${DISPATCH_PERIOD_PREFIX}${JSON.stringify(period)}`;
}

export function isMedicalAdmissionEntry(entry: Pick<Entry, "category" | "subcategory">): boolean {
  return (
    entry.category === "sick" && parseDispatchPeriod(entry.subcategory).medicalAdmission === true
  );
}

export function isDutyAssignmentEntry(entry: Pick<Entry, "category" | "subcategory">): boolean {
  return (
    entry.category === "other" && parseDispatchPeriod(entry.subcategory).dutyAssignment === true
  );
}

export function isContinuingDispatchEntry(entry: Pick<Entry, "category" | "subcategory">): boolean {
  return (
    hasDispatchPeriod(entry.category) ||
    isMedicalAdmissionEntry(entry) ||
    isDutyAssignmentEntry(entry)
  );
}

export function serializeDispatchBatch(batch: DispatchBatch): string {
  return `${DISPATCH_BATCH_PREFIX}${JSON.stringify(batch)}`;
}

export function parseDispatchBatch(value: string | null | undefined): DispatchBatch | null {
  const metadata = parseDispatchMetadata(value);
  const normalizedValue = metadata.value;
  if (normalizedValue.startsWith(DISPATCH_PERIOD_PREFIX)) {
    const period = parseDispatchPeriod(normalizedValue);
    return period.batchId
      ? {
          id: period.batchId,
          category: period.batchCategory || "other",
          value: period.batchValue,
          updatedAt: period.updatedAt,
        }
      : null;
  }
  if (!normalizedValue.startsWith(DISPATCH_BATCH_PREFIX)) return null;

  try {
    const parsed = JSON.parse(
      normalizedValue.slice(DISPATCH_BATCH_PREFIX.length),
    ) as Partial<DispatchBatch>;
    if (typeof parsed.id !== "string" || !parsed.id || typeof parsed.category !== "string") {
      return null;
    }

    return {
      id: parsed.id,
      category: parsed.category as DispatchCategory,
      value: typeof parsed.value === "string" ? parsed.value : undefined,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : metadata.updatedAt,
    };
  } catch {
    return null;
  }
}

export function getDispatchUpdatedAt(value: string | null | undefined): string | null {
  const metadata = parseDispatchMetadata(value);
  const updatedAt =
    metadata.updatedAt ||
    parseDispatchBatch(metadata.value)?.updatedAt ||
    parseDispatchPeriod(metadata.value).updatedAt;
  return updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? updatedAt : null;
}

export function stampDispatchEntryUpdatedAt<T extends Entry>(
  entry: T,
  updatedAt = new Date().toISOString(),
): T {
  const rawSubcategory = entry.subcategory?.trim() || "";
  const unwrappedSubcategory = unwrapDispatchMetadata(rawSubcategory);

  if (isContinuingDispatchEntry(entry) || unwrappedSubcategory.startsWith(DISPATCH_PERIOD_PREFIX)) {
    const period = parseDispatchPeriod(unwrappedSubcategory);
    return {
      ...entry,
      subcategory: serializeDispatchPeriod({
        ...period,
        id: period.id || crypto.randomUUID(),
        updatedAt,
      }),
    };
  }

  const batch = parseDispatchBatch(unwrappedSubcategory);
  if (!batch) {
    return {
      ...entry,
      subcategory: `${DISPATCH_META_PREFIX}${JSON.stringify({
        value: unwrappedSubcategory,
        updatedAt,
      })}`,
    };
  }

  return {
    ...entry,
    subcategory: serializeDispatchBatch({
      id: batch?.id || crypto.randomUUID(),
      category: batch?.category || entry.category,
      value: batch.value,
      updatedAt,
    }),
  };
}

export function formatDispatchUpdatedTime(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return "";

  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export function formatDispatchUpdatedDateTime(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return "";

  const date = new Date(value);
  const dateParts = new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Bangkok",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((datePart) => datePart.type === type)?.value || "";
  const formattedTime = formatDispatchUpdatedTime(value).replace(":", ".");

  return `${part("day")} ${part("month")}${part("year")} เวลา ${formattedTime} น.`;
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
  if (!startsAt) return "incomplete";
  // รองรับข้อมูลเดิมที่เคยบันทึกแบบไม่กำหนดเวลาสิ้นสุด แม้หน้าจอใหม่จะไม่ให้สร้างแบบนี้แล้ว
  if (period.endIndefinite) return null;

  const endsAt = dispatchDateTimeToTimestamp(period.end);
  if (!endsAt) return "incomplete";
  return startsAt < endsAt ? null : "order";
}

export function isDispatchPeriodActiveAt(period: DispatchPeriod, timestamp: string): boolean {
  const startsAt = dispatchDateTimeToTimestamp(period.start);
  if (!startsAt) return false;
  if (period.medicalAdmission || period.endIndefinite) return startsAt <= timestamp;
  if (period.dutyAssignment) {
    const nextDate = new Date(`${period.start.date}T00:00:00Z`);
    if (Number.isNaN(nextDate.getTime())) return false;
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextDateAt0730 = `${nextDate.toISOString().slice(0, 10)}T07:30`;
    return startsAt <= timestamp && timestamp <= nextDateAt0730;
  }

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
    period.endIndefinite ? "indefinite" : dispatchDateTimeToTimestamp(period.end) || "",
  ].join("\u0000");
}
