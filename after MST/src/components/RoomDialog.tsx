import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type ApiRoom } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/hooks/use-auth";
import { useTimetable } from "@/hooks/use-timetable";
import { demoCanUpdate, saveDemoOverride } from "@/lib/demo";
import { announceRoomStatus } from "@/lib/announcements";
import { pushAnnouncement } from "@/lib/remote-sync";
import { roomKindLabel } from "@/lib/rooms";
import { formatClock, scheduleForRoom, type Weekday } from "@/lib/timetable";
import { STATUS_META, primaryRole, statusesFor, type RoomStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

type Room = ApiRoom;

function displayName(user: { email?: string; user_metadata?: unknown } | null): string {
  const meta = user?.user_metadata as { name?: unknown } | undefined;
  if (typeof meta?.name === "string" && meta.name.trim()) return meta.name.trim();
  return user?.email?.split("@")[0] ?? "Staff";
}

export function RoomDialog({
  room,
  onOpenChange,
}: {
  room: Room | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { user, roles, hasAny, isDemo, demoAccount } = useAuth();
  const qc = useQueryClient();
  const timetable = useTimetable();
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [note, setNote] = useState("");
  const todaySchedule = room
    ? scheduleForRoom(timetable, room.code, new Date().getDay() as Weekday)
    : [];

  const canQ = useQuery({
    queryKey: ["can-update", room?.id, user?.id],
    enabled: !!room && !!user && !isDemo,
    queryFn: async () => {
      const data = await api.canUpdate(room!.id);
      return data.allowed;
    },
  });

  const canUpdate = isDemo ? demoCanUpdate(demoAccount, room?.code ?? "") : !!canQ.data;
  const canHistory = hasAny(["admin", "teacher"]);
  const histQ = useQuery({
    queryKey: ["history", room?.id],
    enabled: !!room && canHistory,
    queryFn: async () => {
      return api.roomHistory(room!.id);
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      if (isDemo) {
        if (!room || !demoAccount) throw new Error("This demo room could not be found.");
        if (!demoCanUpdate(demoAccount, room.code)) {
          throw new Error("This demo account is not assigned to that room.");
        }
        saveDemoOverride(room.code, {
          status: status!,
          note: note.trim(),
          updatedAt: new Date().toISOString(),
          by: demoAccount.name,
        });
        return;
      }
      await api.setRoomStatus(room!.id, status!, note.trim() || undefined);
    },
    onSuccess: () => {
      if (room && status) {
        const role = primaryRole(roles);
        if (role && role !== "student") {
          const announcement = announceRoomStatus({
            room: room.code,
            status,
            note: note.trim(),
            byName: demoAccount?.name ?? displayName(user),
            byRole: role,
            byEmail: demoAccount?.email ?? user?.email ?? "",
          });
          if (announcement && !isDemo) void pushAnnouncement(announcement);
        }
      }
      toast.success(
        isDemo
          ? `Demo: ${room!.code} updated in this browser`
          : `${room!.code} updated to ${STATUS_META[status!].label}`,
      );
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["history", room!.id] });
      setStatus(null);
      setNote("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });

  return (
    <Dialog
      open={!!room}
      onOpenChange={(o) => {
        if (!o) {
          setStatus(null);
          setNote("");
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        {room && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 font-mono text-2xl">
                {room.code} <StatusBadge status={room.current_status} />
              </DialogTitle>
              <DialogDescription>
                {roomKindLabel(room)} · {room.building} · Floor {room.floor}
                {room.capacity ? ` · ${room.capacity} seats` : ""}
              </DialogDescription>
            </DialogHeader>

            {room.status_note && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <p>“{room.status_note}”</p>
              </div>
            )}

            {todaySchedule.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Today's timetable</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {todaySchedule.map((entry) => (
                    <li key={entry.id}>
                      <span className="font-mono text-xs">
                        {formatClock(entry.start)}–{formatClock(entry.end)}
                      </span>{" "}
                      — {entry.subject}
                      {entry.className ? ` · ${entry.className}` : ""}
                      {entry.teacher ? ` · ${entry.teacher}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!room.active && (
              <p className="text-sm text-destructive">
                This room is deactivated and can't be updated.
              </p>
            )}

            {user && canUpdate && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (status) m.mutate();
                }}
              >
                <p className="text-sm font-medium">Update status</p>
                <div className="flex flex-wrap gap-2">
                  {statusesFor(room.room_type).map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setStatus(s)}
                      aria-pressed={status === s}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        status === s
                          ? "border-foreground bg-foreground text-background"
                          : "bg-card hover:bg-muted",
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="Optional note, e.g. shifted to LT-301"
                  maxLength={280}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  aria-label="Note"
                />
                {isDemo && (
                  <p className="text-xs text-muted-foreground">
                    Demo mode: this status is saved in your browser only.
                  </p>
                )}
                <Button type="submit" disabled={!status || m.isPending} className="w-full">
                  {m.isPending ? "Saving…" : "Save status"}
                </Button>
              </form>
            )}
            {user &&
              room.active &&
              (isDemo ? !canUpdate : !canQ.isLoading && canQ.data === false) && (
                <p className="text-sm text-muted-foreground">
                  You can view this room but aren't assigned to update it.
                </p>
              )}
            {!user && (
              <p className="text-sm text-muted-foreground">
                Sign in to update rooms assigned to you.
              </p>
            )}

            {canHistory && (
              <div>
                <p className="mb-2 text-sm font-medium">Recent history</p>
                <ul className="max-h-48 space-y-2 overflow-auto text-sm">
                  {histQ.data?.length === 0 && (
                    <li className="text-muted-foreground">No updates yet.</li>
                  )}
                  {histQ.data?.map((h) => (
                    <li key={h.id} className="flex items-start gap-2 border-b pb-2 last:border-0">
                      <StatusBadge status={h.status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          {h.profiles?.name || h.profiles?.email || "Unknown"}
                          {h.note ? ` — ${h.note}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
