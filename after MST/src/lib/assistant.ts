import { isLabCode, normalizeRoomCode, roomKindLabel, roomMatches, type Room } from "@/lib/rooms";
import {
  activeEntries,
  entriesForDay,
  formatClock,
  minutesToTime,
  parseClock,
  parseWeekday,
  scheduleForRoom,
  timeToMinutes,
  upcomingEntries,
  type TimetableEntry,
  type Weekday,
} from "@/lib/timetable";

export interface AssistantOptions {
  rooms: Room[];
  entries: TimetableEntry[];
  now?: Date;
  className?: string;
  teacherName?: string;
}

export interface TimeSlot {
  day: Weekday;
  start: string;
  end: string;
  dayExplicit: boolean;
  timeExplicit: boolean;
}

const STATUS_TEXT: Record<string, string> = {
  FREE: "free",
  ONGOING: "in use — class ongoing",
  OCCUPIED: "occupied",
  NOT_ARRIVED: "not arrived yet",
  CANCELLED: "class cancelled",
  CHANGED: "schedule changed",
};

const DAY_PATTERNS: Array<[RegExp, Weekday]> = [
  [/\bsun(?:day)?\b/, 0],
  [/\bmon(?:day)?\b/, 1],
  [/\btue(?:s|sday)?\b/, 2],
  [/\bwed(?:nesday)?\b/, 3],
  [/\bthu(?:r|rs|rsday|rday)?\b/, 4],
  [/\bfri(?:day)?\b/, 5],
  [/\bsat(?:urday)?\b/, 6],
];

function parseUserClock(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  const hasMeridiem = /am|pm/.test(cleaned);
  const parsed = parseClock(cleaned);
  if (!parsed) return null;
  if (hasMeridiem) return parsed;
  const hour = Number(parsed.slice(0, 2));
  // Campus timetables run 8 AM – 6 PM, so a bare “2” means 2 PM.
  if (hour >= 1 && hour <= 7) {
    return `${String(hour + 12).padStart(2, "0")}:${parsed.slice(3)}`;
  }
  return parsed;
}

