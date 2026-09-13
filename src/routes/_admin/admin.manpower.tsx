import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  Download,
  FileImage,
  FileText,
  FileType2,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import studentsData from "@/data/students.json";
import { buildManpowerSheetPdf } from "@/lib/manpower-sheet";
import { renderManpowerPdfAsJpg } from "@/lib/manpower-jpg";
import { buildManpowerSheetDocx } from "@/lib/manpower-word";
import { downloadBlob, prepareBlobDownload } from "@/lib/download";
import { extractManpowerImportText } from "@/lib/manpower-import";
import { parseManpowerImportText, type ParsedManpowerEntry } from "@/lib/manpower-import-parser";
import {
  readCloudManpowerDraft,
  readManpowerDraft,
  saveCloudManpowerDraft,
  saveManpowerDraft,
  type ManpowerDraft,
} from "@/lib/manpower-draft";
import {
  MANPOWER_CATEGORIES,
  MANPOWER_CATEGORY_LABELS,
  MANPOWER_COMPANY_COMMANDER_SIGNATURE_PATH,
  MANPOWER_DEFAULT_PERIOD_MODE,
  MANPOWER_DEFAULT_PERIOD_START_DATE,
  MANPOWER_DEFAULT_PERIOD_START_TIME,
  MANPOWER_REPORTER_SIGNATURE_PATH,
  MANPOWER_SIGNATURES,
  formatManpowerPeriod,
  getManpowerEntryPeriod,
  isManpowerEntryFilled,
  manpowerSheetFilename,
  summarizeManpowerEntries,
  toArabicDigits,
  toThaiDigits,
  type ManpowerSheetData,
  type ManpowerSheetEntry,
} from "@/lib/manpower-sheet-config";
import { todayISO } from "@/lib/thai";

export const Route = createFileRoute("/_admin/admin/manpower")({
  component: ManpowerSheetPage,
});

type Student = (typeof studentsData)[number];

const THAI_SHORT_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

// ใช้ค่าตัวอย่างจากแบบฟอร์มต้นฉบับเป็นค่าเริ่มต้นเท่านั้น ผู้ใช้ยังเลือก
// วันและเวลาใหม่ได้จากช่องเลือกในแต่ละแถว โดยไม่ผูกกับวันที่ตัวอย่างนี้
function createEmptyEntry(defaultDate = MANPOWER_DEFAULT_PERIOD_START_DATE): ManpowerSheetEntry {
  return {
    id: crypto.randomUUID(),
    studentId: "",
    name: "",
    squadNumber: "",
    category: "sick",
    detail: "",
    // เก็บข้อความช่วงเวลาเป็นค่าว่างไว้ก่อน ค่าเริ่มต้นจะแสดงจากฟิลด์
    // วัน/เวลาแบบมีโครงสร้าง และจะไม่ถูกนับเป็นข้อมูลที่กรอกแล้วหรือขวางการนำเข้า
    period: "",
    // ค่าเริ่มต้นตามตัวอย่างในเอกสาร (ผู้ใช้แก้ไขได้จาก select ทุกช่อง)
    periodMode: MANPOWER_DEFAULT_PERIOD_MODE,
    periodStartTime: MANPOWER_DEFAULT_PERIOD_START_TIME,
    periodEndTime: "",
    periodStartDate: defaultDate || MANPOWER_DEFAULT_PERIOD_START_DATE,
    periodEndDate: defaultDate || MANPOWER_DEFAULT_PERIOD_START_DATE,
    note: "",
  };
}

function formatDocumentDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("th-TH", { weekday: "long" })
      .format(date)
      .replace(/^วัน/u, ""),
    day: toThaiDigits(date.getDate()),
    month: new Intl.DateTimeFormat("th-TH", { month: "long" }).format(date),
    year: toThaiDigits(date.getFullYear() + 543),
  };
}

function normalizeStudentSearch(value: string): string {
  return toArabicDigits(value)
    .normalize("NFKC")
    .toLocaleLowerCase("th")
    .replace(/นรต\.?/gu, "")
    .replace(/เลขที่/gu, "")
    .replace(/(?:ะ|า|ำ|ิ|ี|ึ|ื|ุ|ู|เ|แ|โ|ใ|ไ|็|่|้|๊|๋|์|ํ)/gu, "")
    .replace(/[^ก-ฮa-z0-9]+/giu, "");
}

function isSearchSubsequence(query: string, candidate: string): boolean {
  if (!query) return false;
  let index = 0;
  for (const character of candidate) {
    if (character === query[index]) index += 1;
    if (index === query.length) return true;
  }
  return false;
}

const exportButtonClass =
  "border border-primary/70 bg-primary text-primary-foreground shadow hover:border-emerald-600 hover:bg-emerald-600 hover:text-white hover:shadow-md hover:shadow-emerald-600/25 dark:hover:border-emerald-500 dark:hover:bg-emerald-600";

