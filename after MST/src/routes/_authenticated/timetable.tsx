import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Clock, Loader2, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useNow } from "@/hooks/use-now";
import { useRooms } from "@/hooks/use-rooms";
import { useTimetable } from "@/hooks/use-timetable";
import { announceScheduleChange } from "@/lib/announcements";
import { roomKindLabel, roomMatches } from "@/lib/rooms";
import {
  activeEntries,
  addTimetableEntries,
  demoEntries,
  entriesForDay,
  filterKnownRooms,
  formatClock,
  parseTimetable,
  removeTimetableEntry,
  replaceTimetableEntries,
  saveTimetable,
  updateTimetableEntry,
  WEEK_ORDER,
  WEEKDAY_LABEL,
  type RoomFilterResult,
  type TimetableEntry,
  type Weekday,
} from "@/lib/timetable";
import { extractTimetableFile } from "@/lib/timetable-import";
import { primaryRole } from "@/lib/status";
import { restoreSeedTimetable } from "@/lib/seed";
import {
  pushAnnouncement,
  pushTimetableDelete,
  pushTimetablePatch,
  pushTimetableReplace,
  restoreRemoteTimetable,
} from "@/lib/remote-sync";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/timetable")({
  head: () => ({
    meta: [
      { title: "Timetable — Room Status Tracker" },
      {
        name: "description",
        content: "The weekly student timetable, live room occupancy and schedule changes.",
      },
      { property: "og:title", content: "Timetable — Room Status Tracker" },
      { property: "og:description", content: "Weekly timetable and live room occupancy." },
      { property: "og:type", content: "website" },
      { twitter: { card: "summary" } },
    ],
  }),
  component: TimetablePage,
});

const SAMPLE = `Day,Start,End,Subject,Room,Class,Teacher
Monday,09:00,10:00,Data Structures,CSED-204,COE 2A,Dr. Sharma
Monday,10:00,11:00,DBMS Lab,CSED-101,COE 2B,Ms. Kaur
Tuesday,11:00,12:00,Operating Systems,LT-301,COE 3B,Dr. Singh
Wednesday,14:00,15:00,Computer Networks,LP-101,COE 3A,Dr. Mehta
Thursday,09:00,10:00,Discrete Maths,CSED-201,COE 2A,Dr. Verma
Friday,12:00,13:00,Software Engineering,LT-302,COE 4A,Dr. Gupta`;

function displayName(user: { email?: string; user_metadata?: unknown } | null): string {
  const meta = user?.user_metadata as { name?: unknown } | undefined;
  if (typeof meta?.name === "string" && meta.name.trim()) return meta.name.trim();
  return user?.email?.split("@")[0] ?? "Staff";
}

