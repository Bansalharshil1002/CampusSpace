import type { Tables } from "@/integrations/supabase/types";
import { loadTimetable, saveTimetable, TIMETABLE_KEY, type TimetableEntry } from "@/lib/timetable";
import { loadAnnouncements, seedAnnouncements, ANNOUNCEMENTS_KEY } from "@/lib/announcements";
import { seedMessages } from "@/lib/chat";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";

export type SeedRoom = Tables<"rooms">;

export const STUDENT_CLASS = "COE 2A";
export const STUDENT_NAME = "Aarav Student";
export const DEMO_TEACHER = "Dr. Meera Teacher";

const CREATED_AT = "2026-01-05T04:30:00.000Z";

function room(
  code: string,
  building: string,
  floor: number,
  capacity: number,
  room_type: SeedRoom["room_type"],
): SeedRoom {
  return {
    id: `seed-${code.toLowerCase()}`,
    code,
    building,
    floor,
    capacity,
    room_type,
    active: true,
    current_status: "FREE",
    status_note: null,
    status_updated_at: CREATED_AT,
    status_updated_by_name: null,
    created_at: CREATED_AT,
  };
}

/** A self-contained campus so the demo runs without the remote database. */
export function seedRooms(): SeedRoom[] {
  return [
    room("CSED-101", "CSED Block", 1, 60, "classroom"),
    room("CSED-102", "CSED Block", 1, 60, "classroom"),
    room("CSED-103", "CSED Block", 1, 60, "classroom"),
    room("CSED-104", "CSED Block", 1, 40, "classroom"),
    room("CSED-105", "CSED Block", 1, 40, "classroom"),
    room("CSED-LAB-1", "CSED Block", 1, 40, "classroom"),
    room("CSED-LAB-2", "CSED Block", 1, 40, "classroom"),
    room("CSED-LAB-3", "CSED Block", 2, 40, "classroom"),
    room("CSED-201", "CSED Block", 2, 60, "classroom"),
    room("CSED-202", "CSED Block", 2, 60, "classroom"),
    room("CSED-203", "CSED Block", 2, 60, "classroom"),
    room("CSED-204", "CSED Block", 2, 60, "classroom"),
    room("CSED-205", "CSED Block", 2, 60, "classroom"),
    room("LT-101", "LT Block", 1, 180, "lt"),
    room("LT-102", "LT Block", 1, 180, "lt"),
    room("LT-301", "LT Block", 3, 180, "lt"),
    room("LT-302", "LT Block", 3, 180, "lt"),
    room("LP-101", "LP Block", 1, 120, "lt"),
    room("LP-102", "LP Block", 2, 120, "lt"),
    room("SAC-1", "Student Activity Centre", 1, 120, "activity_space"),
    room("SAC-2", "Student Activity Centre", 1, 80, "activity_space"),
  ];
}

interface SeedEntry {
  day: TimetableEntry["day"];
  start: string;
  end: string;
  subject: string;
  room: string;
  className: string;
  teacher: string;
}

