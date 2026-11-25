import { describe, expect, it } from "vitest";
import { assistantReply } from "@/lib/chat";
import { roomMatches, type Room } from "@/lib/rooms";
import {
  activeEntries,
  filterKnownRooms,
  parseClock,
  parseTimetable,
  parseTimetableCsv,
  parseWeekday,
  upcomingEntries,
  type TimetableEntry,
} from "@/lib/timetable";
function makeRoom(code: string, status: Room["current_status"]): Room {
  return {
    id: code,
    code,
    building: "CSED",
    floor: 1,
    capacity: null,
    room_type: "classroom",
    active: true,
    current_status: status,
    status_note: null,
    status_updated_at: new Date().toISOString(),
    status_updated_by_name: null,
    created_at: new Date().toISOString(),
  };
}

function entry(partial: Partial<TimetableEntry>): TimetableEntry {
  return {
    id: partial.id ?? "one",
    day: partial.day ?? 1,
    start: partial.start ?? "09:00",
    end: partial.end ?? "10:00",
    subject: partial.subject ?? "Data Structures",
    room: partial.room ?? "CSED-204",
    className: partial.className ?? "COE 2A",
    teacher: partial.teacher ?? "Dr. Sharma",
  };
}

describe("timetable parsing", () => {
  it("reads weekday names and 12-hour times from CSV", () => {
    const result = parseTimetableCsv(
      "Day,Start,End,Subject,Room,Class,Teacher\nMonday,9:30 AM,10:30 AM,DBMS,CSED-204,COE 2A,Dr. Kaur",
    );
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      day: 1,
      start: "09:30",
      end: "10:30",
      subject: "DBMS",
      room: "CSED-204",
      className: "COE 2A",
    });
  });

  it("reads headerless CSV rows", () => {
    const result = parseTimetableCsv("Tuesday,11:00,12:00,OS,LT-301,COE 3B,Dr. Singh");
    expect(result.entries[0]).toMatchObject({ day: 2, room: "LT-301", subject: "OS" });
  });

  it("reports rows with a bad end time", () => {
    const result = parseTimetableCsv("Monday,10:00,09:00,DBMS,CSED-204,COE 2A,Dr. Kaur");
    expect(result.entries).toHaveLength(0);
    expect(result.errors[0]).toMatch(/end time after the start/i);
  });

  it("parses a weekly calendar event", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:Computer Networks",
      "LOCATION:LP-101",
      "DTSTART:20260105T140000",
      "DTEND:20260105T150000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
      "DESCRIPTION:Class: COE 3A; Teacher: Dr. Mehta",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const result = parseTimetable(ics);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((item) => item.day).sort()).toEqual([1, 3]);
    expect(result.entries[0]).toMatchObject({
      start: "14:00",
      end: "15:00",
      room: "LP-101",
      className: "COE 3A",
      teacher: "Dr. Mehta",
    });
  });

  it("normalises common time and day formats", () => {
    expect(parseClock("2:05 pm")).toBe("14:05");
    expect(parseClock("0900")).toBe("09:00");
    expect(parseWeekday("Fri")).toBe(5);
    expect(parseWeekday("7")).toBe(0);
  });
});