function TimetablePage() {
  const { user, roles, isDemo, demoAccount } = useAuth();
  const entries = useTimetable();
  const roomsData = useRooms().data;
  const rooms = useMemo(() => roomsData ?? [], [roomsData]);
  const now = useNow(30_000);
  const role = primaryRole(roles) ?? "student";
  const staff = role !== "student";
  const canReplace = role !== "cr";
  const myClass = demoAccount?.classCode ?? (role === "student" || role === "cr" ? "COE 2A" : "");
  const myName = demoAccount?.name ?? displayName(user);

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [day, setDay] = useState<Weekday>(now.getDay() as Weekday);
  const [scope, setScope] = useState<"mine" | "all">(role === "admin" ? "all" : "mine");
  const [moveTarget, setMoveTarget] = useState<TimetableEntry | null>(null);
  const [moveRoom, setMoveRoom] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [roomWarning, setRoomWarning] = useState<string | null>(null);

  const matchesMine = (entry: TimetableEntry) => {
    if (role === "admin") return true;
    if (role === "teacher") {
      return entry.teacher
        .toLowerCase()
        .includes(myName.toLowerCase().split(" ")[1] ?? myName.toLowerCase());
    }
    if (role === "cr" || role === "student") {
      return roomMatches(entry.className, myClass);
    }
    return false;
  };

  const scoped = useMemo(
    () => (scope === "mine" ? entries.filter(matchesMine) : entries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, scope, role, myClass, myName],
  );
  const dayEntries = entriesForDay(scoped, day);
  const live = activeEntries(scoped, now);
  const roomsWithLive = live.map((entry) => ({
    entry,
    room: rooms.find((room) => roomMatches(entry.room, room.code)),
  }));

  const grouped = WEEK_ORDER.map((weekday) => ({
    weekday,
    list: entriesForDay(scoped, weekday),
  })).filter((group) => group.list.length > 0);

  const canEdit = (entry: TimetableEntry) => {
    if (role === "admin") return true;
    if (role === "teacher") return matchesMine(entry);
    if (role === "cr") return matchesMine(entry);
    return false;
  };

  const author = {
    byName: demoAccount?.name ?? displayName(user),
    byRole: role,
    byEmail: demoAccount?.email ?? user?.email ?? "",
  };

  function sync(task: () => Promise<void>) {
    if (!isDemo) void task();
  }

  /** Applies only the classes whose room actually exists in the app. */
  function applyParsedEntries(incoming: TimetableEntry[]): RoomFilterResult | null {
    const filtered = filterKnownRooms(
      incoming,
      rooms.map((room) => room.code),
    );

    if (filtered.skippedEntries > 0) {
      const listed = filtered.skippedRooms.slice(0, 6).join(", ");
      const extra =
        filtered.skippedRooms.length > 6 ? ` and ${filtered.skippedRooms.length - 6} more` : "";
      setRoomWarning(
        `Skipped ${filtered.skippedEntries} class${
          filtered.skippedEntries === 1 ? "" : "es"
        } in room${filtered.skippedRooms.length === 1 ? "" : "s"} this app doesn't track yet: ${listed}${extra}. ${
          staff
            ? "Add those rooms in Manage → Rooms if they should appear on the live board."
            : "The DoAA/DoSAA office can add a room if it should appear on the live board."
        }`,
      );
    } else {
      setRoomWarning(null);
    }

    if (filtered.entries.length === 0) {
      toast.error(
        filtered.skippedEntries > 0
          ? "Every class was in a room this app doesn't track, so nothing was imported."
          : "Nothing could be imported.",
      );
      return null;
    }

    replaceTimetableEntries(filtered.entries);
    sync(() => pushTimetableReplace(filtered.entries));
    setDay((current) =>
      filtered.entries.some((entry) => entry.day === current)
        ? current
        : (filtered.entries[0]?.day ?? current),
    );
    return filtered;
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErrors([]);
    setFileWarning(null);
    setRoomWarning(null);
    setFileName(file.name);

    if (/\.(csv|ics|txt)$/i.test(file.name) || file.type.startsWith("text/")) {
      setText(await file.text());
      return;
    }

    setExtracting(true);
    setProgressMessage("Reading file…");
    try {
      const result = await extractTimetableFile(file, ({ message, progress }) => {
        setProgressMessage(`${message} ${Math.round(progress * 100)}%`);
      });
      setText(result.text);
      setFileWarning(result.warning ?? null);
      const parsed = parseTimetable(result.text);
      setErrors(parsed.errors.slice(0, 8));
      if (parsed.entries.length > 0) {
        const applied = applyParsedEntries(parsed.entries);
        if (applied) {
          toast.success(
            `Read ${applied.entries.length} classes — the live board now follows this timetable`,
          );
        }
      } else {
        toast.error(
          "Could not read any classes. Check the extracted text and press Apply timetable.",
        );
      }
    } catch (error) {
      setFileWarning(null);
      toast.error(error instanceof Error ? error.message : "Could not read that file.");
    } finally {
      setExtracting(false);
      setProgressMessage("");
    }
  }

  function importText() {
    if (!text.trim()) {
      toast.error("Paste a timetable or choose a CSV/ICS/PDF/photo first");
      return;
    }
    const result = parseTimetable(text);
    setErrors(result.errors.slice(0, 8));
    if (result.entries.length === 0) {
      toast.error("Nothing could be imported");
      return;
    }
    const applied = applyParsedEntries(result.entries);
    if (!applied) return;
    toast.success(
      `Imported ${applied.entries.length} class${applied.entries.length === 1 ? "" : "es"} — live room occupancy updated`,
    );
    setText("");
    setFileName("");
  }

  function loadDemo() {
    const next = addTimetableEntries(demoEntries());
    sync(() => pushTimetableReplace(next));
    toast.success("Demo classes added for right now");
  }

  function cancelClass(entry: TimetableEntry) {
    const confirmed = window.confirm(
      `Cancel ${entry.subject} (${entry.className}) in ${entry.room} on ${WEEKDAY_LABEL[entry.day]} at ${formatClock(entry.start)}?`,
    );
    if (!confirmed) return;
    removeTimetableEntry(entry.id);
    sync(() => pushTimetableDelete(entry.id));
    const announcement = announceScheduleChange({
      title: `${entry.subject} cancelled for ${entry.className}`,
      body: `${entry.subject} on ${WEEKDAY_LABEL[entry.day]} at ${formatClock(entry.start)} in ${entry.room} has been cancelled. ${entry.room} is free for that slot.`,
      room: entry.room,
      className: entry.className,
      ...author,
    });
    sync(() => pushAnnouncement(announcement));
    toast.success("Class cancelled and announced");
  }

  function confirmMove() {
    if (!moveTarget || !moveRoom.trim()) return;
    const oldRoom = moveTarget.room;
    updateTimetableEntry(moveTarget.id, { room: moveRoom.trim() });
    sync(() => pushTimetablePatch(moveTarget.id, { room: moveRoom.trim() }));
    const announcement = announceScheduleChange({
      title: `${moveTarget.subject} moved to ${moveRoom.trim()}`,
      body: `${moveTarget.subject} for ${moveTarget.className} on ${WEEKDAY_LABEL[moveTarget.day]} at ${formatClock(moveTarget.start)} has moved from ${oldRoom} to ${moveRoom.trim()}.`,
      room: moveRoom.trim(),
      className: moveTarget.className,
      ...author,
    });
    sync(() => pushAnnouncement(announcement));
    toast.success(`Class moved to ${moveRoom.trim()}`);
    setMoveTarget(null);
    setMoveRoom("");
  }

  const roomOptions = useMemo(() => {
    const codes = new Set(entries.map((entry) => entry.room));
    rooms.forEach((room) => codes.add(room.code));
    return [...codes].sort();
  }, [entries, rooms]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {myClass ? `Weekly plan · ${myClass}` : "Weekly plan"}
            </p>
            <h1 className="mt-1 text-3xl font-bold">Timetable</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {staff
                ? "Room occupancy follows this timetable automatically. CRs and teachers can move or cancel a class — everyone gets an announcement when that happens."
                : "Upload a PDF or a clear photo of your timetable. The live room board follows the classes in it automatically."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canReplace && (
              <Button type="button" variant="outline" onClick={loadDemo}>
                Add a live demo class
              </Button>
            )}
            {canReplace && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (isDemo) restoreSeedTimetable();
                  else void restoreRemoteTimetable();
                  toast.success("Official timetable restored");
                }}
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Restore official timetable
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-card p-1">
            {(role === "admin" ? (["all", "mine"] as const) : (["mine", "all"] as const)).map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setScope(item)}
                  aria-pressed={scope === item}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition",
                    scope === item ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {item === "mine"
                    ? role === "teacher"
                      ? "My classes"
                      : role === "admin"
                        ? "My view"
                        : `${myClass || "My class"}`
                    : "All classes"}
                </button>
              ),
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {scoped.length} class{scoped.length === 1 ? "" : "es"} in this view ·{" "}
            {isDemo ? "demo data" : "shared timetable"}
          </p>
        </div>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Clock className="h-5 w-5" /> Right now
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {live.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No class from this timetable is running at this minute.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {roomsWithLive.map(({ entry, room }) => (
                  <li key={entry.id} className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono font-bold">{entry.room}</span>
                      <span className="text-xs text-muted-foreground">
                        until {formatClock(entry.end)}
                      </span>
                    </div>
                    <p className="font-medium">{entry.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {[entry.className, entry.teacher, room ? roomKindLabel(room) : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarDays className="h-5 w-5" /> Week at a glance
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {WEEK_ORDER.map((weekday) => {
                const count = entriesForDay(scoped, weekday).length;
                return (
                  <li
                    key={weekday}
                    className={cn(
                      "flex items-center justify-between rounded px-2 py-1",
                      weekday === now.getDay() && "bg-accent/15 font-medium",
                    )}
                  >
                    <span>
                      {WEEKDAY_LABEL[weekday]}
                      {weekday === now.getDay() ? " · today" : ""}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {count} class{count === 1 ? "" : "es"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="upload" className="mt-6 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="text-lg font-semibold">
            {canReplace
              ? staff
                ? "Import another timetable"
                : "Upload your timetable"
              : "Manage classes"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {!canReplace
              ? "CRs can move or cancel a class from the table below. Replacing the whole timetable is limited to teachers and the DoAA/DoSAA office."
              : staff
                ? "CSV, ICS, PDF or a photo of the timetable. Uploading replaces the current timetable so live room occupancy matches it."
                : "Choose a PDF or a clear photo of your timetable. We read it in your browser and update the live room board from the classes we find."}
          </p>
          {canReplace ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="timetable-file">
                    Choose a file (PDF, PNG, JPG, CSV, ICS, TXT)
                  </Label>
                  <Input
                    id="timetable-file"
                    type="file"
                    accept=".csv,.ics,.txt,.pdf,application/pdf,image/*"
                    disabled={extracting}
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                  {fileName && (
                    <p className="text-xs text-muted-foreground">Selected: {fileName}</p>
                  )}
                  {extracting && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {progressMessage || "Reading timetable…"}
                    </p>
                  )}
                  {fileWarning && (
                    <p className="rounded-md border border-st-changed/40 bg-st-changed/10 p-2 text-xs text-st-changed">
                      {fileWarning}
                    </p>
                  )}
                  {roomWarning && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                      {roomWarning}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timetable-text">
                    {staff
                      ? "…or paste the timetable"
                      : "Extracted timetable text (edit if needed)"}
                  </Label>
                  <Textarea
                    id="timetable-text"
                    rows={5}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={SAMPLE}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={importText} disabled={extracting}>
                    <Upload className="mr-1 h-4 w-4" /> Apply timetable
                  </Button>
                  {staff && (
                    <Button type="button" variant="outline" onClick={() => setText(SAMPLE)}>
                      Use sample format
                    </Button>
                  )}
                  {entries.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        saveTimetable([]);
                        if (isDemo) {
                          toast.success("Timetable cleared");
                        } else if (role === "student") {
                          void restoreRemoteTimetable();
                          toast.success(
                            "Personal timetable cleared — showing the official timetable",
                          );
                        } else {
                          void pushTimetableReplace([]);
                          toast.success("Timetable cleared");
                        }
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Clear
                    </Button>
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium">How uploaded timetables work</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>• PDFs with selectable text are read directly.</li>
                  <li>• Photos and scanned PDFs use text recognition in your browser.</li>
                  <li>• Photo recognition downloads the OCR engine the first time.</li>
                  <li>• Each row needs a day, time range, subject and room code.</li>
                  <li>• Applying a timetable replaces the old one and drives room occupancy.</li>
                  {staff && <li>• Every manual class change still posts an announcement.</li>}
                </ul>
              </div>
            </div>
          ) : null}
          {errors.length > 0 && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Some rows could not be read:</p>
              <ul className="mt-1 list-inside list-disc">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {scope === "mine" ? "My weekly schedule" : "All classes this week"}
            </h2>
            <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
              {WEEK_ORDER.map((weekday) => (
                <button
                  key={weekday}
                  type="button"
                  onClick={() => setDay(weekday)}
                  aria-pressed={day === weekday}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition sm:text-sm",
                    day === weekday ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    weekday === now.getDay() && day !== weekday && "underline",
                  )}
                >
                  {WEEKDAY_LABEL[weekday].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {dayEntries.length === 0 ? (
            <p className="mt-4 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              No classes on {WEEKDAY_LABEL[day]} in this view.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Room</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Teacher</th>
                    <th className="p-3 text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {dayEntries.map((entry) => {
                    const isLive =
                      entry.day === now.getDay() &&
                      now.getHours() * 60 + now.getMinutes() >=
                        Number(entry.start.split(":")[0]) * 60 +
                          Number(entry.start.split(":")[1]) &&
                      now.getHours() * 60 + now.getMinutes() <
                        Number(entry.end.split(":")[0]) * 60 + Number(entry.end.split(":")[1]);
                    return (
                      <tr key={entry.id} className={cn("border-t", isLive && "bg-accent/10")}>
                        <td className="whitespace-nowrap p-3 font-mono text-xs">
                          {formatClock(entry.start)} – {formatClock(entry.end)}
                          {isLive && (
                            <span className="ml-2 rounded-full border border-st-ongoing/40 bg-st-ongoing/10 px-1.5 py-0.5 text-[9px] uppercase text-st-ongoing">
                              now
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-medium">{entry.subject}</td>
                        <td className="p-3 font-mono">{entry.room}</td>
                        <td className="p-3">{entry.className || "—"}</td>
                        <td className="p-3">{entry.teacher || "—"}</td>
                        <td className="p-3">
                          {canEdit(entry) ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setMoveTarget(entry);
                                  setMoveRoom(entry.room);
                                }}
                              >
                                <Pencil className="mr-1 h-3.5 w-3.5" /> Move
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => cancelClass(entry)}
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Cancel
                              </Button>
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {grouped.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <CalendarDays className="h-5 w-5" /> Full week
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.map((group) => (
                <div key={group.weekday} className="rounded-lg border bg-card p-4">
                  <p className="font-display font-semibold">{WEEKDAY_LABEL[group.weekday]}</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {group.list.map((entry) => (
                      <li key={entry.id} className="border-t pt-2 first:border-0 first:pt-0">
                        <p className="font-mono text-xs text-muted-foreground">
                          {formatClock(entry.start)}–{formatClock(entry.end)} · {entry.room}
                        </p>
                        <p className="font-medium">{entry.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {[entry.className, entry.teacher].filter(Boolean).join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <Dialog
          open={!!moveTarget}
          onOpenChange={(open) => {
            if (!open) {
              setMoveTarget(null);
              setMoveRoom("");
            }
          }}
        >
          <DialogContent className="max-w-md">
            {moveTarget && (
              <>
                <DialogHeader>
                  <DialogTitle>Move class</DialogTitle>
                  <DialogDescription>
                    {moveTarget.subject} · {WEEKDAY_LABEL[moveTarget.day]} at{" "}
                    {formatClock(moveTarget.start)} · currently {moveTarget.room}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>New room</Label>
                    <Select value={moveRoom} onValueChange={setMoveRoom}>
                      <SelectTrigger aria-label="New room">
                        <SelectValue placeholder="Choose a room" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomOptions.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Moving the class updates room occupancy and posts an announcement for everyone.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setMoveTarget(null)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={confirmMove}
                      disabled={!moveRoom || moveRoom === moveTarget.room}
                    >
                      Move class
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