function studentSearchScore(student: Student, rawQuery: string): number {
  const plainQuery = toArabicDigits(rawQuery)
    .normalize("NFKC")
    .toLocaleLowerCase("th")
    .replace(/นรต\.?|เลขที่/gu, "")
    .replace(/[^ก-๙a-z0-9]+/giu, "");
  const query = normalizeStudentSearch(rawQuery);
  if (!plainQuery && !query) return Number.POSITIVE_INFINITY;

  const plainName = `${student.name}${student.surname}${student.number}`
    .normalize("NFKC")
    .toLocaleLowerCase("th")
    .replace(/[^ก-๙a-z0-9]+/giu, "");
  const skeleton = normalizeStudentSearch(`${student.name}${student.surname}${student.number}`);
  if (student.number === plainQuery) return 0;
  if (plainName === plainQuery) return 1;
  if (plainName.startsWith(plainQuery)) return 2;
  if (plainName.includes(plainQuery)) return 3;
  if (query.length >= 2 && skeleton.includes(query)) return 4;
  if (query.length >= 2 && isSearchSubsequence(query, skeleton)) return 5;
  return Number.POSITIVE_INFINITY;
}

function studentName(student: Student): string {
  return `นรต.${[student.name, student.surname].filter(Boolean).join(" ")}`;
}

