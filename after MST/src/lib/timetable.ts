import { roomMatches } from "@/lib/rooms";

/** 0 = Sunday … 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TimetableEntry {
  id: string;
  day: Weekday;
  start: string;
  end: string;
  subject: string;
  room: string;
  className: string;
  teacher: string;
}

export interface ParseResult {
  entries: TimetableEntry[];
  errors: string[];
}

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export const TIMETABLE_KEY = "rst.timetable.v1";
export const TIMETABLE_EVENT = "rst:timetable";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `tt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DAY_NAMES: Record<string, Weekday> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

export function parseWeekday(raw: string): Weekday | null {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (!value) return null;
  if (value in DAY_NAMES) return DAY_NAMES[value] ?? null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return date.getDay() as Weekday;
  }
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    if (n === 0) return 0;
    if (n >= 1 && n <= 7) return (n === 7 ? 0 : n) as Weekday;
  }
  return null;
}

/**
 * Accepts 0900, 9, 9:30, 9.30 am, 9 30, 14:05, 2:05 PM, 2 p.m. … and returns HH:MM.
 *
 * OCR photos often put a space where the colon should be and sometimes read a
 * dot as a full stop, so those variants are accepted too.
 */
export function parseClock(raw: string): string | null {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/(\d)\.(?=\d)/g, "$1:")
    .replace(/\s+/g, " ");
  if (!value) return null;
  const match = value.match(/^(\d{1,2})(?:\s*:?\s*(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!match) return null;
  const hourRaw = match[1] ?? "";
  const minuteRaw = match[2] ?? "0";
  const meridiem = (match[3] ?? "").replace(/\./g, "");
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function formatClock(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  const hour = Number(hRaw ?? 0);
  const minute = mRaw ?? "00";
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const COLUMN_ALIASES = {
  day: ["day", "weekday", "dayofweek", "date"],
  start: ["start", "from", "starttime", "timein", "begin", "begins"],
  end: ["end", "to", "endtime", "timeout", "finish", "finishes"],
  subject: ["subject", "course", "coursename", "subjectname", "topic", "paper"],
  room: ["room", "roomcode", "venue", "location", "hall", "classroom"],
  className: ["class", "classname", "section", "batch", "group", "year"],
  teacher: ["teacher", "faculty", "instructor", "professor", "prof"],
} as const;

type Column = keyof typeof COLUMN_ALIASES;

function findColumn(headers: string[], column: Column): number {
  const aliases = COLUMN_ALIASES[column];
  for (let i = 0; i < headers.length; i += 1) {
    const header = normalizeHeader(headers[i] ?? "");
    if (aliases.some((alias) => header === alias || header.startsWith(alias))) return i;
  }
  return -1;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  const counts: Array<[string, number]> = [
    [",", (first.match(/,/g) ?? []).length],
    ["\t", (first.match(/\t/g) ?? []).length],
    [";", (first.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]?.[1] ? (counts[0][0] ?? ",") : ",";
}

function makeEntry(values: Partial<Omit<TimetableEntry, "id">>): TimetableEntry | null {
  const day = values.day;
  const start = values.start;
  const end = values.end;
  const subject = (values.subject ?? "").trim();
  const room = (values.room ?? "").trim();
  if (day === undefined || !start || !end || !subject || !room) return null;
  if (timeToMinutes(end) <= timeToMinutes(start)) return null;
  return {
    id: makeId(),
    day,
    start,
    end,
    subject,
    room,
    className: (values.className ?? "").trim(),
    teacher: (values.teacher ?? "").trim(),
  };
}

export function parseTimetableCsv(text: string): ParseResult {
  const errors: string[] = [];
  const entries: TimetableEntry[] = [];
  const rows = parseDelimited(text, detectDelimiter(text));
  if (rows.length === 0) return { entries, errors: ["The file is empty."] };

  const headers = rows[0] ?? [];
  const hasHeader = findColumn(headers, "day") >= 0 && findColumn(headers, "start") >= 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const indexes: Record<Column, number> = hasHeader
    ? {
        day: findColumn(headers, "day"),
        start: findColumn(headers, "start"),
        end: findColumn(headers, "end"),
        subject: findColumn(headers, "subject"),
        room: findColumn(headers, "room"),
        className: findColumn(headers, "className"),
        teacher: findColumn(headers, "teacher"),
      }
    : { day: 0, start: 1, end: 2, subject: 3, room: 4, className: 5, teacher: 6 };

  dataRows.forEach((row, index) => {
    const line = index + (hasHeader ? 2 : 1);
    const cell = (column: Column): string => {
      const at = indexes[column];
      return at >= 0 ? (row[at] ?? "") : "";
    };
    const day = parseWeekday(cell("day"));
    const start = parseClock(cell("start"));
    const end = parseClock(cell("end"));
    if (!day) {
      errors.push(`Line ${line}: could not read the day (“${cell("day")}”).`);
      return;
    }
    if (!start || !end) {
      errors.push(
        `Line ${line}: could not read the start/end time (“${cell("start")}” – “${cell("end")}”).`,
      );
      return;
    }
    const entry = makeEntry({
      day,
      start,
      end,
      subject: cell("subject"),
      room: cell("room"),
      className: cell("className"),
      teacher: cell("teacher"),
    });
    if (!entry) {
      errors.push(`Line ${line}: needs a subject, a room, and an end time after the start.`);
      return;
    }
    entries.push(entry);
  });

  if (entries.length === 0 && errors.length === 0) errors.push("No timetable rows found.");
  return { entries, errors };
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function icsValue(block: string, property: string): string {
  const pattern = new RegExp(`^${property}(?:;[^:]*)?:(.*)$`, "im");
  return unescapeIcs(block.match(pattern)?.[1] ?? "");
}

function icsDateTime(value: string): { day: Weekday; time: string } | null {
  const match = value.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!match) return null;
  const [, y, m, d, h, min] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: date.getDay() as Weekday,
    time: `${String(Number(h)).padStart(2, "0")}:${String(Number(min)).padStart(2, "0")}`,
  };
}

const ICS_DAYS: Record<string, Weekday> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function cleanLocation(value: string): string {
  const parts = value
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.find((part) => /\d/.test(part)) ?? parts[0] ?? value.trim();
}

export function parseTimetableIcs(text: string): ParseResult {
  const errors: string[] = [];
  const entries: TimetableEntry[] = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, " ");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) ?? [];
  if (blocks.length === 0) return { entries, errors: ["No events found in the calendar file."] };

  blocks.forEach((block, index) => {
    const label = block.match(/^SUMMARY(?:;[^:]*)?:(.*)$/im)?.[1]?.trim() || `Event ${index + 1}`;
    const startRaw = icsValue(block, "DTSTART");
    const endRaw = icsValue(block, "DTEND");
    const start = icsDateTime(startRaw);
    const end = icsDateTime(endRaw);
    if (!start) {
      errors.push(`${label}: missing or unsupported start date/time.`);
      return;
    }
    const endTime = end?.time ?? minutesToTime(timeToMinutes(start.time) + 60);
    if (timeToMinutes(endTime) <= timeToMinutes(start.time)) {
      errors.push(`${label}: end time is before the start time.`);
      return;
    }
    const subject = icsValue(block, "SUMMARY");
    const room = cleanLocation(icsValue(block, "LOCATION"));
    if (!subject || !room) {
      errors.push(`${label}: needs a summary and a location/room.`);
      return;
    }
    const description = icsValue(block, "DESCRIPTION");
    const teacher =
      description.match(/(?:teacher|faculty|instructor)\s*[:-]\s*([^;|\n]+)/i)?.[1]?.trim() ?? "";
    const className =
      description.match(/(?:class|section|batch|group)\s*[:-]\s*([^;|\n]+)/i)?.[1]?.trim() ?? "";
    const byDay = block.match(/BYDAY=([A-Z,]+)/i)?.[1];
    const days: Weekday[] = byDay
      ? byDay
          .split(",")
          .map((code) => ICS_DAYS[code.trim().toUpperCase()])
          .filter((day): day is Weekday => day !== undefined)
      : [start.day];
    days.forEach((day) => {
      entries.push({
        id: makeId(),
        day,
        start: start.time,
        end: endTime,
        subject,
        room,
        className,
        teacher,
      });
    });
  });

  if (entries.length === 0 && errors.length === 0) errors.push("No usable events found.");
  return { entries, errors };
}

export function parseTimetable(text: string): ParseResult {
  if (/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(text)) return parseTimetableIcs(text);
  const csv = parseTimetableCsv(text);
  if (csv.entries.length > 0) return csv;
  const plain = parseTimetablePlainText(text);
  if (plain.entries.length > 0 || plain.errors.length === 0) return plain;
  return {
    entries: [],
    errors: [...new Set([...csv.errors, ...plain.errors])].slice(0, 8),
  };
}

const PLAIN_DAY_RE =
  /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?)\b/i;
const CLOCK_TEXT = String.raw`\d{1,2}(?:\s*[:.]?\s*\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?`;
const PLAIN_TIME_RE = new RegExp(
  `(${CLOCK_TEXT})\\s*(?:-|–|—|\\bto\\b|\\buntil\\b|\\btill\\b|\\bthrough\\b)\\s*(${CLOCK_TEXT})`,
  "i",
);
const PLAIN_SPACED_TIME_RE = new RegExp(
  `\\b(\\d{1,2}[:.]\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)\\s+(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)\\b`,
  "i",
);
const PLAIN_ROOM_RE = /\b(CSED|LT|LP|SAC)[\s-]?([A-Z0-9]{1,6})\b/i;
const PLAIN_LAB_ROOM_RE = /\bCSED[\s-]?LAB[\s-]?([0-9OIl]{1,3})\b/i;
const PLAIN_STANDALONE_LAB_RE = /\bLAB[\s-]?([0-9OIl]{1,3})\b/i;
const PLAIN_GENERIC_ROOM_RE = /\b([A-Z]{2,6})[\s-]?([0-9]{1,4}[A-Z]?)\b/;
const PLAIN_SHORT_ROOM_RE = /\b([A-Z])\s?[- ]\s?([0-9]{2,4})\b/;
const PLAIN_CLASS_RE =
  /\b(?:COE|CSE|ECE|ME|CE|B\.?Tech|M\.?Tech|MCA|BCA)\s*[- ]?\s*(?:\d\s*)?[A-Z]?\b/i;
const PLAIN_TEACHER_RE = /\b(?:Dr|Mr|Ms|Mrs|Prof)\.?\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\b/i;
const CLASS_CODE_PREFIX_RE = /^(?:COE|CSE|ECE|ME|CE|CHE|BT|MT|MCA|BCA|BBA|MBA|BCOM|MCOM)$/i;

function findPlainTimeRange(line: string): RegExpMatchArray | null {
  return line.match(PLAIN_TIME_RE) ?? line.match(PLAIN_SPACED_TIME_RE);
}

function parsePlainClock(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/o/g, "0")
    .replace(/(\d)[il]/g, (_match, digit: string) => `${digit}1`)
    .replace(/[il](\d)/g, (_match, digit: string) => `1${digit}`)
    .replace(/^[il]+(?=\d)/, (match) => "1".repeat(match.length));
  const parsed = parseClock(cleaned);
  if (!parsed) return null;
  if (/a\.?m|p\.?m/.test(cleaned)) return parsed;
  const hour = Number(parsed.slice(0, 2));
  // Campus timetables run from morning to early evening: bare 1–7 means PM.
  if (hour >= 1 && hour <= 7) return `${String(hour + 12).padStart(2, "0")}:${parsed.slice(3)}`;
  return parsed;
}