const WEEK_1: SeedEntry[] = [
  // Monday
  {
    day: 1,
    start: "09:00",
    end: "09:50",
    subject: "Data Structures",
    room: "CSED-204",
    className: "COE 2A",
    teacher: DEMO_TEACHER,
  },
  {
    day: 1,
    start: "09:00",
    end: "09:50",
    subject: "DBMS",
    room: "CSED-205",
    className: "COE 2B",
    teacher: "Ms. Kaur",
  },
  {
    day: 1,
    start: "09:00",
    end: "09:50",
    subject: "Computer Networks",
    room: "LT-301",
    className: "COE 3A",
    teacher: "Dr. Singh",
  },
  {
    day: 1,
    start: "10:00",
    end: "10:50",
    subject: "Discrete Mathematics",
    room: "CSED-204",
    className: "COE 2A",
    teacher: "Dr. Sharma",
  },
  {
    day: 1,
    start: "10:00",
    end: "10:50",
    subject: "Operating Systems",
    room: "CSED-205",
    className: "COE 2B",
    teacher: DEMO_TEACHER,
  },
  {
    day: 1,
    start: "10:00",
    end: "10:50",
    subject: "Software Engineering",
    room: "LT-301",
    className: "COE 3A",
    teacher: "Dr. Gupta",
  },
  {
    day: 1,
    start: "11:00",
    end: "11:50",
    subject: "Computer Networks",
    room: "LT-301",
    className: "COE 2A",
    teacher: "Dr. Singh",
  },
  {
    day: 1,
    start: "11:00",
    end: "11:50",
    subject: "Data Structures",
    room: "CSED-205",
    className: "COE 2B",
    teacher: DEMO_TEACHER,
  },
  {
    day: 1,
    start: "11:00",
    end: "11:50",
    subject: "DBMS",
    room: "CSED-203",
    className: "COE 3A",
    teacher: "Ms. Kaur",
  },
  {
    day: 1,
    start: "13:00",
    end: "14:50",
    subject: "DBMS Lab",
    room: "CSED-LAB-1",
    className: "COE 2A",
    teacher: "Ms. Kaur",
  },
  {
    day: 1,
    start: "13:00",
    end: "14:50",
    subject: "Web Technologies Lab",
    room: "CSED-LAB-2",
    className: "COE 2B",
    teacher: "Dr. Gupta",
  },
  {
    day: 1,
    start: "15:00",
    end: "15:50",
    subject: "Software Engineering",
    room: "CSED-204",
    className: "COE 2A",
    teacher: "Dr. Gupta",
  },
  {
    day: 1,
    start: "15:00",
    end: "15:50",
    subject: "Operating Systems",
    room: "CSED-203",
    className: "COE 3A",
    teacher: DEMO_TEACHER,
  },

  // Tuesday
  {
    day: 2,
    start: "09:00",
    end: "09:50",
    subject: "Operating Systems",
    room: "CSED-202",
    className: "COE 2A",
    teacher: DEMO_TEACHER,
  },
  {
    day: 2,
    start: "09:00",
    end: "09:50",
    subject: "Discrete Mathematics",
    room: "CSED-203",
    className: "COE 2B",
    teacher: "Dr. Sharma",
  },
  {
    day: 2,
    start: "09:00",
    end: "09:50",
    subject: "DBMS",
    room: "LT-102",
    className: "COE 3A",
    teacher: "Ms. Kaur",
  },
  {
    day: 2,
    start: "10:00",
    end: "10:50",
    subject: "Data Structures",
    room: "CSED-204",
    className: "COE 2A",
    teacher: DEMO_TEACHER,
  },
  {
    day: 2,
    start: "10:00",
    end: "10:50",
    subject: "Computer Networks",
    room: "CSED-205",
    className: "COE 2B",
    teacher: "Dr. Singh",
  },
  {
    day: 2,
    start: "10:00",
    end: "10:50",
    subject: "Software Engineering",
    room: "LT-102",
    className: "COE 3A",
    teacher: "Dr. Gupta",
  },
  {
    day: 2,
    start: "11:00",
    end: "11:50",
    subject: "Discrete Mathematics",
    room: "CSED-204",
    className: "COE 2A",
    teacher: "Dr. Sharma",
  },
  {
    day: 2,
    start: "11:00",
    end: "11:50",
    subject: "Operating Systems",
    room: "CSED-205",
    className: "COE 2B",
    teacher: DEMO_TEACHER,
  },
  {
    day: 2,
    start: "11:00",
    end: "11:50",
    subject: "Computer Networks",
    room: "LT-301",
    className: "COE 3A",
    teacher: "Dr. Singh",
  },
  {
    day: 2,
    start: "14:00",
    end: "15:50",
    subject: "Web Technologies Lab",
    room: "CSED-LAB-2",
    className: "COE 2A",
    teacher: "Mr. Bansal",
  },
  {
    day: 2,
    start: "14:00",
    end: "15:50",
    subject: "DBMS Lab",
    room: "CSED-LAB-3",
    className: "COE 2B",
    teacher: "Ms. Kaur",
  },

  // Wednesday
  {
    day: 3,
    start: "09:00",
    end: "09:50",
    subject: "Computer Networks",
    room: "LT-102",
    className: "COE 2A",
    teacher: "Dr. Singh",
  },
  {
    day: 3,
    start: "09:00",
    end: "09:50",
    subject: "Data Structures",
    room: "CSED-204",
    className: "COE 2B",
    teacher: DEMO_TEACHER,
  },
  {
    day: 3,
    start: "09:00",
    end: "09:50",
    subject: "Discrete Mathematics",
    room: "CSED-203",
    className: "COE 3A",
    teacher: "Dr. Sharma",
  },
  {
    day: 3,
    start: "10:00",
    end: "10:50",
    subject: "DBMS",
    room: "CSED-202",
    className: "COE 2A",
    teacher: "Ms. Kaur",
  },
  {
    day: 3,
    start: "10:00",
    end: "10:50",
    subject: "Operating Systems",
    room: "CSED-204",
    className: "COE 2B",
    teacher: DEMO_TEACHER,
  },
  {
    day: 3,
    start: "10:00",
    end: "10:50",
    subject: "Software Engineering",
    room: "LT-102",
    className: "COE 3A",
    teacher: "Dr. Gupta",
  },
  {
    day: 3,
    start: "11:00",
    end: "11:50",
    subject: "Software Engineering",
    room: "CSED-204",
    className: "COE 2A",
    teacher: "Dr. Gupta",
  },
  {
    day: 3,
    start: "11:00",
    end: "11:50",
    subject: "DBMS",
    room: "CSED-202",
    className: "COE 2B",
    teacher: "Ms. Kaur",
  },
  {
    day: 3,
    start: "11:00",
    end: "11:50",
    subject: "Operating Systems",
    room: "CSED-203",
    className: "COE 3A",
    teacher: DEMO_TEACHER,
  },
  {
    day: 3,
    start: "13:00",
    end: "14:50",
    subject: "Data Structures Lab",
    room: "CSED-LAB-1",
    className: "COE 2A",
    teacher: DEMO_TEACHER,
  },

  // Thursday
  {
    day: 4,
    start: "09:00",
    end: "09:50",
    subject: "Operating Systems",
    room: "CSED-202",
    className: "COE 2A",
    teacher: DEMO_TEACHER,
  },
  {
    day: 4,
    start: "09:00",
    end: "09:50",
    subject: "DBMS",
    room: "CSED-204",
    className: "COE 2B",
    teacher: "Ms. Kaur",
  },
  {
    day: 4,
    start: "09:00",
    end: "09:50",
    subject: "Computer Networks",
    room: "LT-301",
    className: "COE 3A",
    teacher: "Dr. Singh",
  },
  {
    day: 4,
    start: "10:00",
    end: "10:50",
    subject: "Computer Networks",
    room: "LT-301",
    className: "COE 2A",
    teacher: "Dr. Singh",
  },
  {
    day: 4,
    start: "10:00",
    end: "10:50",
    subject: "Data Structures",
    room: "CSED-204",
    className: "COE 2B",
    teacher: DEMO_TEACHER,
  },
  {
    day: 4,
    start: "10:00",
    end: "10:50",
    subject: "Software Engineering",
    room: "CSED-203",
    className: "COE 3A",
    teacher: "Dr. Gupta",
  },
  {
    day: 4,
    start: "11:00",
    end: "11:50",
    subject: "Discrete Mathematics",
    room: "LT-301",
    className: "COE 2A",
    teacher: "Dr. Sharma",
  },
  {
    day: 4,
    start: "11:00",
    end: "11:50",
    subject: "Operating Systems",
    room: "CSED-204",
    className: "COE 2B",
    teacher: DEMO_TEACHER,
  },
  {
    day: 4,
    start: "11:00",
    end: "11:50",
    subject: "DBMS",
    room: "CSED-203",
    className: "COE 3A",
    teacher: "Ms. Kaur",
  },
  {
    day: 4,
    start: "14:00",
    end: "14:50",
    subject: "DBMS",
    room: "CSED-204",
    className: "COE 2A",
    teacher: "Ms. Kaur",
  },
  {
    day: 4,
    start: "14:00",
    end: "14:50",
    subject: "Computer Networks",
    room: "LT-301",
    className: "COE 2B",
    teacher: "Dr. Singh",
  },

  // Friday
  {
    day: 5,
    start: "09:00",
    end: "09:50",
    subject: "Software Engineering",
    room: "CSED-204",
    className: "COE 2A",
    teacher: "Dr. Gupta",
  },
  {
    day: 5,
    start: "09:00",
    end: "09:50",
    subject: "Discrete Mathematics",
    room: "CSED-203",
    className: "COE 2B",
    teacher: "Dr. Sharma",
  },
  {
    day: 5,
    start: "09:00",
    end: "09:50",
    subject: "Data Structures",
    room: "CSED-205",
    className: "COE 3A",
    teacher: DEMO_TEACHER,
  },
  {
    day: 5,
    start: "10:00",
    end: "10:50",
    subject: "Data Structures",
    room: "CSED-203",
    className: "COE 2A",
    teacher: DEMO_TEACHER,
  },
  {
    day: 5,
    start: "10:00",
    end: "10:50",
    subject: "Software Engineering",
    room: "CSED-204",
    className: "COE 2B",
    teacher: "Dr. Gupta",
  },
  {
    day: 5,
    start: "10:00",
    end: "10:50",
    subject: "DBMS",
    room: "CSED-205",
    className: "COE 3A",
    teacher: "Ms. Kaur",
  },
  {
    day: 5,
    start: "11:00",
    end: "11:50",
    subject: "Operating Systems",
    room: "CSED-202",
    className: "COE 2A",
    teacher: DEMO_TEACHER,
  },
  {
    day: 5,
    start: "11:00",
    end: "11:50",
    subject: "Computer Networks",
    room: "LT-301",
    className: "COE 2B",
    teacher: "Dr. Singh",
  },
  {
    day: 5,
    start: "11:00",
    end: "11:50",
    subject: "Discrete Mathematics",
    room: "LT-302",
    className: "COE 3A",
    teacher: "Dr. Sharma",
  },
  {
    day: 5,
    start: "13:00",
    end: "14:50",
    subject: "DBMS Lab",
    room: "CSED-LAB-3",
    className: "COE 2A",
    teacher: "Ms. Kaur",
  },
  {
    day: 5,
    start: "13:00",
    end: "14:50",
    subject: "Data Structures Lab",
    room: "CSED-LAB-1",
    className: "COE 2B",
    teacher: DEMO_TEACHER,
  },
];

