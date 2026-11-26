import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  Megaphone,
  MessageSquare,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { RoomDialog } from "@/components/RoomDialog";
import { RoleAssignForm } from "@/components/RoleAssignForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAnnouncements } from "@/hooks/use-announcements";
import { useAuth } from "@/hooks/use-auth";
import { useNow } from "@/hooks/use-now";
import { useRoomViews, useRooms } from "@/hooks/use-rooms";
import { useTimetable } from "@/hooks/use-timetable";
import {
  clearDemoSession,
  demoCanUpdate,
  findVisibleDemoAccountByKey,
  loadVisibleDemoAccount,
  startDemoSession,
} from "@/lib/demo";
import { demoEffectiveRole } from "@/lib/demo-roles";
import { ROOM_KIND_LABEL, roomKind, roomKindLabel, roomMatches, type RoomKind } from "@/lib/rooms";
import type { RoomView } from "@/lib/occupancy";
import {
  activeEntries,
  entriesForDay,
  formatClock,
  upcomingEntries,
  WEEKDAY_LABEL,
  type TimetableEntry,
  type Weekday,
} from "@/lib/timetable";
import {
  ROLE_HINT,
  ROLE_LABEL,
  STATUS_META,
  primaryRole,
  timeAgo,
  type AppRole,
  type RoomStatus,
} from "@/lib/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const demoKey =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("demo");
    if (demoKey) {
      const account = findVisibleDemoAccountByKey(demoKey);
      if (account) {
        startDemoSession(account);
        return;
      }
    }
    if (loadVisibleDemoAccount()) return;
    const session = await api.me();
    if (!session?.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Room Status Tracker — Live classroom status" },
      {
        name: "description",
        content:
          "See the latest status of CSED classrooms, labs, lecture theatres and activity spaces.",
      },
      { property: "og:title", content: "Room Status Tracker" },
      {
        property: "og:description",
        content: "Live status of classrooms, labs, LTs and activity spaces.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Room Status Tracker" },
    ],
  }),
  component: Dashboard,
});

const TYPES: (RoomKind | "all")[] = ["all", "classroom", "lab", "lt", "activity_space"];

const ROLE_TITLE: Record<AppRole, string> = {
  student: "Your campus, live",
  cr: "CR dashboard",
  teacher: "Teacher dashboard",
  admin: "DoAA / DoSAA dashboard",
  society_rep: "Society rep dashboard",
};

function displayName(user: { email?: string; user_metadata?: unknown } | null): string {
  const meta = user?.user_metadata as { name?: unknown } | undefined;
  if (typeof meta?.name === "string" && meta.name.trim()) return meta.name.trim();
  return user?.email?.split("@")[0] ?? "";
}

