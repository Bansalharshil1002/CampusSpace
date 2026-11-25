import type { Room } from "@/lib/occupancy";

/**
 * Rooms added by a DoAA/DoSAA in demo mode. They live in localStorage so every
 * demo dashboard can show them, and they disappear with the rest of the demo
 * data (never sent to the backend).
 */
export const DEMO_ROOMS_KEY = "rst.demo.custom-rooms.v1";
export const DEMO_ROOMS_EVENT = "rst:demo-custom-rooms";

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isDemoRoom(value: unknown): value is Room {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<Room>;
  return (
    typeof room.id === "string" &&
    typeof room.code === "string" &&
    typeof room.building === "string" &&
    typeof room.floor === "number" &&
    typeof room.current_status === "string" &&
    typeof room.created_at === "string"
  );
}

export function loadDemoRooms(): Room[] {
  if (!canStore()) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEMO_ROOMS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isDemoRoom) : [];
  } catch {
    return [];
  }
}

export function saveDemoRooms(rooms: Room[]): void {
  if (!canStore()) return;
  window.localStorage.setItem(DEMO_ROOMS_KEY, JSON.stringify(rooms));
  window.dispatchEvent(new CustomEvent(DEMO_ROOMS_EVENT));
}

export function addDemoRoom(input: { building: string; code: string; floor: number }): Room {
  const now = new Date().toISOString();
  const room: Room = {
    id: `demo-room-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    code: input.code.trim(),
    building: input.building.trim(),
    floor: input.floor,
    capacity: null,
    room_type: "classroom",
    active: true,
    current_status: "FREE",
    status_note: null,
    status_updated_at: now,
    status_updated_by_name: null,
    created_at: now,
  };
  saveDemoRooms([...loadDemoRooms(), room]);
  return room;
}