describe("timetable text from PDFs and photos", () => {
  it("reads line-by-line timetable text with day headings", () => {
    const result = parseTimetable(
      [
        "Monday",
        "9:00-10:00 Data Structures CSED-204 COE 2A Dr. Sharma",
        "10:00-11:00 DBMS Lab CSED-LAB-1 COE 2A Ms. Kaur",
        "Tuesday 2-3 PM Operating Systems LT-301 COE 3B Dr. Singh",
      ].join("\n"),
    );

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]).toMatchObject({
      day: 1,
      start: "09:00",
      end: "10:00",
      subject: "Data Structures",
      room: "CSED-204",
      className: "COE 2A",
      teacher: "Dr. Sharma",
    });
    expect(result.entries[1]).toMatchObject({
      room: "CSED-LAB-1",
      subject: "DBMS Lab",
    });
    expect(result.entries[2]).toMatchObject({
      day: 2,
      start: "14:00",
      end: "15:00",
      room: "LT-301",
      subject: "Operating Systems",
    });
  });

  it("keeps plain text out of the CSV parser when commas are absent", () => {
    const result = parseTimetable("Wednesday 11:00-12:00 Computer Networks LP-101 COE 3A");
    expect(result.entries[0]).toMatchObject({
      day: 3,
      room: "LP-101",
      subject: "Computer Networks",
    });
  });

  it("groups the separate lines produced by photo OCR", () => {
    const result = parseTimetable(
      [
        "Monday",
        "09:00 - 10:00",
        "Data Structures",
        "CSED-204",
        "COE 2A",
        "Dr. Sharma",
        "Tuesday",
        "2:00 PM - 3:00 PM",
        "Operating Systems",
        "LT-301",
        "COE 3B",
      ].join("\n"),
    );

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      day: 1,
      start: "09:00",
      end: "10:00",
      subject: "Data Structures",
      room: "CSED-204",
      className: "COE 2A",
      teacher: "Dr. Sharma",
    });
    expect(result.entries[1]).toMatchObject({
      day: 2,
      start: "14:00",
      end: "15:00",
      subject: "Operating Systems",
      room: "LT-301",
      className: "COE 3B",
    });
  });

  it("reads compact and OCR-confused times and room codes", () => {
    const result = parseTimetable(
      ["Wed 0900-1000", "Computer Networks", "CSED 2O4", "COE 3A"].join("\n"),
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      day: 3,
      start: "09:00",
      end: "10:00",
      room: "CSED-204",
      subject: "Computer Networks",
    });
  });
});

describe("unknown room filtering", () => {
  it("keeps tracked rooms and reports the rest", () => {
    const result = filterKnownRooms(
      [
        entry({ id: "known", room: "CSED 204" }),
        entry({ id: "unknown", room: "XYZ-999" }),
        entry({ id: "lecture", room: "LT-301", subject: "OS" }),
      ],
      ["CSED-204", "LT-301"],
    );

    expect(result.entries.map((item) => item.id)).toEqual(["known", "lecture"]);
    expect(result.entries[0]?.room).toBe("CSED-204");
    expect(result.skippedRooms).toEqual(["XYZ-999"]);
    expect(result.skippedEntries).toBe(1);
  });

  it("leaves entries alone when no rooms have loaded yet", () => {
    const entries = [entry({ room: "XYZ-999" })];
    const result = filterKnownRooms(entries, []);
    expect(result.entries).toBe(entries);
    expect(result.skippedEntries).toBe(0);
  });
});

describe("live occupancy", () => {
  const now = new Date(2026, 0, 5, 9, 30);
  const entries = [
    entry({ id: "a", day: 1, start: "09:00", end: "10:00", room: "CSED-204" }),
    entry({ id: "b", day: 1, start: "10:00", end: "11:00", room: "LT-301", subject: "OS" }),
  ];

  it("finds the class running right now", () => {
    expect(activeEntries(entries, now).map((item) => item.id)).toEqual(["a"]);
  });

  it("lists what is coming next", () => {
    expect(upcomingEntries(entries, now).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("matches room codes with different spacing", () => {
    expect(roomMatches("CSED 204", "CSED-204")).toBe(true);
  });
});

describe("room assistant", () => {
  const now = new Date(2026, 0, 5, 9, 30);
  const rooms = [
    makeRoom("CSED-204", "ONGOING"),
    makeRoom("CSED-101", "FREE"),
    makeRoom("LT-301", "FREE"),
  ];
  const entries = [entry({ day: 1, start: "09:00", end: "10:00", room: "CSED-204" })];

  it("answers about a specific room", () => {
    const reply = assistantReply("is CSED-204 free?", { rooms, entries, now });
    expect(reply).toContain("CSED-204");
    expect(reply).toContain("Data Structures");
  });

  it("lists rooms that are free and not in class", () => {
    const reply = assistantReply("which rooms are free right now?", { rooms, entries, now });
    expect(reply).toContain("CSED-101");
    expect(reply).toContain("LT-301");
    expect(reply).not.toContain("CSED-204");
  });
});
