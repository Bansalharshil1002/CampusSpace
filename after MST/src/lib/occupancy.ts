import type { Tables } from "@/integrations/supabase/types";
import type { RoomStatus } from "@/lib/status";
import {
  entryForRoom,
  formatClock,
  scheduleForRoom,
  timeToMinutes,
  type TimetableEntry,
  type Weekday,
} from "@/lib/timetable";

export type Room = Tables<"rooms">;

export interface RoomOverride {
  status: RoomStatus;
  note: string;
  updatedAt: string;
  by: string;
}

export interface RoomView extends Room {
  liveEntry: TimetableEntry | null;
  nextEntry: TimetableEntry | null;
  derived: boolean;
  override: RoomOverride | null;
}

function dateAt(now: Date, time: string): Date {
  const date = new Date(now);
  date.setHours(Math.floor(timeToMinutes(time) / 60), timeToMinutes(time) % 60, 0, 0);
  return date;
}

function isToday(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * Merges the weekly timetable with the live board.
 *
 * A scheduled class becomes ONGOING automatically, and a room with no class
 * becomes FREE. A recent manual update (cancelled / shifted / not arrived /
 * occupied) still wins so staff can override the timetable.
 */
export function withOccupancy(
  rooms: Room[],
  entries: TimetableEntry[],
  options: { overrides?: Record<string, RoomOverride>; now?: Date } = {},
): RoomView[] {
  const now = options.now ?? new Date();
  const overrides = options.overrides ?? {};
  const day = now.getDay() as Weekday;

  return rooms.map((room) => {
    const liveEntry = entryForRoom(entries, room.code, now);
    const nextEntry =
      scheduleForRoom(entries, room.code, day).find(
        (entry) => timeToMinutes(entry.end) > now.getHours() * 60 + now.getMinutes(),
      ) ?? null;
    const override = overrides[room.code] ?? null;

    if (override) {
      return {
        ...room,
        current_status: override.status,
        status_note: override.note || null,
        status_updated_at: override.updatedAt,
        status_updated_by_name: override.by,
        liveEntry,
        nextEntry,
        derived: true,
        override,
      };
    }

    if (room.room_type === "activity_space") {
      return { ...room, liveEntry, nextEntry, derived: false, override: null };
    }

    const manual =
      isToday(room.status_updated_at, now) &&
      (room.current_status === "CANCELLED" ||
        room.current_status === "CHANGED" ||
        room.current_status === "NOT_ARRIVED" ||
        room.current_status === "OCCUPIED");

    if (manual) {
      return { ...room, liveEntry, nextEntry, derived: false, override: null };
    }

    if (liveEntry) {
      return {
        ...room,
        current_status: "ONGOING",
        status_note: [liveEntry.subject, liveEntry.className].filter(Boolean).join(" · "),
        status_updated_at: dateAt(now, liveEntry.start).toISOString(),
        status_updated_by_name: liveEntry.teacher || null,
        liveEntry,
        nextEntry,
        derived: true,
        override: null,
      };
    }

    return {
      ...room,
      current_status: "FREE",
      status_note: nextEntry
        ? `Free until ${formatClock(nextEntry.start)} · ${nextEntry.subject}`
        : null,
      status_updated_at: nextEntry
        ? dateAt(now, nextEntry.start).toISOString()
        : room.status_updated_at,
      status_updated_by_name: null,
      liveEntry,
      nextEntry,
      derived: true,
      override: null,
    };
  });
}
