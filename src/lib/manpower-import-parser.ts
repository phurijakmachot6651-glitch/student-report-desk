import studentsData from "../data/students.json";
import {
  formatManpowerPeriod,
  toArabicDigits,
  type ManpowerCategory,
  type ManpowerSheetEntry,
} from "./manpower-sheet-config.ts";

type Student = (typeof studentsData)[number];
export type ParsedManpowerEntry = Omit<ManpowerSheetEntry, "id">;

const WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MONTH_NAMES = [
  ["ม.ค.", "มกราคม"],
  ["ก.พ.", "กุมภาพันธ์"],
  ["มี.ค.", "มีนาคม"],
  ["เม.ย.", "เมษายน"],
  ["พ.ค.", "พฤษภาคม"],
  ["มิ.ย.", "มิถุนายน"],
  ["ก.ค.", "กรกฎาคม"],
  ["ส.ค.", "สิงหาคม"],
  ["ก.ย.", "กันยายน"],
  ["ต.ค.", "ตุลาคม"],
  ["พ.ย.", "พฤศจิกายน"],
  ["ธ.ค.", "ธันวาคม"],
];
const MONTH_PATTERN = MONTH_NAMES.flat()
  .sort((first, second) => second.length - first.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
  .join("|");

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .trim();
}

function cleanExtractedPhrase(value: string): string {
  return normalizeText(value)
    .replace(/^(?:มีความประสงค์(?:ที่)?จะ|ต้องการจะ)\s*/u, "")
    .replace(/[.,;:]+$/u, "")
    .trim();
}

function findStudent(source: string): Student | null {
  const normalized = normalizeText(source);
  return (
    studentsData.find((student) =>
      normalized.includes(normalizeText(`${student.name} ${student.surname}`)),
    ) || null
  );
}

function fallbackStudentName(source: string): string {
  const match = normalizeText(source).match(
    /นรต\.?\s*([^\s()]+)\s+([^\s()]+?)(?=\s+(?:สังกัด|มว\.|หมวด|ร้อย|มีความประสงค์|ขออนุญาต|เพื่อ|ตั้งแต่เวลา)|$)/u,
  );
  return match ? `นรต.${match[1]} ${match[2]}` : "";
}

function detectCategory(source: string): ManpowerCategory {
  if (/ขออนุญาตออกนอก|ออกนอกบริเวณ|ลากิจ|ลาพัก|ขอลา/u.test(source)) return "leave";
  if (/ไปราชการ|ปฏิบัติราชการ|ราชการ/u.test(source)) return "official";
  if (/ขาด|ไม่มารายงานตัว|ไม่มาปฏิบัติ/u.test(source)) return "absent";
  if (/ป่วย|เข้ารับการรักษา|พบแพทย์/u.test(source)) return "sick";
  return "other";
}

function extractDetail(source: string): string {
  const match = normalizeText(source).match(
    /(?:เพื่อ|เนื่องจาก)\s*(.+?)(?=\s+ณ\s+|\s+(?:(?:กระผม|ข้าพเจ้า|ผม|ดิฉัน)\s*)?(?:จึง\s*)?ขออนุญาต|\s+ตั้งแต่เวลา|$)/u,
  );
  return match ? cleanExtractedPhrase(match[1]) : "";
}

function extractLocation(source: string): string {
  const normalized = normalizeText(source);
  const atLocation = normalized.match(
    /(?:^|\s)ณ\s+(.+?)(?=\s+(?:(?:กระผม|ข้าพเจ้า|ผม|ดิฉัน)\s*)?(?:จึง\s*)?ขออนุญาต|\s+ตั้งแต่เวลา|$)/u,
  );
  if (atLocation) return cleanExtractedPhrase(atLocation[1]);
  const province = normalized.match(/จังหวัด\s*[ก-ฮ][ก-๙]*/u);
  return province ? province[0].replace(/\s+/gu, "") : "";
}

type ParsedDate = { day: number; month: number; year: number; weekday: number; index: number };

function parseYear(value: string, fallbackYear: number): number {
  const number = Number(toArabicDigits(value));
  if (!number) return fallbackYear;
  if (number >= 2400) return number - 543;
  if (number >= 2000) return number;
  return 2500 + number - 543;
}