export function parseSlot(question: string, now = new Date()): TimeSlot {
  const q = question.toLowerCase().replace(/[–—]/g, "-");

  let day = now.getDay() as Weekday;
  let dayExplicit = false;

  if (/\btomorrow\b/.test(q)) {
    day = ((now.getDay() + 1) % 7) as Weekday;
    dayExplicit = true;
  } else if (/\btoday\b/.test(q)) {
    day = now.getDay() as Weekday;
    dayExplicit = true;
  } else {
    for (const [pattern, value] of DAY_PATTERNS) {
      if (pattern.test(q)) {
        day = value;
        dayExplicit = true;
        break;
      }
    }
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const range = q.match(
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to|until|till|through)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/,
  );
  if (range?.[1] && range[2]) {
    const start = parseUserClock(range[1]);
    const end = parseUserClock(range[2]);
    if (start && end && timeToMinutes(end) > timeToMinutes(start)) {
      return { day, start, end, dayExplicit, timeExplicit: true };
    }
  }

  const at = q.match(/\b(?:at|around|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
  if (at?.[1]) {
    const start = parseUserClock(at[1]);
    if (start) {
      return {
        day,
        start,
        end: minutesToTime(timeToMinutes(start) + 60),
        dayExplicit,
        timeExplicit: true,
      };
    }
  }

  const after = q.match(/\bafter\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
  if (after?.[1]) {
    const start = parseUserClock(after[1]);
    if (start) {
      return { day, start, end: "18:00", dayExplicit, timeExplicit: true };
    }
  }

  if (/\bmorning\b/.test(q)) {
    return { day, start: "08:00", end: "12:00", dayExplicit, timeExplicit: true };
  }
  if (/\bafternoon\b/.test(q)) {
    return { day, start: "12:00", end: "17:00", dayExplicit, timeExplicit: true };
  }
  if (/\bevening\b/.test(q)) {
    return { day, start: "17:00", end: "20:00", dayExplicit, timeExplicit: true };
  }

  const start = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return {
    day,
    start,
    end: `${String(now.getHours()).padStart(2, "0")}:${String(Math.min(59, now.getMinutes() + 60)).padStart(2, "0")}`,
    dayExplicit,
    timeExplicit: false,
  };
}

export function slotLabel(slot: TimeSlot): string {
  const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    slot.day
  ];
  return `${day}, ${formatClock(slot.start)}–${formatClock(slot.end)}`;
}

function overlaps(entry: TimetableEntry, slot: TimeSlot): boolean {
  return (
    entry.day === slot.day &&
    timeToMinutes(entry.start) < timeToMinutes(slot.end) &&
    timeToMinutes(entry.end) > timeToMinutes(slot.start)
  );
}

function findRoom(question: string, rooms: Room[]): Room | null {
  const q = question.toLowerCase();
  const normalized = normalizeRoomCode(question);
  return (
    rooms.find((room) => {
      const code = normalizeRoomCode(room.code);
      return (
        q.includes(room.code.toLowerCase()) ||
        (code.length >= 4 && normalized.includes(code)) ||
        roomMatches(question, room.code)
      );
    }) ?? null
  );
}

function freeRoomsInSlot(
  rooms: Room[],
  entries: TimetableEntry[],
  slot: TimeSlot,
  now = new Date(),
): Room[] {
  const busy = entries.filter((entry) => overlaps(entry, slot));
  const isNow = slot.day === now.getDay() && !slot.timeExplicit;
  return rooms.filter((room) => {
    if (!room.active) return false;
    if (busy.some((entry) => roomMatches(entry.room, room.code))) return false;
    if (isNow && (room.current_status === "OCCUPIED" || room.current_status === "CANCELLED")) {
      return room.current_status !== "OCCUPIED";
    }
    return true;
  });
}

function groupCodes(rooms: Room[]): string[] {
  const groups = new Map<string, string[]>();
  rooms.forEach((room) => {
    const list = groups.get(room.building) ?? [];
    list.push(room.code);
    groups.set(room.building, list);
  });
  return [...groups.entries()].map(
    ([building, codes]) => `• ${building}: ${codes.sort().join(", ")}`,
  );
}

function listEntries(entries: TimetableEntry[], limit = 8): string {
  return entries
    .slice(0, limit)
    .map(
      (entry) =>
        `• ${formatClock(entry.start)}–${formatClock(entry.end)} — ${entry.subject} in ${entry.room}${
          entry.className ? ` (${entry.className})` : ""
        }`,
    )
    .join("\n");
}

function myEntries(options: AssistantOptions, q: string): TimetableEntry[] {
  let entries = options.entries;
  if (options.className && /(my|our|class|coe)/.test(q)) {
    entries = entries.filter((entry) => roomMatches(entry.className, options.className ?? ""));
  } else if (options.teacherName && /(my|i teach|mine)/.test(q)) {
    entries = entries.filter((entry) =>
      entry.teacher.toLowerCase().includes(options.teacherName!.toLowerCase().split(" ")[0] ?? ""),
    );
  }
  return entries;
}

export function assistantReply(question: string, options: AssistantOptions): string {
  const now = options.now ?? new Date();
  const q = question.trim().toLowerCase();
  const rooms = options.rooms;
  const entries = options.entries;

  if (!q) {
    return "Ask me about free rooms at a time, a specific room, or today's timetable. For example: “Which rooms are free on Friday 2–3 PM?”";
  }

  if (/^(hi|hey|hello|yo|namaste|good morning|good evening)\b/.test(q)) {
    return [
      "Hi! I'm Campus AI. I know the live room board and the full weekly timetable.",
      "Try:",
      "• “Which rooms are free on Tuesday 11 AM–12 PM?”",
      "• “Is CSED-204 free tomorrow at 2 PM?”",
      "• “What's my next class?”",
    ].join("\n");
  }

  if (/(help|what can you|how do i|commands|what do you know)/.test(q)) {
    return [
      "I can answer:",
      "• Free rooms for any day and time slot — “free rooms Wednesday 2–3 PM”",
      "• Whether one room is free — “is LT-301 free Friday at 10?”",
      "• What's on now or next — “what's next today?”",
      "• Where a class is — “where is Data Structures?”",
      "• Lab availability — “which labs are free tomorrow morning?”",
      "I use the timetable loaded on the Timetable page, so your answer updates when a CR or teacher changes a class.",
    ].join("\n");
  }

  const mentioned = findRoom(q, rooms);
  const freeIntent = /(free|available|empty|vacant|open|spare)/.test(q);
  const busyIntent = /(busy|occupied|ongoing|in use|full|running)/.test(q);
  const slot = parseSlot(q, now);
  const explicitSlot = slot.dayExplicit || slot.timeExplicit;

  if (mentioned) {
    const live = entries.find(
      (entry) =>
        entry.day === now.getDay() &&
        roomMatches(entry.room, mentioned.code) &&
        timeToMinutes(entry.start) <= now.getHours() * 60 + now.getMinutes() &&
        now.getHours() * 60 + now.getMinutes() < timeToMinutes(entry.end),
    );
    const busyEntry = entries.find(
      (entry) => overlaps(entry, slot) && roomMatches(entry.room, mentioned.code),
    );
    const lines: string[] = [];

    if (explicitSlot) {
      lines.push(
        `${mentioned.code} (${roomKindLabel(mentioned)}) on ${slotLabel(slot)}: ${
          busyEntry ? "busy" : "free"
        }.`,
      );
      if (busyEntry) {
        lines.push(
          `Booked for ${busyEntry.subject}${busyEntry.className ? ` · ${busyEntry.className}` : ""}${
            busyEntry.teacher ? ` · ${busyEntry.teacher}` : ""
          }.`,
        );
      }
    } else {
      lines.push(
        `${mentioned.code} (${roomKindLabel(mentioned)}) is ${STATUS_TEXT[mentioned.current_status] ?? mentioned.current_status.toLowerCase()}.`,
      );
      if (live) {
        lines.push(
          `In class now: ${live.subject}${live.className ? ` · ${live.className}` : ""} until ${formatClock(live.end)}.`,
        );
      } else {
        lines.push("No class is scheduled there right now.");
      }
    }

    const today = scheduleForRoom(entries, mentioned.code, slot.day);
    if (today.length > 0) {
      lines.push(
        `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][slot.day]} timetable: ${today
          .slice(0, 5)
          .map((entry) => `${formatClock(entry.start)}–${formatClock(entry.end)} ${entry.subject}`)
          .join("; ")}.`,
      );
    } else {
      lines.push(
        `No classes are booked in ${mentioned.code} on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][slot.day]}.`,
      );
    }
    return lines.join("\n");
  }

  const labOnly = /\b(lab|labs|laboratory)\b/.test(q);

  if (freeIntent || (/\bwhich rooms\b/.test(q) && !busyIntent)) {
    const pool = labOnly ? rooms.filter((room) => isLabCode(room.code)) : rooms;
    const free = freeRoomsInSlot(pool, entries, slot, now);
    const busyCount = pool.filter((room) => room.active).length - free.length;
    if (free.length === 0) {
      return `No ${labOnly ? "labs are" : "rooms are"} free on ${slotLabel(slot)}. Every room in the timetable is booked.`;
    }
    const label = labOnly ? "labs" : "rooms";
    return [
      `${free.length} ${label} free on ${slotLabel(slot)}${busyCount > 0 ? ` · ${busyCount} busy` : ""}:`,
      ...groupCodes(free),
      "",
      slot.timeExplicit
        ? "Tap Timetable to see the full weekly schedule."
        : "Tip: add a day and time, e.g. “free rooms Friday 2–3 PM”.",
    ].join("\n");
  }

  if (busyIntent) {
    const active = activeEntries(entries, now);
    if (slot.timeExplicit) {
      const booked = entries.filter((entry) => overlaps(entry, slot));
      if (booked.length > 0) {
        return `Booked on ${slotLabel(slot)}:\n${listEntries(booked, 10)}`;
      }
      return `Nothing is booked on ${slotLabel(slot)}.`;
    }
    if (active.length > 0) {
      return `In class right now:\n${listEntries(active, 10)}`;
    }
    const busy = rooms.filter(
      (room) => room.current_status === "ONGOING" || room.current_status === "OCCUPIED",
    );
    if (busy.length === 0) return "Nothing looks busy right now.";
    return `Marked busy:\n${busy
      .slice(0, 10)
      .map((room) => `• ${room.code} — ${STATUS_TEXT[room.current_status]}`)
      .join("\n")}`;
  }

  if (labOnly) {
    const labs = rooms.filter((room) => isLabCode(room.code));
    if (labs.length === 0) return "No lab rooms are registered yet.";
    const free = freeRoomsInSlot(labs, entries, slot, now);
    return [
      `${free.length} of ${labs.length} labs free on ${slotLabel(slot)}:`,
      free.length > 0
        ? free.map((room) => `• ${room.code} — ${roomKindLabel(room)}`).join("\n")
        : "• None — all labs are booked.",
    ].join("\n");
  }

  if (/(next|upcoming|later|today|schedule|timetable|classes|class)/.test(q)) {
    const scope = myEntries(options, q);
    const next = upcomingEntries(scope, now, 8);
    if (next.length === 0) {
      return "Nothing else is scheduled today. Ask me about another day, or upload a timetable on the Timetable page.";
    }
    const title =
      options.className && /(my|our)/.test(q) ? `Next for ${options.className}` : "Up next today";
    return `${title}:\n${listEntries(next)}`;
  }

  if (/where/.test(q)) {
    const words = q
      .replace(/where|is|the|class|for|at|on|in|of|my|today|when/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2);
    const match = entries.find(
      (entry) =>
        entry.day === now.getDay() &&
        words.some(
          (word) =>
            entry.subject.toLowerCase().includes(word) ||
            entry.className.toLowerCase().includes(word) ||
            entry.teacher.toLowerCase().includes(word),
        ),
    );
    if (match) {
      return `${match.subject} is in ${match.room} from ${formatClock(match.start)} to ${formatClock(match.end)} today.`;
    }
    return "I couldn't find that class in today's timetable. Ask about another day, or check the Timetable page.";
  }

  if (explicitSlot) {
    const free = freeRoomsInSlot(rooms, entries, slot, now);
    return [
      `On ${slotLabel(slot)}, ${free.length} of ${rooms.filter((room) => room.active).length} rooms are free:`,
      ...groupCodes(free),
    ].join("\n");
  }

  const todayClasses = entriesForDay(entries, now.getDay() as Weekday);
  return [
    "I can help with free rooms, a specific room, or the timetable. Try:",
    "• “Which rooms are free on Friday 2–3 PM?”",
    "• “Is CSED-204 free tomorrow at 10 AM?”",
    todayClasses.length > 0
      ? `• Today has ${todayClasses.length} scheduled classes — ask “what's next today?”`
      : "• No classes are scheduled today.",
  ].join("\n");
}