export function seedTimetable(): TimetableEntry[] {
  return WEEK_1.map((entry, index) => ({
    ...entry,
    id: `seed-${entry.day}-${entry.start.replace(":", "")}-${index}`,
  }));
}

const ensureKey = (key: string): boolean =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage.getItem(key) === null
    : false;

/** Adds the real-looking class timetable on first demo sign-in. */
export function ensureSeedTimetable(): void {
  if (!ensureKey(TIMETABLE_KEY)) return;
  if (loadTimetable().length > 0) return;
  saveTimetable(seedTimetable());
}

export function restoreSeedTimetable(): void {
  saveTimetable(seedTimetable());
}

export function ensureSeedAnnouncements(): void {
  if (!ensureKey(ANNOUNCEMENTS_KEY)) return;
  if (loadAnnouncements().length > 0) return;
  seedAnnouncements();
}

/** Gives the messaging portal a small, believable starting conversation. */
export function ensureSeedMessages(): void {
  const account = (email: string) => DEMO_ACCOUNTS.find((item) => item.email === email) ?? null;
  const cr = account("cr@thapar.edu");
  const cr2 = account("cr2@thapar.edu");
  const teacher = account("teacher@thapar.edu");
  const teacher2 = account("teacher2@thapar.edu");
  const admin = account("doaa@thapar.edu");
  if (!cr || !cr2 || !teacher || !teacher2 || !admin) return;

  const message = (
    channel: string,
    sender: { id: string; name: string; role: "cr" | "teacher" | "admin" },
    body: string,
    minutesAgo: number,
    index: number,
  ) => ({
    id: `${channel}-seed-${index}`,
    channel,
    senderId: sender.id,
    senderName: sender.name,
    senderRole: sender.role,
    body,
    at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    kind: "user" as const,
  });

  seedMessages("staff", [
    message(
      "staff",
      { id: cr.id, name: cr.name, role: "cr" },
      "Morning! COE 2A's DBMS lab is in CSED-LAB-1 today. I'll post here if anything changes.",
      190,
      1,
    ),
    message(
      "staff",
      { id: teacher.id, name: teacher.name, role: "teacher" },
      "Thanks. I've marked CSED-204 as ongoing for the 9 AM Data Structures class.",
      170,
      2,
    ),
    message(
      "staff",
      { id: cr2.id, name: cr2.name, role: "cr" },
      "COE 2B here — our 10 AM DBMS class is in CSED-205. Is the projector working today?",
      165,
      3,
    ),
    message(
      "staff",
      { id: teacher2.id, name: teacher2.name, role: "teacher" },
      "Projector in CSED-205 is fine. I'll take Computer Networks there at 11.",
      160,
      4,
    ),
    message(
      "staff",
      { id: admin.id, name: admin.name, role: "admin" },
      "Noted. The LT block is available after 4 PM if anyone needs a larger room.",
      150,
      5,
    ),
  ]);
  seedMessages("office", [
    message(
      "office",
      { id: admin.id, name: admin.name, role: "admin" },
      "DoAA office: please report any room clashes here. We're checking the LT block after lunch.",
      120,
      1,
    ),
    message(
      "office",
      { id: teacher.id, name: teacher.name, role: "teacher" },
      "CSED-204 is double-booked on Friday at 10 AM. I've moved my class to CSED-203 and posted an announcement.",
      100,
      2,
    ),
    message(
      "office",
      { id: cr2.id, name: cr2.name, role: "cr" },
      "COE 2B also needs CSED-203 on Friday at 10. We can use CSED-205 instead if that helps.",
      90,
      3,
    ),
  ]);
  seedMessages("cr-teachers", [
    message(
      "cr-teachers",
      { id: cr.id, name: cr.name, role: "cr" },
      "Could we move Friday's 10 AM Data Structures class to CSED-203? The projector in 204 is being serviced.",
      95,
      1,
    ),
    message(
      "cr-teachers",
      { id: teacher.id, name: teacher.name, role: "teacher" },
      "Approved — I'll update the schedule and post an announcement.",
      80,
      2,
    ),
    message(
      "cr-teachers",
      { id: cr2.id, name: cr2.name, role: "cr" },
      "Thanks. I've moved COE 2B's DBMS slot to CSED-205 so 203 stays free for you.",
      70,
      3,
    ),
    message(
      "cr-teachers",
      { id: teacher2.id, name: teacher2.name, role: "teacher" },
      "Perfect. I'll take the 11 AM Computer Networks class in CSED-205 after your DBMS lab.",
      60,
      4,
    ),
  ]);
  seedMessages("general", [
    message(
      "general",
      { id: admin.id, name: admin.name, role: "admin" },
      "Welcome to Room Status. The live board now follows the weekly timetable automatically.",
      240,
      1,
    ),
    message(
      "general",
      { id: teacher2.id, name: teacher2.name, role: "teacher" },
      "Two CRs and two teachers are on the demo staff chat now. Teachers can direct-message CRs and the DoAA/DoSAA office.",
      45,
      2,
    ),
  ]);
}

export function ensureDemoData(): void {
  ensureSeedTimetable();
  ensureSeedAnnouncements();
  ensureSeedMessages();
}