function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, roles, isDemo, demoAccount } = useAuth();
  const { visible: announcements, unread } = useAnnouncements();
  const roomViews = useRoomViews();
  const roomsQ = useRooms();
  const timetable = useTimetable();
  const now = useNow(30_000);
  const role = primaryRole(roles);
  const roleKey: AppRole = role ?? "student";
  const canUpdate = role !== null && role !== "student";
  const myClass =
    demoAccount?.classCode ?? (roleKey === "student" || roleKey === "cr" ? "COE 2A" : "");
  const myName = demoAccount?.name ?? displayName(user);

  const [type, setType] = useState<RoomKind | "all">("all");
  const [statusF, setStatusF] = useState<RoomStatus | "all">("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const myRoomsQ = useQuery({
    queryKey: ["my-rooms", user?.id],
    enabled: !!user && canUpdate && !isDemo,
    queryFn: async () => {
      return api.updatableRoomIds();
    },
  });

  useEffect(() => {
    if (isDemo) return;
    const timer = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["rooms"] });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [qc, isDemo]);

  const rooms = roomViews;
  const myRooms = isDemo
    ? rooms.filter((room) => demoCanUpdate(demoAccount, room.code))
    : rooms.filter((room) => myRoomsQ.data?.includes(room.id));
  const filtered = rooms.filter(
    (room) =>
      (type === "all" || roomKind(room) === type) &&
      (statusF === "all" || room.current_status === statusF) &&
      (!q || `${room.code} ${room.building}`.toLowerCase().includes(q.toLowerCase())),
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, RoomView[]>();
    filtered.forEach((room) =>
      grouped.set(room.building, [...(grouped.get(room.building) ?? []), room]),
    );
    return [...grouped.entries()];
  }, [filtered]);
  const counts = rooms.reduce<Record<string, number>>(
    (accumulator, room) => ({
      ...accumulator,
      [room.current_status]: (accumulator[room.current_status] ?? 0) + 1,
    }),
    {},
  );
  const openRoom = rooms.find((room) => room.id === openId) ?? null;
  const inClassNow = rooms.filter((room) => room.liveEntry).length;
  const freeNow = rooms.filter((room) => room.current_status === "FREE").length;
  const labs = rooms.filter((room) => roomKind(room) === "lab").length;
  const todayEntries = entriesForDay(timetable, now.getDay() as Weekday);
  const myEntries = useMemo(() => {
    if (roleKey === "admin") return todayEntries;
    if (roleKey === "teacher") {
      const surname = myName.toLowerCase().split(" ").slice(-1)[0] ?? myName.toLowerCase();
      return todayEntries.filter((entry) => entry.teacher.toLowerCase().includes(surname));
    }
    return todayEntries.filter((entry) => roomMatches(entry.className, myClass));
  }, [todayEntries, roleKey, myName, myClass]);
  const nextClass = upcomingEntries(myEntries, now, 1)[0] ?? null;
  const liveMine = activeEntries(myEntries, now);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <section className="bg-grid bg-ink text-ink-foreground">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-10">
          <p className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-accent">
            <span className="h-2 w-2 rounded-full bg-st-free animate-pulse-dot" />
            {role ? `${ROLE_LABEL[role]} · live board` : "Live board"}
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold md:text-5xl">
            {role ? ROLE_TITLE[roleKey] : "Is the room actually in use?"}
          </h1>
          <p className="mt-3 max-w-xl text-ink-foreground/70">
            {role
              ? ROLE_HINT[roleKey]
              : "The timetable says what's planned. This board shows what's happening."}
          </p>
          <p className="mt-2 font-mono text-xs text-ink-foreground/50">
            {demoAccount?.headline && demoEffectiveRole(demoAccount) === demoAccount.role
              ? `${demoAccount.headline} · `
              : ""}
            Signed in as {user?.email ?? "…"}
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            {roleKey !== "admin" && (
              <Link
                to="/timetable"
                className="rounded-md border border-ink-foreground/20 px-3 py-2 hover:border-accent"
              >
                {timetable.length === 0
                  ? "Timetable →"
                  : `Timetable · ${todayEntries.length} today →`}
              </Link>
            )}
            <Link
              to="/announcements"
              className="rounded-md border border-ink-foreground/20 px-3 py-2 hover:border-accent"
            >
              Announcements{unread.length > 0 ? ` · ${unread.length} new` : ""} →
            </Link>
            <Link
              to="/assistant"
              className="rounded-md border border-ink-foreground/20 px-3 py-2 hover:border-accent"
            >
              Ask Campus AI →
            </Link>
            {roleKey !== "student" && (
              <Link
                to="/chat"
                className="rounded-md border border-ink-foreground/20 px-3 py-2 hover:border-accent"
              >
                Messages →
              </Link>
            )}
            {isDemo ? (
              <button
                onClick={() => {
                  clearDemoSession();
                  void navigate({ to: "/auth", replace: true });
                }}
                className="rounded-md border border-accent/60 px-3 py-2 text-accent hover:bg-accent/10"
              >
                Switch demo account →
              </button>
            ) : (
              canUpdate && (
                <Link
                  to="/manage"
                  className="rounded-md border border-ink-foreground/20 px-3 py-2 hover:border-accent"
                >
                  Manage rooms & roles →
                </Link>
              )
            )}
          </div>
          {isDemo && (
            <p className="mt-3 font-mono text-xs text-accent">
              Demo mode — status changes
              {roleKey !== "student" ? ", messages" : ""} and announcements stay in this browser.
            </p>
          )}
          <div
            className={cn(
              "mt-8 grid grid-cols-2 gap-2",
              canUpdate ? "sm:grid-cols-5" : "sm:grid-cols-4",
            )}
          >
            <div className="rounded-md border border-ink-foreground/15 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-foreground/70">
                In class now
              </span>
              <p className="font-display text-2xl font-bold">{inClassNow}</p>
            </div>
            <div className="rounded-md border border-ink-foreground/15 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-foreground/70">
                Free right now
              </span>
              <p className="font-display text-2xl font-bold">{freeNow}</p>
            </div>
            {canUpdate && (
              <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-foreground/70">
                  {role === "admin" ? "Managed rooms" : "My rooms"}
                </span>
                <p className="font-display text-2xl font-bold">
                  {myRoomsQ.isLoading ? "…" : myRooms.length}
                </p>
              </div>
            )}
            <div className="rounded-md border border-ink-foreground/15 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-foreground/70">
                Labs
              </span>
              <p className="font-display text-2xl font-bold">{labs}</p>
            </div>
            <div className="rounded-md border border-ink-foreground/15 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-foreground/70">
                Live classes
              </span>
              <p className="font-display text-2xl font-bold">
                {activeEntries(timetable, now).length}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {(Object.keys(STATUS_META) as RoomStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusF(statusF === status ? "all" : status)}
                aria-pressed={statusF === status}
                className={cn(
                  "rounded-md border border-ink-foreground/15 px-3 py-2 text-left transition hover:border-ink-foreground/40",
                  statusF === status && "border-accent bg-ink-foreground/10",
                )}
              >
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-foreground/70">
                  <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[status].dot)} />
                  {STATUS_META[status].label}
                </span>
                <span className="font-display text-2xl font-bold">{counts[status] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <RolePanel
          role={roleKey}
          myClass={myClass}
          myEntries={myEntries}
          liveMine={liveMine}
          nextClass={nextClass}
          now={now}
          freeNow={freeNow}
          inClassNow={inClassNow}
          myRooms={myRooms}
          announcements={announcements}
          unread={unread.length}
          onOpenRoom={setOpenId}
        />

        {roleKey === "admin" && (
          <section className="mb-6 rounded-xl border bg-card p-5 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Assign roles by email</h2>
                <p className="text-sm text-muted-foreground">
                  Make someone a CR, teacher, student or DoAA/DoSAA. The role is saved to the campus
                  backend and applies the next time they sign in.
                </p>
              </div>
              {!isDemo && (
                <Link to="/manage" hash="users" className="text-sm underline">
                  Full user list →
                </Link>
              )}
            </div>
            <RoleAssignForm demo={isDemo} className="mt-4" />
          </section>
        )}

        {liveMine.length > 0 && (
          <section className="mb-6 rounded-lg border border-st-changed/30 bg-st-changed/5 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">In class right now</h2>
              {roleKey !== "admin" && (
                <Link to="/timetable" className="text-sm underline">
                  Full timetable →
                </Link>
              )}
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {liveMine.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border bg-card px-3 py-2 text-sm shadow-card"
                >
                  <p className="font-mono text-xs text-muted-foreground">
                    {entry.room} · until {formatClock(entry.end)}
                  </p>
                  <p className="font-medium">{entry.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {[entry.className, entry.teacher].filter(Boolean).join(" · ") ||
                      "Scheduled class"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canUpdate && (
          <section className="mb-6 rounded-lg border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">
                  {role === "admin" ? "Rooms you control" : "Your rooms"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {role === "cr"
                    ? "Tap a room to update its live status for your class."
                    : role === "teacher"
                      ? "Tap a room to mark it cancelled, shifted or ongoing."
                      : "Tap a room to update its live status."}
                </p>
              </div>
              {isDemo ? (
                <span className="text-sm text-muted-foreground">
                  {myRooms.length} room{myRooms.length === 1 ? "" : "s"} in demo
                </span>
              ) : (
                <Link to="/manage" className="text-sm underline">
                  Open Manage →
                </Link>
              )}
            </div>
            {!isDemo && myRoomsQ.isLoading && (
              <p className="mt-3 text-sm text-muted-foreground">Loading your rooms…</p>
            )}
            {!isDemo && !myRoomsQ.isLoading && myRooms.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                No rooms assigned yet. A teacher or DoAA/DoSAA can assign them from Manage →
                Assignments.
              </p>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {myRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setOpenId(room.id)}
                  className="rounded-md border bg-background p-3 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold">{room.code}</span>
                    <StatusBadge status={room.current_status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {room.liveEntry
                      ? `${room.liveEntry.subject} until ${formatClock(room.liveEntry.end)}`
                      : room.nextEntry
                        ? `Free until ${formatClock(room.nextEntry.start)}`
                        : "No scheduled class now"}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
            {TYPES.map((item) => (
              <button
                key={item}
                onClick={() => setType(item)}
                aria-pressed={type === item}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition",
                  type === item ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {item === "all" ? "All rooms" : ROOM_KIND_LABEL[item]}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search room or building…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="sm:ml-auto sm:max-w-xs"
            aria-label="Search rooms"
          />
        </div>

        {roomsQ.isLoading && <p className="text-muted-foreground">Loading rooms…</p>}
        {roomsQ.error && <p className="text-destructive">Couldn't load rooms. Please refresh.</p>}
        {!roomsQ.isLoading && !roomsQ.error && filtered.length === 0 && (
          <p className="text-muted-foreground">No rooms match these filters.</p>
        )}

        <div className="space-y-10">
          {groups.map(([building, list]) => (
            <section key={building}>
              <h2 className="mb-3 flex items-baseline gap-3 text-lg font-semibold">
                {building}{" "}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {list.length} rooms
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => setOpenId(room.id)}
                    className="group relative overflow-hidden rounded-lg border bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 w-1",
                        STATUS_META[room.current_status].dot,
                      )}
                    />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-lg font-bold">{room.code}</p>
                        <p className="text-xs text-muted-foreground">
                          {roomKindLabel(room)} · Floor {room.floor}
                        </p>
                      </div>
                      <StatusBadge status={room.current_status} />
                    </div>
                    {room.liveEntry ? (
                      <p className="mt-3 rounded border border-st-changed/30 bg-st-changed/10 px-2 py-1 text-xs">
                        <span className="font-medium">{room.liveEntry.subject}</span> until{" "}
                        {formatClock(room.liveEntry.end)}
                        {room.liveEntry.className ? ` · ${room.liveEntry.className}` : ""}
                      </p>
                    ) : room.nextEntry ? (
                      <p className="mt-3 rounded border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                        Next: {room.nextEntry.subject} at {formatClock(room.nextEntry.start)}
                      </p>
                    ) : (
                      <p className="mt-3 line-clamp-1 min-h-5 text-sm">
                        {room.status_note ?? (
                          <span className="text-muted-foreground">No classes today</span>
                        )}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <RoomDialog room={openRoom} onOpenChange={(open) => !open && setOpenId(null)} />
    </div>
  );
}

interface RolePanelProps {
  role: AppRole;
  myClass: string;
  myEntries: TimetableEntry[];
  liveMine: TimetableEntry[];
  nextClass: TimetableEntry | null;
  now: Date;
  freeNow: number;
  inClassNow: number;
  myRooms: RoomView[];
  announcements: ReturnType<typeof useAnnouncements>["visible"];
  unread: number;
  onOpenRoom: (id: string) => void;
}

function RolePanel({
  role,
  myClass,
  myEntries,
  liveMine,
  nextClass,
  now,
  freeNow,
  inClassNow,
  myRooms,
  announcements,
  unread,
  onOpenRoom,
}: RolePanelProps) {
  const [showAllClasses, setShowAllClasses] = useState(false);
  const dayLabel = WEEKDAY_LABEL[now.getDay() as keyof typeof WEEKDAY_LABEL];
  const classList = showAllClasses ? myEntries : myEntries.slice(0, 4);

  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-3">
      <div className="rounded-xl border bg-card p-5 shadow-card lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {role === "student"
                ? `${myClass} · ${dayLabel}`
                : role === "cr"
                  ? `Class representative · ${myClass}`
                  : role === "teacher"
                    ? `Teaching · ${dayLabel}`
                    : "Campus overview"}
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold">
              {role === "student" ? (
                <>
                  <GraduationCap className="h-5 w-5" /> My day
                </>
              ) : role === "cr" ? (
                <>
                  <Users className="h-5 w-5" /> {myClass} today
                </>
              ) : role === "teacher" ? (
                <>
                  <CalendarDays className="h-5 w-5" /> Your classes
                </>
              ) : (
                <>
                  <DoorOpen className="h-5 w-5" /> Campus pulse
                </>
              )}
            </h2>
          </div>
          <span className="rounded-full border bg-muted/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {myEntries.length} class{myEntries.length === 1 ? "" : "es"} today
          </span>
        </div>

        {role === "admin" ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Free now" value={freeNow} />
            <Stat label="In class" value={inClassNow} />
            <Stat label="Rooms I manage" value={myRooms.length} />
            <Stat label="Unread notices" value={unread} />
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-lg border border-accent/40 bg-accent/10 p-3">
              {liveMine.length > 0 ? (
                <p className="text-sm">
                  <span className="font-medium">Happening now:</span>{" "}
                  {liveMine.map((entry) => `${entry.subject} in ${entry.room}`).join(", ")}.
                </p>
              ) : nextClass ? (
                <p className="text-sm">
                  <span className="font-medium">Next class:</span> {nextClass.subject} at{" "}
                  {formatClock(nextClass.start)} in{" "}
                  <span className="font-mono">{nextClass.room}</span>{" "}
                  {nextClass.teacher ? `with ${nextClass.teacher}` : ""}.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No more classes today. {freeNow} rooms are free right now.
                </p>
              )}
            </div>

            {myEntries.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No classes scheduled today. Check the timetable for the rest of the week.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {classList.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{entry.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatClock(entry.start)}–{formatClock(entry.end)} ·{" "}
                        <span className="font-mono">{entry.room}</span>
                        {entry.teacher ? ` · ${entry.teacher}` : ""}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {entry.className}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {myEntries.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllClasses((value) => !value)}
                className="mt-2 text-xs underline"
              >
                {showAllClasses ? "Show less" : `Show all ${myEntries.length} classes`}
              </button>
            )}
          </>
        )}

        {(role === "cr" || role === "teacher") && myRooms.length > 0 && (
          <div className="mt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Quick room update
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {myRooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onOpenRoom(room.id)}
                  className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs transition hover:border-primary"
                >
                  <span className="font-mono font-bold">{room.code}</span>
                  <StatusBadge status={room.current_status} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <RoleActions role={role} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Megaphone className="h-4 w-4" /> Latest announcements
            </h2>
            <Link to="/announcements" className="text-xs underline">
              All
            </Link>
          </div>
          {announcements.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No announcements yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {announcements.slice(0, 3).map((item) => (
                <li key={item.id} className="rounded-md border bg-background px-3 py-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.authorName} · {timeAgo(item.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4" /> Campus AI
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask which rooms are free on any day and time slot. Answers use your timetable.
          </p>
          <Link
            to="/assistant"
            className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Ask about a time slot <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function RoleActions({ role }: { role: AppRole }) {
  return (
    <>
      {role === "student" && (
        <>
          <Button size="sm" variant="outline" asChild>
            <Link to="/timetable">My timetable</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/timetable" hash="upload">
              <Upload className="mr-1 h-4 w-4" /> Upload timetable (PDF/photo)
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/assistant">Find a free room</Link>
          </Button>
        </>
      )}
      {role === "cr" && (
        <>
          <Button size="sm" asChild>
            <Link to="/timetable">Change a class</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/announcements">Post an announcement</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/chat">
              <MessageSquare className="mr-1 h-4 w-4" /> Message teachers
            </Link>
          </Button>
        </>
      )}
      {role === "teacher" && (
        <>
          <Button size="sm" asChild>
            <Link to="/timetable">Change a class</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/announcements">Post an announcement</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/chat">
              <MessageSquare className="mr-1 h-4 w-4" /> Staff messages
            </Link>
          </Button>
        </>
      )}
      {role === "admin" && (
        <>
          <Button size="sm" asChild>
            <Link to="/manage">Manage rooms & roles</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/announcements">Post a notice</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/chat">
              <MessageSquare className="mr-1 h-4 w-4" /> Staff messages
            </Link>
          </Button>
        </>
      )}
    </>
  );
}
