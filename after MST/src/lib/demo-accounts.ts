import type { AppRole } from "@/lib/status";

export interface DemoAccount {
  /** Stable local id used for chat messages and demo sessions. */
  id: string;
  email: string;
  password: string;
  name: string;
  role: AppRole;
  /** Room codes this demo account can update. "*" means every room. */
  roomCodes: string[];
  /** Class this account is attached to (student & CR). */
  classCode?: string;
  /** Short description shown on the demo dashboard. */
  headline?: string;
  note: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "demo-student",
    email: "student@thapar.edu",
    password: "student123",
    name: "Aarav Student",
    role: "student",
    roomCodes: [],
    classCode: "COE 2A",
    headline: "COE 2A · 2nd year",
    note: "Read-only student view — my timetable, live rooms, announcements and chat.",
  },
  {
    id: "demo-cr",
    email: "cr@thapar.edu",
    password: "cr123",
    name: "Simran CR",
    role: "cr",
    roomCodes: ["CSED-204", "CSED-202"],
    classCode: "COE 2A",
    headline: "Class Representative · COE 2A",
    note: "Class Representative — update the class rooms, change the schedule and message teachers.",
  },
  {
    id: "demo-cr2",
    email: "cr2@thapar.edu",
    password: "cr123",
    name: "Rohan CR",
    role: "cr",
    roomCodes: ["CSED-205", "CSED-203"],
    classCode: "COE 2B",
    headline: "Class Representative · COE 2B",
    note: "Second CR account — a different class, its own rooms and the same staff chat.",
  },
  {
    id: "demo-teacher",
    email: "teacher@thapar.edu",
    password: "teacher123",
    name: "Dr. Meera Teacher",
    role: "teacher",
    roomCodes: ["CSED-204", "CSED-101", "LT-301"],
    headline: "Faculty · Data Structures & Operating Systems",
    note: "Teacher — update classrooms/LTs, change class schedules and post announcements.",
  },
  {
    id: "demo-teacher2",
    email: "teacher2@thapar.edu",
    password: "teacher123",
    name: "Prof. Arjun Teacher",
    role: "teacher",
    roomCodes: ["CSED-203", "CSED-202", "LT-102"],
    headline: "Faculty · Computer Networks & DBMS",
    note: "Second teacher account — another timetable, rooms and direct messages with staff.",
  },
  {
    id: "demo-admin",
    email: "doaa@thapar.edu",
    password: "doaa123",
    name: "DoAA / DoSAA Office",
    role: "admin",
    roomCodes: ["*"],
    headline: "Dean of Academic Affairs / Student Affairs",
    note: "DoAA/DoSAA — full dashboard: every room, lab, activity space and staff message.",
  },
];

export function demoAccountId(account: DemoAccount): string {
  return account.id;
}
