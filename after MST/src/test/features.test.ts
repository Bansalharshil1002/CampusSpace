import { afterEach, describe, expect, it } from "vitest";
import { assistantReply } from "@/lib/assistant";
import {
  ANNOUNCEMENTS_KEY,
  announceRoomStatus,
  visibleAnnouncements,
  type Announcement,
} from "@/lib/announcements";
import {
  appendMessage,
  canDirectMessage,
  canUseChannel,
  dmChannelId,
  dmPartner,
  loadMessages,
  newMessage,
  visibleChannels,
  type ChatChannel,
} from "@/lib/chat";
import { withOccupancy, type RoomOverride } from "@/lib/occupancy";
import type { Room } from "@/lib/rooms";
import type { TimetableEntry } from "@/lib/timetable";

const now = new Date(2026, 0, 5, 9, 30); // Monday, 09:30

function makeRoom(partial: Partial<Room> & { code: string }): Room {
  return {
    id: partial.code,
    building: "CSED",
    floor: 1,
    capacity: 60,
    room_type: "classroom",
    active: true,
    current_status: "FREE",
    status_note: null,
    status_updated_at: new Date(2025, 0, 1).toISOString(),
    status_updated_by_name: null,
    created_at: new Date(2025, 0, 1).toISOString(),
    ...partial,
  };
}

function makeEntry(partial: Partial<TimetableEntry> & { id: string }): TimetableEntry {
  return {
    day: 1,
    start: "09:00",
    end: "10:00",
    subject: "Data Structures",
    room: "CSED-204",
    className: "COE 2A",
    teacher: "Dr. Sharma",
    ...partial,
  };
}

afterEach(() => {
  window.localStorage.removeItem(ANNOUNCEMENTS_KEY);
  window.localStorage.removeItem("rst.announcements.read.v1.student@thapar.edu");
  window.localStorage.removeItem("rst.chat.v1.staff");
});

describe("timetable-driven occupancy", () => {
  const rooms = [
    makeRoom({ code: "CSED-204" }),
    makeRoom({ code: "CSED-101" }),
    makeRoom({ code: "CSED-LAB-1", room_type: "activity_space", current_status: "OCCUPIED" }),
  ];
  const entries = [makeEntry({ id: "a" })];

  it("marks a room with a live class as ONGOING and a room without one as FREE", () => {
    const views = withOccupancy(rooms, entries, { now });
    const busy = views.find((room) => room.code === "CSED-204");
    const free = views.find((room) => room.code === "CSED-101");

    expect(busy?.current_status).toBe("ONGOING");
    expect(busy?.derived).toBe(true);
    expect(busy?.status_note).toContain("Data Structures");
    expect(free?.current_status).toBe("FREE");
    expect(free?.derived).toBe(true);
  });

  it("lets a fresh manual override beat the timetable", () => {
    const override: RoomOverride = {
      status: "FREE",
      note: "Class moved to CSED-101",
      updatedAt: now.toISOString(),
      by: "Simran CR",
    };
    const view = withOccupancy(rooms, entries, {
      now,
      overrides: { "CSED-204": override },
    }).find((room) => room.code === "CSED-204");

    expect(view?.current_status).toBe("FREE");
    expect(view?.status_note).toBe("Class moved to CSED-101");
    expect(view?.override?.by).toBe("Simran CR");
  });

  it("keeps a same-day manual OCCUPIED update and activity spaces untouched", () => {
    const views = withOccupancy(
      [
        makeRoom({
          code: "CSED-204",
          current_status: "OCCUPIED",
          status_updated_at: now.toISOString(),
        }),
        makeRoom({ code: "CSED-LAB-1", room_type: "activity_space", current_status: "OCCUPIED" }),
      ],
      entries,
      { now },
    );

    expect(views[0]?.current_status).toBe("OCCUPIED");
    expect(views[0]?.derived).toBe(false);
    expect(views[1]?.current_status).toBe("OCCUPIED");
    expect(views[1]?.derived).toBe(false);
  });
});

describe("assistant slot queries", () => {
  const rooms = [
    makeRoom({ code: "CSED-204" }),
    makeRoom({ code: "CSED-101" }),
    makeRoom({ code: "LT-301" }),
  ];
  const entries = [
    makeEntry({ id: "a", day: 1, start: "09:00", end: "10:00", room: "CSED-204" }),
    makeEntry({ id: "b", day: 2, start: "11:00", end: "12:00", room: "LT-301", subject: "OS" }),
  ];

  it("lists rooms free for a specific day and time slot", () => {
    const reply = assistantReply("Which rooms are free on Monday 9-10 AM?", {
      rooms,
      entries,
      now,
    });

    expect(reply).toContain("Monday, 9:00 AM–10:00 AM");
    expect(reply).toContain("CSED-101");
    expect(reply).not.toContain("CSED-204");
  });

  it("answers whether one room is busy in a slot", () => {
    const reply = assistantReply("Is LT-301 free on Tuesday at 11 AM?", { rooms, entries, now });

    expect(reply).toContain("LT-301");
    expect(reply).toContain("busy");
    expect(reply).toContain("Booked for OS");
  });
});

