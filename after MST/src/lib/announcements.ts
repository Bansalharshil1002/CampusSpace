import type { AppRole, RoomStatus } from "@/lib/status";
import { STATUS_META } from "@/lib/status";

export type AnnouncementCategory = "schedule" | "room" | "general" | "urgent";
export type AnnouncementAudience = "all" | "students" | "staff";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  authorName: string;
  authorRole: AppRole;
  authorEmail: string;
  createdAt: string;
  room?: string;
  className?: string;
  pinned?: boolean;
  source: "manual" | "room" | "timetable";
}

export const ANNOUNCEMENTS_KEY = "rst.announcements.v1";
export const ANNOUNCEMENTS_EVENT = "rst:announcements";
export const ANNOUNCEMENTS_READ_KEY = "rst.announcements.read.v1";

export const CATEGORY_META: Record<
  AnnouncementCategory,
  { label: string; className: string; dot: string }
> = {
  schedule: {
    label: "Schedule",
    className: "border-st-changed/40 bg-st-changed/10 text-st-changed",
    dot: "bg-st-changed",
  },
  room: {
    label: "Room update",
    className: "border-st-free/40 bg-st-free/10 text-st-free",
    dot: "bg-st-free",
  },
  urgent: {
    label: "Urgent",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  general: {
    label: "Notice",
    className: "border-border bg-muted/60 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  all: "Everyone",
  students: "Students",
  staff: "Staff only",
};

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isAnnouncement(value: unknown): value is Announcement {
  if (!value || typeof value !== "object") return false;
  const a = value as Partial<Announcement>;
  return (
    typeof a.id === "string" &&
    typeof a.title === "string" &&
    typeof a.body === "string" &&
    typeof a.authorName === "string" &&
    typeof a.authorRole === "string" &&
    typeof a.createdAt === "string" &&
    typeof a.category === "string" &&
    typeof a.audience === "string"
  );
}

export function loadAnnouncements(): Announcement[] {
  if (!canStore()) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ANNOUNCEMENTS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAnnouncement).sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } catch {
    return [];
  }
}

export function saveAnnouncements(items: Announcement[]): void {
  if (!canStore()) return;
  window.localStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(ANNOUNCEMENTS_EVENT));
}

export function addAnnouncement(values: Omit<Announcement, "id" | "createdAt">): Announcement {
  const item: Announcement = {
    ...values,
    id: makeId(),
    createdAt: new Date().toISOString(),
  };
  saveAnnouncements([item, ...loadAnnouncements()]);
  return item;
}

/** The audience a signed-in role is allowed to read. */
export function audienceForRole(role: AppRole): AnnouncementAudience[] {
  if (role === "student") return ["all", "students"];
  return ["all", "students", "staff"];
}

export function visibleAnnouncements(items: Announcement[], role: AppRole): Announcement[] {
  const allowed = audienceForRole(role);
  return items.filter((item) => allowed.includes(item.audience));
}

export function readKeyFor(email: string): string {
  return `${ANNOUNCEMENTS_READ_KEY}.${email.toLowerCase()}`;
}