function StudentSearchField({
  entry,
  onChange,
}: {
  entry: ManpowerSheetEntry;
  onChange: (patch: Partial<ManpowerSheetEntry>) => void;
}) {
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    if (!entry.name.trim() || entry.studentId) return [];
    return studentsData
      .map((student) => ({ student, score: studentSearchScore(student, entry.name) }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((first, second) => first.score - second.score)
      .slice(0, 10)
      .map(({ student }) => student);
  }, [entry.name, entry.studentId]);

  const selectStudent = (student: Student) => {
    onChange({
      studentId: `${student.squad}:${student.number}`,
      name: studentName(student),
      squadNumber: `${student.squad}/${student.number}`,
    });
    setOpen(false);
  };

  return (
    <Popover open={open && !entry.studentId} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="manpower-cell-editor grid h-full min-h-[4.25rem] grid-cols-[2rem_minmax(0,1fr)]">
          <span className="flex items-center justify-center border-r border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500">
            <Search className="pointer-events-none h-3.5 w-3.5" />
          </span>
          <Textarea
            value={toThaiDigits(entry.name)}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onChange({ studentId: "", name: event.target.value });
              setOpen(true);
            }}
            className="manpower-cell-input min-w-0 resize-none"
            placeholder="ค้นหาชื่อ เลขที่ หรืออักษรย่อ"
            aria-label="ค้นหารายชื่อนักเรียนนายร้อยตำรวจ"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[min(24rem,calc(100vw-2rem))] p-1.5"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {results.length > 0 ? (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {results.map((student) => (
              <button
                key={`${student.squad}-${student.number}`}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-xs text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectStudent(student)}
              >
                <span className="min-w-0 break-words">{student.display_name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  มว.{toThaiDigits(student.squad)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 py-5 text-center text-xs text-muted-foreground">
            {entry.name.trim()
              ? "ไม่พบรายชื่อที่ใกล้เคียง"
              : "พิมพ์ชื่อ เลขที่ หรืออักษรย่อเพื่อค้นหา"}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CompactField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        value={toThaiDigits(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function PeriodDateField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [selectedYear, selectedMonth, selectedDay] = value.split("-").map(Number);
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    new Set([selectedYear, ...Array.from({ length: 11 }, (_, index) => currentYear - 3 + index)]),
  )
    .filter(Boolean)
    .sort((first, second) => first - second);
  const updateDatePart = (part: "day" | "month" | "year", nextValue: number) => {
    const year = part === "year" ? nextValue : selectedYear || currentYear;
    const month = part === "month" ? nextValue : selectedMonth || 1;
    const requestedDay = part === "day" ? nextValue : selectedDay || 1;
    const day = Math.min(requestedDay, new Date(year, month, 0).getDate());
    onChange(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  };
  const selectClass =
    "h-7 min-w-0 rounded border border-slate-300 bg-transparent px-0 text-center text-[11px] dark:border-slate-600";

  return (
    <div className="col-span-2 grid grid-cols-[2.25rem_minmax(0,1fr)] items-end gap-1">
      <span className="pb-1 text-[11px]">{label}</span>
      <div className="grid min-w-0 grid-cols-[0.8fr_0.8fr_1.15fr] gap-0.5">
        <label className="grid min-w-0 gap-0.5 text-center text-[9px]">
          <span>วัน</span>
          <select
            value={selectedDay || 1}
            onChange={(event) => updateDatePart("day", Number(event.target.value))}
            className={selectClass}
            aria-label={`${label} วัน`}
          >
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {toThaiDigits(day)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-0.5 text-center text-[9px]">
          <span>เดือน</span>
          <select
            value={selectedMonth || 1}
            onChange={(event) => updateDatePart("month", Number(event.target.value))}
            className={selectClass}
            aria-label={`${label} เดือน`}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {THAI_SHORT_MONTHS[month - 1]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-0.5 text-center text-[9px]">
          <span>ปี</span>
          <select
            value={selectedYear || currentYear}
            onChange={(event) => updateDatePart("year", Number(event.target.value))}
            className={selectClass}
            aria-label={`${label} ปี`}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {toThaiDigits(year + 543)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function PeriodTimeField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [selectedHour = "", selectedMinute = ""] = value.split(":");
  const updateTimePart = (part: "hour" | "minute", nextValue: string) => {
    const hour = part === "hour" ? nextValue : selectedHour || "00";
    const minute = part === "minute" ? nextValue : selectedMinute || "00";
    onChange(hour && minute ? `${hour}:${minute}` : "");
  };
  const selectClass =
    "h-7 min-w-0 rounded border border-slate-300 bg-transparent px-0 text-center text-[11px] dark:border-slate-600";

  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-end gap-0.5">
      <label className="grid min-w-0 gap-0.5 text-center text-[9px]">
        <span>ชั่วโมง</span>
        <select
          value={selectedHour}
          onChange={(event) => updateTimePart("hour", event.target.value)}
          className={selectClass}
          aria-label={`${label} ชั่วโมง`}
        >
          <option value="">--</option>
          {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((hour) => (
            <option key={hour} value={hour}>
              {toThaiDigits(hour)}
            </option>
          ))}
        </select>
      </label>
      <span className="pb-1 text-[12px]">:</span>
      <label className="grid min-w-0 gap-0.5 text-center text-[9px]">
        <span>นาที</span>
        <select
          value={selectedMinute}
          onChange={(event) => updateTimePart("minute", event.target.value)}
          className={selectClass}
          aria-label={`${label} นาที`}
        >
          <option value="">--</option>
          {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map(
            (minute) => (
              <option key={minute} value={minute}>
                {toThaiDigits(minute)}
              </option>
            ),
          )}
        </select>
      </label>
    </div>
  );
}

function PeriodField({
  entry,
  onChange,
}: {
  entry: ManpowerSheetEntry;
  onChange: (patch: Partial<ManpowerSheetEntry>) => void;
}) {
  const mode = entry.periodMode || "same-day";
  const updatePeriod = (patch: Partial<ManpowerSheetEntry>) => {
    const nextEntry = { ...entry, ...patch };
    onChange({ ...patch, period: formatManpowerPeriod(nextEntry) });
  };

  return (
    <div className="manpower-period-editor flex min-h-[4.25rem] flex-col gap-1 p-1">
      <select
        value={mode}
        onChange={(event) => {
          const nextMode = event.target.value as ManpowerSheetEntry["periodMode"];
          updatePeriod({
            periodMode: nextMode,
            category: nextMode === "medical-admission" ? "sick" : entry.category,
            ...(nextMode === "medical-admission"
              ? {
                  periodEndTime: "",
                  periodEndDate: entry.periodStartDate || entry.periodEndDate,
                }
              : {}),
          });
        }}
        className="h-7 w-full rounded border border-slate-300 bg-transparent px-1 text-center text-[12px] dark:border-slate-600"
        aria-label="รูปแบบวันและเวลา"
      >
        <option value="same-day">ลาภายในวันเดียวกัน</option>
        <option value="cross-day">ลาข้ามวัน</option>
        <option value="medical-admission">ป่วยแอดมิท</option>
      </select>

      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-1">
        <span className="text-[11px]">เริ่ม</span>
        <PeriodTimeField
          label="เวลาเริ่ม"
          value={entry.periodStartTime || ""}
          onChange={(value) => updatePeriod({ periodStartTime: value })}
        />
        {mode !== "same-day" && (
          <PeriodDateField
            label="วันที่เริ่ม"
            value={entry.periodStartDate || ""}
            onChange={(value) => updatePeriod({ periodStartDate: value })}
          />
        )}

        {mode === "medical-admission" ? (
          <div className="col-span-2 rounded border border-dashed border-amber-400/70 bg-amber-50/70 px-1.5 py-1 text-[10px] leading-tight text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
            มีผลต่อเนื่องจนกว่าจะลบยอดจำหน่าย
          </div>
        ) : (
          <>
            <span className="text-[11px]">ถึง</span>
            <PeriodTimeField
              label="เวลาสิ้นสุด"
              value={entry.periodEndTime || ""}
              onChange={(value) => updatePeriod({ periodEndTime: value })}
            />

            <PeriodDateField
              label={mode === "same-day" ? "วันที่ลา" : "วันที่สิ้นสุด"}
              value={mode === "same-day" ? entry.periodStartDate || "" : entry.periodEndDate || ""}
              onChange={(value) =>
                updatePeriod(
                  mode === "same-day" ? { periodStartDate: value } : { periodEndDate: value },
                )
              }
            />
          </>
        )}
      </div>

      {getManpowerEntryPeriod(entry) && (
        <span className="whitespace-pre-line border-t border-dashed border-slate-300 pt-1 text-[10px] leading-tight dark:border-slate-600">
          {toThaiDigits(getManpowerEntryPeriod(entry))}
        </span>
      )}
    </div>
  );
}

function ManpowerSheetPage() {
  const [reportDate, setReportDate] = useState(todayISO());
  const [signatureId, setSignatureId] = useState("pannaphong");
  const [exporting, setExporting] = useState<"pdf" | "jpg" | "word" | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedFiles, setImportedFiles] = useState<string[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftSavedInCloud, setDraftSavedInCloud] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ManpowerSheetData>({
    reportTime: "08.00",
    dutyOfficerName: "ร.ต.อ.พรรณพงศ์ จีนโน",
    dutyOfficerPhone: "09 4691 5380",
    fullStrength: 270,
    reporterName: "ภูริจักษ์ มาโชติ",
    reporterPosition: "ผู้ช่วย ผบ.มว.ร้อย ๔ ปค.๑ บก.ปค.",
    entries: [createEmptyEntry()],
  });
  const signature = useMemo(
    () => MANPOWER_SIGNATURES.find((candidate) => candidate.id === signatureId) || null,
    [signatureId],
  );
  const summary = useMemo(() => summarizeManpowerEntries(data.entries), [data.entries]);
  const remaining = Math.max(0, data.fullStrength - summary.total);
  const documentDate = formatDocumentDate(reportDate);

  useEffect(() => {
    let active = true;
    const restoreDraft = async () => {
      const localDraft = readManpowerDraft();
      const cloudDraft = await readCloudManpowerDraft();
      if (!active) return;
      const draft = [localDraft, cloudDraft]
        .filter((candidate): candidate is ManpowerDraft => Boolean(candidate))
        .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0];
      if (draft) {
        setReportDate(draft.reportDate);
        setSignatureId(draft.signatureId);
        setImportText(draft.importText);
        setData(draft.data);
        setDraftSavedAt(draft.savedAt);
        setDraftSavedInCloud(draft === cloudDraft);
        saveManpowerDraft(draft);
      }
      setDraftReady(true);
    };
    void restoreDraft();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const timeout = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const draft = { reportDate, signatureId, importText, data, savedAt };
      if (saveManpowerDraft(draft)) {
        setDraftSavedAt(savedAt);
        setDraftSavedInCloud(false);
      }
      void saveCloudManpowerDraft(draft).then((saved) => {
        if (saved) setDraftSavedInCloud(true);
      });
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [data, draftReady, importText, reportDate, signatureId]);

  const updateData = <K extends keyof ManpowerSheetData>(key: K, value: ManpowerSheetData[K]) =>
    setData((current) => ({ ...current, [key]: value }));
  const updateEntry = (id: string, patch: Partial<ManpowerSheetEntry>) =>
    setData((current) => ({
      ...current,
      entries: current.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  const removeEntry = (id: string) =>
    setData((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== id),
    }));
  const changeSignature = (id: string) => {
    setSignatureId(id);
    const selectedSignature = MANPOWER_SIGNATURES.find((item) => item.id === id);
    if (!selectedSignature) return;
    setData((current) => ({
      ...current,
      dutyOfficerName: selectedSignature.dutyOfficerName,
      dutyOfficerPhone: selectedSignature.dutyOfficerPhone,
    }));
  };
  const applyImportedEntries = (entries: ParsedManpowerEntry[]) => {
    if (entries.length === 0) return false;
    setData((current) => {
      const nextEntries = [...current.entries];
      const claimedIndexes = new Set<number>();
      entries.forEach((imported) => {
        const sameImportedRecord = (entry: ManpowerSheetEntry) =>
          Boolean(
            imported.studentId &&
            entry.studentId === imported.studentId &&
            entry.category === imported.category &&
            entry.detail.trim() === imported.detail.trim() &&
            entry.period.trim() === imported.period.trim() &&
            entry.note.trim() === imported.note.trim(),
          );
        const isNameOnlyDraft = (entry: ManpowerSheetEntry) =>
          Boolean(
            (imported.studentId && entry.studentId === imported.studentId) ||
            (entry.name.trim() && entry.name.trim() === imported.name.trim()),
          ) &&
          !entry.detail.trim() &&
          !entry.period.trim() &&
          !entry.note.trim();
        const matchingIndex = nextEntries.findIndex(
          (entry, index) =>
            !claimedIndexes.has(index) && (sameImportedRecord(entry) || isNameOnlyDraft(entry)),
        );
        const emptyIndex = nextEntries.findIndex(
          (entry, index) => !claimedIndexes.has(index) && !isManpowerEntryFilled(entry),
        );
        const targetIndex = matchingIndex >= 0 ? matchingIndex : emptyIndex;
        if (targetIndex < 0) {
          nextEntries.push({ ...imported, id: crypto.randomUUID() });
          claimedIndexes.add(nextEntries.length - 1);
          return;
        }
        claimedIndexes.add(targetIndex);
        const currentEntry = nextEntries[targetIndex];
        if (!isManpowerEntryFilled(currentEntry)) {
          nextEntries[targetIndex] = { ...imported, id: currentEntry.id };
          return;
        }
        nextEntries[targetIndex] = {
          ...currentEntry,
          studentId: currentEntry.studentId || imported.studentId,
          name: currentEntry.name || imported.name,
          squadNumber: currentEntry.squadNumber || imported.squadNumber,
          category:
            !currentEntry.detail && !currentEntry.period && !currentEntry.note
              ? imported.category
              : currentEntry.category,
          detail: currentEntry.detail || imported.detail,
          period: currentEntry.period || imported.period,
          periodMode: currentEntry.period ? currentEntry.periodMode : imported.periodMode,
          periodStartTime: currentEntry.period
            ? currentEntry.periodStartTime
            : imported.periodStartTime,
          periodEndTime: currentEntry.period ? currentEntry.periodEndTime : imported.periodEndTime,
          periodStartDate: currentEntry.period
            ? currentEntry.periodStartDate
            : imported.periodStartDate,
          periodEndDate: currentEntry.period ? currentEntry.periodEndDate : imported.periodEndDate,
          note: currentEntry.note || imported.note,
        };
      });
      return { ...current, entries: nextEntries };
    });
    return true;
  };
  const classifyImportText = (source = importText, quiet = false) => {
    const entries = parseManpowerImportText(source, reportDate);
    const applied = applyImportedEntries(entries);
    if (applied) {
      // จำแนกเสร็จแล้วล้างกล่องนำเข้า เพื่อพร้อมรับข้อมูลชุดถัดไปและไม่ให้
      // ข้อความชุดเดิมถูกนำมาปนซ้ำโดยไม่ตั้งใจ
      setImportText("");
      setImportedFiles([]);
    }
    if (!quiet) {
      if (applied) toast.success(`จำแนกข้อมูลลงตาราง ${toThaiDigits(entries.length)} รายการแล้ว`);
      else toast.error("ไม่พบชื่อที่จำแนกได้ กรุณาตรวจข้อความหรือกรอกตารางด้วยตนเอง");
    }
    return applied;
  };
  const importFiles = async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;
    setImporting(true);
    try {
      const results = await Promise.allSettled(selectedFiles.map(extractManpowerImportText));
      const extracted = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
        .map((result) => result.value)
        .filter(Boolean);
      const errors = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) =>
          result.reason instanceof Error ? result.reason.message : "อ่านไฟล์ไม่สำเร็จ",
        );
      if (extracted.length > 0) {
        const combinedText = [importText.trim(), ...extracted].filter(Boolean).join("\n\n");
        setImportText(combinedText);
        setImportedFiles((current) => [
          ...current,
          ...selectedFiles
            .filter((_, index) => results[index]?.status === "fulfilled")
            .map(({ name }) => name),
        ]);
        toast.success(`นำเข้าข้อมูลจาก ${toThaiDigits(extracted.length)} ไฟล์แล้ว`);
        if (classifyImportText(combinedText, true)) {
          toast.success("จำแนกชื่อ รายละเอียด สถานที่ และเวลาลงตารางแล้ว");
        }
      }
      errors.forEach((message) => toast.error(message));
    } finally {
      setImporting(false);
    }
  };
  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void importFiles(event.target.files || []);
    event.target.value = "";
  };
  const handleImportDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void importFiles(event.dataTransfer.files);
  };

  const downloadPdf = async () => {
    if (!reportDate) return toast.error("กรุณาเลือกวันที่");
    const downloadPreparation = prepareBlobDownload();
    setExporting("pdf");
    try {
      const bytes = await buildManpowerSheetPdf({ reportDate, signature, data });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const outcome = await downloadBlob(
        blob,
        manpowerSheetFilename(reportDate),
        downloadPreparation,
      );
      toast.success(
        outcome === "ready" ? "ไฟล์พร้อมแล้ว แตะบันทึกลงโทรศัพท์" : "สร้างใบกำลังพลเรียบร้อยแล้ว",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "สร้างใบกำลังพลไม่สำเร็จ");
    } finally {
      setExporting(null);
    }
  };

  const downloadJpg = async () => {
    if (!reportDate) return toast.error("กรุณาเลือกวันที่");
    const downloadPreparation = prepareBlobDownload();
    setExporting("jpg");
    try {
      const pdfBytes = await buildManpowerSheetPdf({ reportDate, signature, data });
      const blob = await renderManpowerPdfAsJpg(pdfBytes);
      const outcome = await downloadBlob(
        blob,
        manpowerSheetFilename(reportDate, "jpg"),
        downloadPreparation,
      );
      toast.success(
        outcome === "ready" ? "ไฟล์พร้อมแล้ว แตะบันทึกลงโทรศัพท์" : "สร้างไฟล์ JPG เรียบร้อยแล้ว",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "สร้างไฟล์ JPG ไม่สำเร็จ");
    } finally {
      setExporting(null);
    }
  };

  const downloadWord = async () => {
    if (!reportDate) return toast.error("กรุณาเลือกวันที่");
    const downloadPreparation = prepareBlobDownload();
    setExporting("word");
    try {
      const blob = await buildManpowerSheetDocx({ reportDate, signature, data });
      const outcome = await downloadBlob(
        blob,
        manpowerSheetFilename(reportDate, "docx"),
        downloadPreparation,
      );
      toast.success(
        outcome === "ready" ? "ไฟล์พร้อมแล้ว แตะบันทึกลงโทรศัพท์" : "สร้างไฟล์ Word เรียบร้อยแล้ว",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "สร้างไฟล์ Word ไม่สำเร็จ");
    } finally {
      setExporting(null);
    }
  };

  const count = (category: keyof typeof summary.counts) =>
    summary.counts[category] ? toThaiDigits(summary.counts[category]) : "-";

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-2 py-4 sm:px-4 sm:py-6">
      <Card className="reveal overflow-hidden rounded-xl">
        <div className="gold-gradient h-1 w-full opacity-70" />
        <CardHeader className="gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="gold-text flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" /> ใบกำลังพล
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                รูปแบบเดียวกับเอกสารต้นฉบับ ข้อมูลทั้งหมดกรอกและแก้ไขได้โดยไม่เชื่อมยอดรายงาน
              </p>
              <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                {draftSavedAt
                  ? `${
                      draftSavedInCloud
                        ? "บันทึกร่างอัตโนมัติในระบบแล้ว"
                        : "บันทึกร่างอัตโนมัติในอุปกรณ์แล้ว"
                    } ${new Intl.DateTimeFormat("th-TH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(draftSavedAt))} น.`
                  : "ระบบจะบันทึกร่างอัตโนมัติในบัญชีและอุปกรณ์นี้"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                className={exportButtonClass}
                onClick={downloadWord}
                disabled={Boolean(exporting) || !reportDate}
              >
                {exporting === "word" ? <Loader2 className="animate-spin" /> : <FileType2 />}
                {exporting === "word" ? "กำลังสร้าง Word..." : "ดาวน์โหลด Word"}
              </Button>
              <Button
                type="button"
                className={exportButtonClass}
                onClick={downloadPdf}
                disabled={Boolean(exporting) || !reportDate}
              >
                {exporting === "pdf" ? <Loader2 className="animate-spin" /> : <Download />}
                {exporting === "pdf" ? "กำลังสร้าง PDF..." : "ดาวน์โหลด PDF"}
              </Button>
              <Button
                type="button"
                className={exportButtonClass}
                onClick={downloadJpg}
                disabled={Boolean(exporting) || !reportDate}
              >
                {exporting === "jpg" ? <Loader2 className="animate-spin" /> : <FileImage />}
                {exporting === "jpg" ? "กำลังสร้าง JPG..." : "ดาวน์โหลด JPG"}
              </Button>
            </div>
          </div>
          <div className="border-t pt-4">
            <Label className="text-xs">นำเข้าข้อมูล</Label>
            <div
              className="mt-1.5 rounded-lg border border-dashed border-primary/45 bg-muted/20 p-2 transition-colors focus-within:border-primary hover:border-primary"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleImportDrop}
            >
              <Textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                className="min-h-28 resize-y border-0 bg-transparent shadow-none focus-visible:ring-0"
                placeholder="พิมพ์หรือวางข้อความที่นี่ หรือลาก Word, PDF, รูปภาพ และไฟล์ข้อความมาวาง"
                aria-label="นำเข้าข้อมูลจากข้อความหรือไฟล์"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed pt-2">
                <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                  {importing
                    ? "กำลังอ่านข้อความจากไฟล์..."
                    : importedFiles.length > 0
                      ? `ไฟล์ที่นำเข้า: ${importedFiles.join(", ")}`
                      : "รองรับ .docx, .pdf, รูปภาพ, .txt, .csv, .json และการวางข้อความ"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={importing || !importText.trim()}
                    onClick={() => classifyImportText()}
                  >
                    <Sparkles /> จำแนกลงตาราง
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={importing}
                    onClick={() => importFileInputRef.current?.click()}
                  >
                    {importing ? <Loader2 className="animate-spin" /> : <Paperclip />}
                    {importing ? "กำลังนำเข้า..." : "เลือกไฟล์"}
                  </Button>
                </div>
                <input
                  ref={importFileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleImportFileChange}
                />
              </div>
            </div>
          </div>
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <CompactField
              label="นายตำรวจเวรตรวจระเบียบ"
              value={data.dutyOfficerName}
              onChange={(value) => updateData("dutyOfficerName", value)}
              placeholder="ยศ ชื่อ นามสกุล"
            />
            <CompactField
              label="โทรศัพท์"
              value={data.dutyOfficerPhone}
              onChange={(value) => updateData("dutyOfficerPhone", value)}
              placeholder="หมายเลขโทรศัพท์"
            />
            <div className="space-y-1.5">
              <Label className="text-xs">ลายเซ็น ผบ.มว.</Label>
              <select
                value={signatureId}
                onChange={(event) => changeSignature(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm"
              >
                <option value="">ไม่ใส่ลายเซ็น</option>
                {MANPOWER_SIGNATURES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ชื่อไฟล์</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                {toThaiDigits(manpowerSheetFilename(reportDate))}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <section
        data-manpower-paper
        className="manpower-paper mx-auto max-w-[794px] overflow-hidden rounded-sm border border-slate-300 bg-white text-black shadow-xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      >
        <div className="px-[4.5%] pb-10 pt-5 sm:pt-6">
          <header className="manpower-document-header text-center font-semibold leading-none">
            <img
              src="/manpower/police-logo.png"
              alt="ตราโรงเรียนนายร้อยตำรวจ"
              className="mx-auto h-[78px] w-[88px] object-contain sm:h-[88px] sm:w-[100px]"
            />
            <div className="mt-1 leading-tight">รายงานยอดกำลังพล</div>
            <div className="mt-0.5 leading-tight">กองร้อยที่ ๔ ปค.๑ บก.ปค.</div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1 leading-6">
              <span>ประจำวัน</span>
              <label className="relative cursor-pointer text-red-600 dark:text-red-400">
                {documentDate.weekday} ที่ {documentDate.day} เดือน {documentDate.month} พ.ศ.{" "}
                {documentDate.year}
                <input
                  type="date"
                  value={reportDate}
                  onChange={(event) => setReportDate(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="วันเดือนปีของใบกำลังพล"
                />
              </label>
              <span>เวลา</span>
              <input
                value={toThaiDigits(data.reportTime)}
                onChange={(event) => updateData("reportTime", event.target.value)}
                className="w-[4.4rem] border-0 border-b border-dashed border-red-400 bg-transparent text-center font-semibold text-red-600 outline-none dark:text-red-400"
                aria-label="เวลารายงาน"
              />
              <span>น.</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-1 leading-6">
              <span>นายตำรวจเวรตรวจระเบียบ</span>
              <span className="text-red-600 dark:text-red-400">{data.dutyOfficerName || "-"}</span>
              <span>โทร.</span>
              <span className="text-red-600 dark:text-red-400">
                {toThaiDigits(data.dutyOfficerPhone || "-")}
              </span>
            </div>
          </header>

          <div className="mt-1 overflow-x-auto pb-2">
            <div className="manpower-document-body min-w-[710px]">
              <table
                data-manpower-summary
                className="w-full table-fixed border-collapse text-center"
              >
                <colgroup>
                  {[13, 10.2, 10.8, 9.9, 10.2, 10.2, 10.2, 11, 14.7].map((width, index) => (
                    <col key={index} style={{ width: `${width}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th
                      colSpan={9}
                      className="manpower-cell bg-[#00b050] py-1 font-semibold text-black"
                    >
                      สถานภาพกำลังพล
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th rowSpan={3} className="manpower-cell bg-[#00b050] font-semibold text-black">
                      กำลังพล
                    </th>
                    <th rowSpan={2} className="manpower-cell bg-[#00b050] font-semibold text-black">
                      ยอดเต็ม
                    </th>
                    <th
                      colSpan={6}
                      className="manpower-cell bg-[#fbe4d5] py-1 font-semibold text-black"
                    >
                      รายการจำหน่าย
                    </th>
                    <th rowSpan={2} className="manpower-cell bg-[#00b050] font-semibold text-black">
                      คงเหลือ
                    </th>
                  </tr>
                  <tr className="bg-[#fbe4d5] text-black">
                    {["ราชการ", "ลา", "ป่วย", "ขาด", "อื่นๆ", "รวม"].map((label) => (
                      <th key={label} className="manpower-cell py-1 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <td className="manpower-cell bg-white dark:bg-slate-950">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={toThaiDigits(data.fullStrength)}
                        onChange={(event) =>
                          updateData(
                            "fullStrength",
                            Math.max(0, Number(toArabicDigits(event.target.value)) || 0),
                          )
                        }
                        className="w-full bg-transparent text-center outline-none"
                        aria-label="ยอดเต็ม"
                      />
                    </td>
                    <td className="manpower-cell">{count("official")}</td>
                    <td className="manpower-cell">{count("leave")}</td>
                    <td className="manpower-cell">{count("sick")}</td>
                    <td className="manpower-cell">{count("absent")}</td>
                    <td className="manpower-cell">{count("other")}</td>
                    <td className="manpower-cell">
                      {summary.total ? toThaiDigits(summary.total) : "-"}
                    </td>
                    <td className="manpower-cell">{toThaiDigits(remaining)}</td>
                  </tr>
                </tbody>
              </table>

              <table
                data-manpower-entries
                className="mt-1 w-full table-fixed border-collapse text-center"
              >
                <colgroup>
                  {[6.7, 21.3, 12, 9.3, 16, 22.7, 12].map((width, index) => (
                    <col key={index} style={{ width: `${width}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th
                      colSpan={7}
                      className="manpower-cell bg-[#00b050] py-1 font-semibold text-black"
                    >
                      รายการจำหน่าย
                    </th>
                  </tr>
                  <tr className="bg-[#00b050] text-black">
                    {[
                      "ลำดับ",
                      "ชื่อ  นามสกุล",
                      "หมวด/เลขที่",
                      "จำหน่าย",
                      "รายละเอียด",
                      "วัน เวลา",
                      "หมายเหตุ",
                    ].map((label) => (
                      <th key={label} className="manpower-cell py-1 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="manpower-cell py-7 text-slate-500 dark:text-slate-400"
                      >
                        ไม่มีรายการ กด “เพิ่มรายการ” เพื่อเริ่มกรอกข้อมูล
                      </td>
                    </tr>
                  ) : (
                    data.entries.map((entry, index) => (
                      <tr
                        key={entry.id}
                        data-manpower-entry-row
                        data-manpower-entry-id={entry.id}
                        data-manpower-filled={isManpowerEntryFilled(entry) ? "true" : "false"}
                        className="group align-middle"
                      >
                        <td className="manpower-cell">{toThaiDigits(index + 1)}.</td>
                        <td className="manpower-cell p-0.5">
                          <StudentSearchField
                            entry={entry}
                            onChange={(patch) => updateEntry(entry.id, patch)}
                          />
                        </td>
                        <td className="manpower-cell p-0.5">
                          <Input
                            value={toThaiDigits(entry.squadNumber)}
                            onChange={(event) =>
                              updateEntry(entry.id, {
                                studentId: "",
                                squadNumber: event.target.value,
                              })
                            }
                            className="manpower-cell-input text-center"
                            placeholder="มว./เลขที่"
                          />
                        </td>
                        <td className="manpower-cell p-0.5">
                          <select
                            value={entry.category}
                            onChange={(event) =>
                              updateEntry(entry.id, {
                                category: event.target.value as ManpowerSheetEntry["category"],
                              })
                            }
                            className="manpower-cell-input w-full text-center"
                          >
                            {MANPOWER_CATEGORIES.map((category) => (
                              <option key={category} value={category}>
                                {MANPOWER_CATEGORY_LABELS[category]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="manpower-cell p-0.5">
                          <Textarea
                            value={toThaiDigits(entry.detail)}
                            onChange={(event) =>
                              updateEntry(entry.id, { detail: event.target.value })
                            }
                            className="manpower-cell-input resize-none"
                            placeholder="รายละเอียด"
                          />
                        </td>
                        <td className="manpower-cell p-0.5">
                          <PeriodField
                            entry={entry}
                            onChange={(patch) => updateEntry(entry.id, patch)}
                          />
                        </td>
                        <td className="manpower-cell p-0.5">
                          <div className="manpower-cell-editor grid h-full min-h-[4.25rem] grid-cols-[minmax(0,1fr)_2rem]">
                            <Textarea
                              value={toThaiDigits(entry.note)}
                              onChange={(event) =>
                                updateEntry(entry.id, { note: event.target.value })
                              }
                              className="manpower-cell-input min-w-0 resize-none"
                              placeholder="หมายเหตุ"
                            />
                            <button
                              type="button"
                              onClick={() => removeEntry(entry.id)}
                              className="flex h-full min-h-[4.25rem] items-center justify-center border-l border-slate-300 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:border-slate-600 dark:text-red-400 dark:hover:bg-red-950/60"
                              aria-label={`ลบรายการที่ ${index + 1}`}
                              title="ลบรายการ"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div
                data-manpower-add-row
                className="border-x border-b border-slate-400 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-900"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-[14px]"
                  onClick={() => updateData("entries", [...data.entries, createEmptyEntry()])}
                >
                  <Plus /> เพิ่มรายการ
                </Button>
              </div>

              <div
                data-manpower-signatures
                className="mt-8 text-[14px] font-semibold leading-[1.35]"
              >
                <div className="mx-auto w-full max-w-[300px] text-center">
                  <div className="relative mx-auto grid w-[14.25rem] grid-cols-[4.25rem_10rem] items-end">
                    <span className="whitespace-nowrap pb-1 text-right">ลงชื่อ นรต.</span>
                    <img
                      src={MANPOWER_REPORTER_SIGNATURE_PATH}
                      alt="ลายเซ็นผู้จัดทำรายงาน"
                      className="h-12 w-40 object-contain dark:rounded dark:bg-white"
                      style={{ transform: "translate(21px, -5px)" }}
                    />
                  </div>
                  <div className="mx-auto grid w-[14.25rem] grid-cols-[4.25rem_10rem]">
                    <span aria-hidden="true" />
                    <div className="flex items-center">
                      <span>(</span>
                      <label className="inline-grid min-w-0">
                        <span
                          className="invisible col-start-1 row-start-1 whitespace-pre"
                          aria-hidden="true"
                        >
                          {toThaiDigits(data.reporterName) || "-"}
                        </span>
                        <Input
                          value={toThaiDigits(data.reporterName)}
                          onChange={(event) => updateData("reporterName", event.target.value)}
                          className="manpower-signature-input col-start-1 row-start-1 h-6 min-w-0 border-0 bg-transparent px-0 text-center shadow-none"
                          aria-label="ผู้จัดทำรายงาน"
                        />
                      </label>
                      <span>)</span>
                    </div>
                  </div>
                  <Input
                    value={toThaiDigits(data.reporterPosition)}
                    onChange={(event) => updateData("reporterPosition", event.target.value)}
                    className="manpower-signature-input mx-auto h-6 w-full border-0 bg-transparent px-1 text-center shadow-none"
                    aria-label="ตำแหน่งผู้จัดทำรายงาน"
                  />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-6 text-center sm:gap-14">
                  <div>
                    <div className="grid grid-cols-[auto_9.375rem] items-end justify-center">
                      <span className="whitespace-nowrap pb-1">
                        ลงชื่อ {signature?.rank || "ร.ต.อ."}
                      </span>
                      {signature && (
                        <img
                          src={signature.imagePath}
                          alt={`ลายเซ็น ${signature.officerName}`}
                          className="h-14 w-[150px] object-contain dark:rounded dark:bg-white"
                          style={
                            signature.id === "apinat" || signature.id === "panithan"
                              ? { transform: "scale(1.2)", transformOrigin: "center" }
                              : undefined
                          }
                        />
                      )}
                    </div>
                    <div>({signature?.officerName || "-"})</div>
                    <div>ผบ.มว.ร้อย ๔ ปค.๑ บก.ปค.</div>
                  </div>
                  <div>
                    <div className="grid grid-cols-[auto_9.375rem] items-end justify-center">
                      <span className="whitespace-nowrap pb-1">ลงชื่อ พ.ต.ท.</span>
                      <img
                        src={MANPOWER_COMPANY_COMMANDER_SIGNATURE_PATH}
                        alt="ลายเซ็นผู้บังคับกองร้อย"
                        className="h-14 w-[150px] object-contain dark:rounded dark:bg-white"
                      />
                    </div>
                    <div>(วรันธร พรดอนก่อ)</div>
                    <div>ผบ.ร้อย ๔ ปค.๑ บก.ปค.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/90 p-3 shadow-lg backdrop-blur">
        <span className="text-xs text-muted-foreground">
          ชื่อไฟล์: {toThaiDigits(manpowerSheetFilename(reportDate))}
        </span>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            className={exportButtonClass}
            onClick={downloadWord}
            disabled={Boolean(exporting) || !reportDate}
          >
            {exporting === "word" ? <Loader2 className="animate-spin" /> : <FileType2 />}
            {exporting === "word" ? "กำลังสร้าง..." : "ดาวน์โหลด Word"}
          </Button>
          <Button
            type="button"
            className={exportButtonClass}
            onClick={downloadPdf}
            disabled={Boolean(exporting) || !reportDate}
          >
            {exporting === "pdf" ? <Loader2 className="animate-spin" /> : <Download />}
            {exporting === "pdf" ? "กำลังสร้าง..." : "ดาวน์โหลด PDF"}
          </Button>
          <Button
            type="button"
            className={exportButtonClass}
            onClick={downloadJpg}
            disabled={Boolean(exporting) || !reportDate}
          >
            {exporting === "jpg" ? <Loader2 className="animate-spin" /> : <FileImage />}
            {exporting === "jpg" ? "กำลังสร้าง..." : "ดาวน์โหลด JPG"}
          </Button>
        </div>
      </div>
    </main>
  );
}