function resolveDate(parsed: ParsedDate, minimum?: Date): Date {
  const exact = new Date(parsed.year, parsed.month, parsed.day);
  const exactValid =
    exact.getMonth() === parsed.month &&
    exact.getDate() === parsed.day &&
    exact.getDay() === parsed.weekday &&
    (!minimum || exact >= minimum);
  if (exactValid) return exact;

  const candidates = Array.from(
    { length: 12 },
    (_, month) => new Date(parsed.year, month, parsed.day),
  )
    .filter(
      (date) =>
        date.getMonth() >= 0 &&
        date.getDate() === parsed.day &&
        date.getDay() === parsed.weekday &&
        (!minimum || date >= minimum),
    )
    .sort(
      (first, second) =>
        Math.abs(first.getMonth() - parsed.month) - Math.abs(second.getMonth() - parsed.month),
    );
  return candidates[0] || exact;
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function extractPeriod(source: string, reportDate: string): Partial<ManpowerSheetEntry> {
  const normalized = normalizeText(source);
  const timeMatches = Array.from(
    normalized.matchAll(/(?:ตั้งแต่|ถึง)?\s*เวลา\s*([๐-๙0-9]{1,2})[.:]([๐-๙0-9]{2})\s*น\.?/gu),
  );
  if (timeMatches.length < 2) return {};

  const fallbackYear = Number(reportDate.slice(0, 4)) || new Date().getFullYear();
  const datePattern = new RegExp(
    String.raw`(?:ของ\s*)?วัน(${WEEKDAYS.join("|")})\s*ที่\s*([๐-๙0-9]{1,2})\s*(${MONTH_PATTERN})\s*([๐-๙0-9]{2,4})`,
    "gu",
  );
  const dates: ParsedDate[] = Array.from(normalized.matchAll(datePattern)).map((match) => ({
    weekday: WEEKDAYS.indexOf(match[1]),
    day: Number(toArabicDigits(match[2])),
    month: MONTH_NAMES.findIndex((names) => names.includes(match[3])),
    year: parseYear(match[4], fallbackYear),
    index: match.index || 0,
  }));
  if (dates.length === 0) return {};

  const firstTime = `${toArabicDigits(timeMatches[0][1]).padStart(2, "0")}:${toArabicDigits(timeMatches[0][2]).padStart(2, "0")}`;
  const secondTime = `${toArabicDigits(timeMatches[1][1]).padStart(2, "0")}:${toArabicDigits(timeMatches[1][2]).padStart(2, "0")}`;
  const crossDay = dates.length >= 2;
  const startDate = resolveDate(crossDay ? dates[0] : dates[dates.length - 1]);
  const endDate = crossDay ? resolveDate(dates[1], startDate) : startDate;
  const partial: Partial<ManpowerSheetEntry> = {
    periodMode: crossDay ? "cross-day" : "same-day",
    periodStartTime: firstTime,
    periodEndTime: secondTime,
    periodStartDate: toISODate(startDate),
    periodEndDate: toISODate(endDate),
  };
  return { ...partial, period: formatManpowerPeriod(partial as ManpowerSheetEntry) };
}

function parseSegment(source: string, reportDate: string): ParsedManpowerEntry | null {
  const student = findStudent(source);
  const fallbackName = fallbackStudentName(source);
  if (!student && !fallbackName) return null;
  const explicitSquad = normalizeText(source).match(/(?:มว\.?|หมวด)\s*([๐-๙0-9]+)/u)?.[1];
  const explicitNumber = normalizeText(source).match(/เลขที่\s*([๐-๙0-9]+)/u)?.[1];
  const period = extractPeriod(source, reportDate);
  const entry: ParsedManpowerEntry = {
    studentId: student ? `${student.squad}:${student.number}` : "",
    name: student ? `นรต.${student.name} ${student.surname}`.trim() : fallbackName,
    squadNumber: student
      ? `${student.squad}/${student.number}`
      : [explicitSquad, explicitNumber]
          .filter((value): value is string => Boolean(value))
          .map((value) => toArabicDigits(value))
          .join("/"),
    category: detectCategory(source),
    detail: extractDetail(source),
    period: "",
    note: extractLocation(source),
    ...period,
  };
  return entry;
}

/** Classify imported prose into editable manpower rows using the local student roster. */
export function parseManpowerImportText(value: string, reportDate: string): ParsedManpowerEntry[] {
  const source = normalizeText(value);
  if (!source) return [];
  const rosterMarkerIndexes = studentsData
    .map((student) => source.indexOf(`นรต.${student.name} ${student.surname}`.trim()))
    .filter((index) => index >= 0);
  const lineMarkerIndexes = Array.from(source.matchAll(/(?:^|\n)\s*นรต\.?\s*(?=[ก-ฮ])/gu)).map(
    (marker) => (marker.index || 0) + marker[0].indexOf("นรต"),
  );
  const markerIndexes = Array.from(new Set([...rosterMarkerIndexes, ...lineMarkerIndexes])).sort(
    (first, second) => first - second,
  );
  const segments = markerIndexes.length
    ? markerIndexes.map((markerIndex, index) =>
        source.slice(markerIndex, markerIndexes[index + 1] ?? source.length),
      )
    : [source];
  const parsed = segments
    .map((segment) => parseSegment(segment, reportDate))
    .filter((entry): entry is ParsedManpowerEntry => Boolean(entry));
  return Array.from(
    new Map(parsed.map((entry) => [entry.studentId || entry.name, entry])).values(),
  );
}
