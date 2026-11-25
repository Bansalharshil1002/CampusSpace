import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { RoomType } from "@/lib/status";

export type Room = Tables<"rooms">;
export type RoomKind = RoomType | "lab";

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  classroom: "Classroom",
  lt: "Lecture Theatre",
  activity_space: "Activity Space",
  lab: "Lab",
};

/** Explicit lab rooms: CSED-LAB-1, LAB-2, etc. */
export function isLabCode(code: string): boolean {
  const c = code.toUpperCase();
  return /\bLAB\b/.test(c) || /^LAB[-\s]?\d+$/.test(c) || /-(LAB|L)\d+$/.test(c);
}

export function isLectureCode(code: string): boolean {
  return /^(LT|LP)[-\s]?\d/i.test(code.trim());
}

export function roomKind(room: Pick<Room, "code" | "room_type">): RoomKind {
  if (isLabCode(room.code)) return "lab";
  if (isLectureCode(room.code)) return "lt";
  return room.room_type;
}

export function roomKindLabel(room: Pick<Room, "code" | "room_type">): string {
  return ROOM_KIND_LABEL[roomKind(room)];
}

/** Room codes are compared without spaces, dashes or case. */
export function normalizeRoomCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function roomMatches(a: string, b: string): boolean {
  const left = normalizeRoomCode(a);
  const right = normalizeRoomCode(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}

export const DEFAULT_CAMPUS_ROOMS: TablesInsert<"rooms">[] = [
  { code: "LT-101", building: "LT Block", floor: 1, capacity: 180, room_type: "lt" },
  { code: "LT-102", building: "LT Block", floor: 1, capacity: 180, room_type: "lt" },
  { code: "LP-101", building: "LP Block", floor: 1, capacity: 120, room_type: "lt" },
  { code: "LP-102", building: "LP Block", floor: 2, capacity: 120, room_type: "lt" },
  { code: "CSED-LAB-1", building: "CSED", floor: 1, capacity: 40, room_type: "classroom" },
  { code: "CSED-LAB-2", building: "CSED", floor: 1, capacity: 40, room_type: "classroom" },
  { code: "CSED-LAB-3", building: "CSED", floor: 2, capacity: 40, room_type: "classroom" },
];