function cleanPlainLine(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\t/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPlainPiece(value: string): string {
  return value
    .replace(/[|,;]+/g, " ")
    .replace(/[-–—]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRoomDigits(value: string): string {
  return value.toUpperCase().replace(/[O]/g, "0").replace(/[IL]/g, "1");
}

function makeRoomCode(building: string, tail: string): string {
  return `${building.toUpperCase()}-${normalizeRoomDigits(tail)}`;
}

function extractPlainRoom(value: string): string | null {
  const text = value.replace(/[–—]/g, "-");
  const csedLab = text.match(PLAIN_LAB_ROOM_RE);
  if (csedLab?.[1]) return `CSED-LAB-${normalizeRoomDigits(csedLab[1])}`;
  const explicit = text.match(PLAIN_ROOM_RE);
  if (explicit?.[1] && explicit[2]) return makeRoomCode(explicit[1], explicit[2]);
  const standaloneLab = text.match(PLAIN_STANDALONE_LAB_RE);
  if (standaloneLab?.[1]) return `LAB-${normalizeRoomDigits(standaloneLab[1])}`;
  const generic = text.match(PLAIN_GENERIC_ROOM_RE);
  if (generic?.[1] && generic[2] && !CLASS_CODE_PREFIX_RE.test(generic[1])) {
    return makeRoomCode(generic[1], generic[2]);
  }
  const short = text.match(PLAIN_SHORT_ROOM_RE);
  if (short?.[1] && short[2]) return makeRoomCode(short[1], short[2]);
  return null;
}

/**
 * Reads timetable text that is not CSV/ICS — for example text copied from a
 * PDF or recognised from a timetable photo.
 *
 * OCR photos rarely keep a whole class on one line. A class can start with a
 * day, then have the time, subject, room and teacher on separate lines. This
 * parser therefore groups the lines around each time range instead of
 * requiring one perfect line per class.
 */
export function parseTimetablePlainText(text: string): ParseResult {
  const errors: string[] = [];
  const entries: TimetableEntry[] = [];
  const seen = new Set<string>();
  let currentDay: Weekday | null = null;
  let buffer: string[] = [];

  const lines = text.split(/\r?\n/).map(cleanPlainLine).filter(Boolean);
  const headerRe =
    /^(day|time|subject|course|room|venue|class|teacher|faculty|timetable|schedule)\b/i;
  const furnitureRe = /^(page\s+\d+|semester|department|batch|section)\b/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (headerRe.test(line) || furnitureRe.test(line)) continue;

    const timeMatch = findPlainTimeRange(line);
    if (!timeMatch?.[1] || !timeMatch[2]) {
      // Day headings and page furniture have no time; remember them as context.
      const dayMatch = line.match(PLAIN_DAY_RE);
      if (dayMatch?.[1]) {
        const day = parseWeekday(dayMatch[1]);
        if (day !== null) currentDay = day;
        const rest = cleanPlainPiece(line.replace(PLAIN_DAY_RE, " "));
        buffer = rest ? [rest] : [];
        continue;
      }
      buffer.push(line);
      if (buffer.length > 4) buffer.shift();
      continue;
    }

    const dayMatch = line.match(PLAIN_DAY_RE) ?? buffer.join(" ").match(PLAIN_DAY_RE);
    if (dayMatch?.[1]) {
      const day = parseWeekday(dayMatch[1]);
      if (day !== null) currentDay = day;
    }
    if (currentDay === null) {
      errors.push(`Line ${index + 1}: could not work out the day.`);
      buffer = [];
      continue;
    }

    const before = cleanPlainPiece(buffer.map((item) => item.replace(PLAIN_DAY_RE, " ")).join(" "));
    let combined = cleanPlainPiece(`${before} ${line.replace(timeMatch[0], " ")}`);
    combined = cleanPlainPiece(combined.replace(PLAIN_DAY_RE, " "));

    // Pull in the next lines until the next class or day heading. This is the
    // common OCR layout: time on one line, subject/room/teacher below it.
    let cursor = index + 1;
    while (cursor < lines.length && cursor <= index + 6) {
      const next = lines[cursor] ?? "";
      if (!next || headerRe.test(next) || findPlainTimeRange(next) || PLAIN_DAY_RE.test(next)) {
        break;
      }
      combined = cleanPlainPiece(`${combined} ${next}`);
      cursor += 1;
    }

    const start = parsePlainClock(timeMatch[1]);
    const end = parsePlainClock(timeMatch[2]);
    if (!start || !end || timeToMinutes(end) <= timeToMinutes(start)) {
      errors.push(`Line ${index + 1}: could not read the time range.`);
      buffer = [];
      continue;
    }

    const room = extractPlainRoom(combined);
    if (!room) {
      errors.push(`Line ${index + 1}: no room code found.`);
      buffer = [];
      continue;
    }

    const withoutRoom = cleanPlainPiece(combined.replace(roomRemovalPattern(room), " "));
    const className = withoutRoom.match(PLAIN_CLASS_RE)?.[0]?.trim() ?? "";
    const teacher = withoutRoom.match(PLAIN_TEACHER_RE)?.[0]?.trim() ?? "";
    const subject = cleanPlainPiece(
      withoutRoom.replace(PLAIN_CLASS_RE, " ").replace(PLAIN_TEACHER_RE, " "),
    );

    const entry = makeEntry({
      day: currentDay,
      start,
      end,
      subject: subject || "Scheduled class",
      room,
      className,
      teacher,
    });
    if (!entry) {
      errors.push(`Line ${index + 1}: missing a day, time, subject or room.`);
      buffer = [];
      continue;
    }
    const signature = `${entry.day}|${entry.start}|${entry.end}|${entry.room.toLowerCase()}|${entry.subject.toLowerCase()}`;
    if (!seen.has(signature)) {
      seen.add(signature);
      entries.push(entry);
    }
    buffer = [];
    index = cursor - 1;
  }

  return { entries, errors };
}

export interface RoomFilterResult {
  /** Entries whose room exists in the app, with the room code canonicalised. */
  entries: TimetableEntry[];
  /** Room codes found in the timetable that the app doesn't track yet. */
  skippedRooms: string[];
  /** How many timetable rows were dropped because their room is unknown. */
  skippedEntries: number;
}

/**
 * Keeps only rows whose room is tracked by the app. Timetables often mention
 * rooms from other blocks, so unknown rooms are skipped (and reported) rather
 * than creating phantom occupancy.
 */
export function filterKnownRooms(entries: TimetableEntry[], roomCodes: string[]): RoomFilterResult {
  const known = [...new Set(roomCodes.map((code) => code.trim()).filter(Boolean))];
  if (known.length === 0) {
    return { entries, skippedRooms: [], skippedEntries: 0 };
  }

  const kept: TimetableEntry[] = [];
  const skipped = new Set<string>();
  entries.forEach((entry) => {
    const match = known.find((code) => roomMatches(entry.room, code));
    if (match) {
      kept.push(entry.room === match ? entry : { ...entry, room: match });
    } else {
      skipped.add(entry.room);
    }
  });

  return {
    entries: kept,
    skippedRooms: [...skipped].sort(),
    skippedEntries: entries.length - kept.length,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches the room as it appeared before OCR cleanup (O/0, I/1, S/5 …). */
function roomRemovalPattern(room: string): RegExp {
  const pattern = escapeRegExp(room)
    .replace(/-/g, "[\\s-]*")
    .replace(/0/g, "[0Oo]")
    .replace(/1/g, "[1Il|]")
    .replace(/2/g, "[2Zz]")
    .replace(/5/g, "[5Ss]")
    .replace(/8/g, "[8B]");
  return new RegExp(pattern, "i");
}

export function activeEntries(entries: TimetableEntry[], now = new Date()): TimetableEntry[] {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return entries.filter(
    (entry) =>
      entry.day === day &&
      timeToMinutes(entry.start) <= minutes &&
      minutes < timeToMinutes(entry.end),
  );
}

export function upcomingEntries(
  entries: TimetableEntry[],
  now = new Date(),
  limit = 5,
): TimetableEntry[] {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return entries
    .filter((entry) => entry.day === day && timeToMinutes(entry.end) > minutes)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    .slice(0, limit);
}

export function entryForRoom(
  entries: TimetableEntry[],
  code: string,
  now = new Date(),
): TimetableEntry | null {
  return activeEntries(entries, now).find((entry) => roomMatches(entry.room, code)) ?? null;
}

export function scheduleForRoom(
  entries: TimetableEntry[],
  code: string,
  day?: Weekday,
): TimetableEntry[] {
  return entries
    .filter((entry) => (day === undefined || entry.day === day) && roomMatches(entry.room, code))
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}

export function entriesForDay(entries: TimetableEntry[], day: Weekday): TimetableEntry[] {
  return entries
    .filter((entry) => entry.day === day)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isEntry(value: unknown): value is TimetableEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<TimetableEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.day === "number" &&
    entry.day >= 0 &&
    entry.day <= 6 &&
    typeof entry.start === "string" &&
    /^\d{2}:\d{2}$/.test(entry.start) &&
    typeof entry.end === "string" &&
    /^\d{2}:\d{2}$/.test(entry.end) &&
    typeof entry.subject === "string" &&
    typeof entry.room === "string" &&
    typeof entry.className === "string" &&
    typeof entry.teacher === "string"
  );
}

export function loadTimetable(): TimetableEntry[] {
  if (!canStore()) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TIMETABLE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function saveTimetable(entries: TimetableEntry[]): void {
  if (!canStore()) return;
  window.localStorage.setItem(TIMETABLE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(TIMETABLE_EVENT));
}

export function addTimetableEntries(incoming: TimetableEntry[]): TimetableEntry[] {
  const existing = loadTimetable();
  const signature = (entry: TimetableEntry) =>
    `${entry.day}|${entry.start}|${entry.end}|${entry.room.toLowerCase()}|${entry.subject.toLowerCase()}`;
  const seen = new Set(existing.map(signature));
  const merged = [...existing];
  incoming.forEach((entry) => {
    if (!seen.has(signature(entry))) {
      merged.push(entry);
      seen.add(signature(entry));
    }
  });
  saveTimetable(merged);
  return merged;
}

/** Replaces the whole timetable — used when a student uploads a full PDF/photo. */
export function replaceTimetableEntries(incoming: TimetableEntry[]): TimetableEntry[] {
  const signature = (entry: TimetableEntry) =>
    `${entry.day}|${entry.start}|${entry.end}|${entry.room.toLowerCase()}|${entry.subject.toLowerCase()}`;
  const seen = new Set<string>();
  const next = incoming.filter((entry) => {
    const key = signature(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  saveTimetable(next);
  return next;
}

export function updateTimetableEntry(
  id: string,
  patch: Partial<Omit<TimetableEntry, "id">>,
): TimetableEntry[] {
  const next = loadTimetable().map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
  saveTimetable(next);
  return next;
}

export function removeTimetableEntry(id: string): TimetableEntry[] {
  const next = loadTimetable().filter((entry) => entry.id !== id);
  saveTimetable(next);
  return next;
}

export function demoEntries(now = new Date()): TimetableEntry[] {
  const day = now.getDay() as Weekday;
  const start = minutesToTime(now.getHours() * 60 + now.getMinutes() - 15);
  const end = minutesToTime(now.getHours() * 60 + now.getMinutes() + 45);
  return [
    {
      id: makeId(),
      day,
      start,
      end,
      subject: "Data Structures",
      room: "CSED-204",
      className: "COE 2A",
      teacher: "Demo",
    },
    {
      id: makeId(),
      day,
      start,
      end,
      subject: "Operating Systems",
      room: "LT-301",
      className: "COE 3B",
      teacher: "Demo",
    },
    {
      id: makeId(),
      day,
      start,
      end,
      subject: "DBMS Lab",
      room: "CSED-101",
      className: "COE 2B",
      teacher: "Demo",
    },
  ];
}