describe("announcements", () => {
  function announcement(partial: Partial<Announcement>): Announcement {
    return {
      id: partial.id ?? "ann-1",
      title: partial.title ?? "Notice",
      body: partial.body ?? "Body",
      category: partial.category ?? "general",
      audience: partial.audience ?? "all",
      authorName: "Simran CR",
      authorRole: "cr",
      authorEmail: "cr@thapar.edu",
      createdAt: now.toISOString(),
      source: "manual",
      ...partial,
    };
  }

  it("creates an announcement when a room status changes", () => {
    const created = announceRoomStatus({
      room: "CSED-204",
      status: "CANCELLED",
      byName: "Simran CR",
      byRole: "cr",
      byEmail: "cr@thapar.edu",
    });

    expect(created?.title).toContain("CSED-204");
    expect(created?.category).toBe("schedule");
    expect(window.localStorage.getItem(ANNOUNCEMENTS_KEY)).toContain("CSED-204");
  });

  it("does not announce a normal ONGOING status", () => {
    expect(
      announceRoomStatus({
        room: "CSED-204",
        status: "ONGOING",
        byName: "Simran CR",
        byRole: "cr",
        byEmail: "cr@thapar.edu",
      }),
    ).toBeNull();
    expect(window.localStorage.getItem(ANNOUNCEMENTS_KEY)).toBeNull();
  });

  it("hides staff-only notices from students", () => {
    const items = [
      announcement({ id: "all", audience: "all" }),
      announcement({ id: "staff", audience: "staff" }),
    ];

    expect(visibleAnnouncements(items, "student").map((item) => item.id)).toEqual(["all"]);
    expect(visibleAnnouncements(items, "teacher").map((item) => item.id)).toEqual(["all", "staff"]);
  });
});

describe("staff messaging", () => {
  function channel(partial: Partial<ChatChannel> & { id: string }): ChatChannel {
    return {
      label: partial.id,
      description: "",
      staffOnly: false,
      roles: ["student", "cr", "teacher", "admin"],
      kind: "group",
      ...partial,
    };
  }

  it("builds one stable direct-message channel for a pair", () => {
    expect(dmChannelId("Teacher@thapar.edu", "cr@thapar.edu")).toBe(
      "dm:cr@thapar.edu|teacher@thapar.edu",
    );
    expect(dmPartner("dm:cr@thapar.edu|teacher@thapar.edu", "teacher@thapar.edu")).toBe(
      "cr@thapar.edu",
    );
    expect(dmPartner("staff", "cr@thapar.edu")).toBeNull();
  });

  it("shows staff rooms only to staff roles", () => {
    const staff = channel({ id: "staff", staffOnly: true, roles: ["cr", "teacher", "admin"] });

    expect(visibleChannels(["cr"]).some((item) => item.id === "staff")).toBe(true);
    expect(visibleChannels(["student"]).some((item) => item.id === "staff")).toBe(false);
    expect(visibleChannels(["student"]).some((item) => item.id === "general")).toBe(true);
    expect(canUseChannel(staff, ["admin"])).toBe(true);
    expect(canUseChannel(staff, ["student"])).toBe(false);
  });

  it("only allows teacher ↔ CR and teacher ↔ DoAA/DoSAA direct messages", () => {
    expect(canDirectMessage("teacher", "cr")).toBe(true);
    expect(canDirectMessage("cr", "teacher")).toBe(true);
    expect(canDirectMessage("teacher", "admin")).toBe(true);
    expect(canDirectMessage("admin", "teacher")).toBe(true);

    expect(canDirectMessage("cr", "cr")).toBe(false);
    expect(canDirectMessage("cr", "admin")).toBe(false);
    expect(canDirectMessage("admin", "cr")).toBe(false);
    expect(canDirectMessage("teacher", "teacher")).toBe(false);
    expect(canDirectMessage("student", "teacher")).toBe(false);
    expect(canDirectMessage(null, "teacher")).toBe(false);
  });

  it("persists messages in a channel", () => {
    const message = newMessage(
      "staff",
      { id: "cr@thapar.edu", name: "Simran CR", role: "cr" },
      "CSED-204 is free for the next slot.",
    );
    appendMessage("staff", message);

    const stored = loadMessages("staff");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      senderName: "Simran CR",
      body: "CSED-204 is free for the next slot.",
    });
  });
});