export function loadReadIds(email: string): string[] {
  if (!canStore() || !email) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(readKeyFor(email)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function markAnnouncementsRead(email: string, ids: string[]): void {
  if (!canStore() || !email) return;
  const merged = [...new Set([...loadReadIds(email), ...ids])];
  window.localStorage.setItem(readKeyFor(email), JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(ANNOUNCEMENTS_EVENT));
}

export function unreadCount(items: Announcement[], email: string, role: AppRole): number {
  const read = new Set(loadReadIds(email));
  return visibleAnnouncements(items, role).filter((item) => !read.has(item.id)).length;
}

export function announceRoomStatus(input: {
  room: string;
  status: RoomStatus;
  note?: string;
  byName: string;
  byRole: AppRole;
  byEmail: string;
}): Announcement | null {
  if (input.status === "ONGOING") return null;
  const label = STATUS_META[input.status].label;
  const titles: Partial<Record<RoomStatus, string>> = {
    CANCELLED: `${input.room}: class cancelled`,
    CHANGED: `${input.room}: schedule changed`,
    NOT_ARRIVED: `${input.room}: class not started yet`,
    FREE: `${input.room} is now free`,
    OCCUPIED: `${input.room} is now occupied`,
  };
  const title = titles[input.status] ?? `${input.room}: ${label}`;
  const body =
    input.note?.trim() ||
    (input.status === "CANCELLED"
      ? `${input.byName} marked the class in ${input.room} as cancelled. The room is free for this slot.`
      : `${input.byName} updated ${input.room} to “${label}”. Check the live board before heading over.`);

  return addAnnouncement({
    title,
    body,
    category: input.status === "CANCELLED" || input.status === "CHANGED" ? "schedule" : "room",
    audience: "all",
    authorName: input.byName,
    authorRole: input.byRole,
    authorEmail: input.byEmail,
    room: input.room,
    source: "room",
  });
}

export function announceScheduleChange(input: {
  title: string;
  body: string;
  room?: string;
  className?: string;
  byName: string;
  byRole: AppRole;
  byEmail: string;
}): Announcement {
  return addAnnouncement({
    title: input.title,
    body: input.body,
    category: "schedule",
    audience: "all",
    authorName: input.byName,
    authorRole: input.byRole,
    authorEmail: input.byEmail,
    ...(input.room ? { room: input.room } : {}),
    ...(input.className ? { className: input.className } : {}),
    source: "timetable",
  });
}

export function seedAnnouncements(): void {
  const now = Date.now();
  const items: Announcement[] = [
    {
      id: "seed-ann-1",
      title: "Data Structures moved to CSED-203 on Friday",
      body: "Friday's 10:00 AM Data Structures class for COE 2A has been moved from CSED-204 to CSED-203. The projector in CSED-204 is being serviced. Same time, same faculty.",
      category: "schedule",
      audience: "all",
      authorName: "Dr. Meera Teacher",
      authorRole: "teacher",
      authorEmail: "teacher@thapar.edu",
      createdAt: new Date(now - 55 * 60_000).toISOString(),
      room: "CSED-203",
      className: "COE 2A",
      pinned: true,
      source: "timetable",
    },
    {
      id: "seed-ann-2",
      title: "DBMS lab shifted to CSED-LAB-1 today",
      body: "COE 2A's DBMS lab will run in CSED-LAB-1 instead of CSED-LAB-2. Please carry your lab manuals.",
      category: "schedule",
      audience: "students",
      authorName: "Simran CR",
      authorRole: "cr",
      authorEmail: "cr@thapar.edu",
      createdAt: new Date(now - 3 * 60 * 60_000).toISOString(),
      room: "CSED-LAB-1",
      className: "COE 2A",
      source: "timetable",
    },
    {
      id: "seed-ann-3",
      title: "Guest lecture: Building reliable distributed systems",
      body: "A guest lecture by an industry engineer will be held in LT-301 on Thursday at 2:00 PM. Open to all COE students. Seats are first come, first served.",
      category: "general",
      audience: "all",
      authorName: "DoAA / DoSAA Office",
      authorRole: "admin",
      authorEmail: "doaa@thapar.edu",
      createdAt: new Date(now - 8 * 60 * 60_000).toISOString(),
      room: "LT-301",
      source: "manual",
    },
    {
      id: "seed-ann-4",
      title: "Wi-Fi maintenance in the CSED block",
      body: "Campus Wi-Fi in the CSED block will be unavailable from 6:00 PM to 7:00 PM today. Classroom projectors are unaffected.",
      category: "urgent",
      audience: "all",
      authorName: "DoAA / DoSAA Office",
      authorRole: "admin",
      authorEmail: "doaa@thapar.edu",
      createdAt: new Date(now - 26 * 60 * 60_000).toISOString(),
      source: "manual",
    },
  ];
  saveAnnouncements(items);
}
