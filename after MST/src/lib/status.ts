export type RoomStatus = "ONGOING" | "NOT_ARRIVED" | "CANCELLED" | "CHANGED" | "FREE" | "OCCUPIED";
export type RoomType = "classroom" | "lt" | "activity_space";
export type AppRole = "student" | "cr" | "society_rep" | "teacher" | "admin";

export const STATUS_META: Record<RoomStatus, { label: string; dot: string; chip: string }> = {
  ONGOING: {
    label: "Ongoing",
    dot: "bg-st-ongoing",
    chip: "border-st-ongoing/40 bg-st-ongoing/10 text-st-ongoing",
  },
  NOT_ARRIVED: {
    label: "Not arrived",
    dot: "bg-st-not-arrived",
    chip: "border-st-not-arrived/50 bg-st-not-arrived/15 text-accent-foreground",
  },
  CANCELLED: {
    label: "Cancelled",
    dot: "bg-st-cancelled",
    chip: "border-st-cancelled/40 bg-st-cancelled/10 text-st-cancelled",
  },
  CHANGED: {
    label: "Changed",
    dot: "bg-st-changed",
    chip: "border-st-changed/40 bg-st-changed/10 text-st-changed",
  },
  FREE: { label: "Free", dot: "bg-st-free", chip: "border-st-free/40 bg-st-free/10 text-st-free" },
  OCCUPIED: {
    label: "Occupied",
    dot: "bg-st-occupied",
    chip: "border-st-occupied/40 bg-st-occupied/10 text-st-occupied",
  },
};

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  classroom: "Classroom",
  lt: "Lecture Theatre",
  activity_space: "Activity Space",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  student: "Student",
  cr: "Class Representative",
  society_rep: "Society Rep",
  teacher: "Teacher",
  admin: "DoAA / DoSAA",
};

export const ROLE_HINT: Record<AppRole, string> = {
  student: "Can view live room status, upload a timetable and ask Campus AI.",
  cr: "Can update the rooms assigned to their class and coordinate with teachers.",
  society_rep: "Can update assigned activity spaces.",
  teacher: "Can update classrooms and LTs, manage assignments and see history.",
  admin: "DoAA / DoSAA — full control over rooms, roles and assignments.",
};

const ROLE_PRIORITY: AppRole[] = ["admin", "teacher", "cr", "society_rep", "student"];

export function primaryRole(roles: AppRole[]): AppRole | null {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? null;
}

/** Statuses allowed for a room type (mirrors the backend rule). */
export function statusesFor(type: RoomType): RoomStatus[] {
  return type === "activity_space"
    ? ["FREE", "OCCUPIED"]
    : ["ONGOING", "NOT_ARRIVED", "CANCELLED", "CHANGED", "FREE"];
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}
