import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api";
import { addDemoRoom } from "@/lib/demo-rooms";
import { normalizeRoomCode } from "@/lib/rooms";

export const Route = createFileRoute("/_authenticated/classes")({
  head: () => ({
    meta: [
      { title: "Classes — Room Status Tracker" },
      { name: "description", content: "Add a building, room number and floor to the live board." },
      { property: "og:title", content: "Classes — Room Status Tracker" },
      { property: "og:description", content: "Add a class to the campus live board." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClassesPage,
});

function ClassesPage() {
  const { ready, hasAny, isDemo } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const rooms = useRooms();
  const canManage = hasAny(["admin"]);

  const [building, setBuilding] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [floor, setFloor] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roomList = useMemo(() => rooms.data ?? [], [rooms.data]);

  const buildings = useMemo(
    () =>
      Array.from(new Set(roomList.map((room) => room.building).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [roomList],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof roomList>();
    for (const room of roomList) {
      const list = map.get(room.building) ?? [];
      list.push(room);
      map.set(room.building, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [roomList]);

  useEffect(() => {
    const first = buildings[0];
    if (!building && first) setBuilding(first);
  }, [building, buildings]);

  useEffect(() => {
    if (ready && !canManage) void navigate({ to: "/", replace: true });
  }, [ready, canManage, navigate]);

  if (!ready || !canManage) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const buildingValue = building.trim();
    const code = roomNo.trim();
    const floorValue = Number(floor);

    if (!buildingValue) {
      setError("Choose a building.");
      return;
    }
    if (!code) {
      setError("Room number is required.");
      return;
    }
    if (!Number.isInteger(floorValue) || floorValue < 0) {
      setError("Floor number must be a whole number.");
      return;
    }
    if (roomList.some((room) => normalizeRoomCode(room.code) === normalizeRoomCode(code))) {
      setError(`${code} is already on the board.`);
      return;
    }

    try {
      setBusy(true);
      if (isDemo) {
        addDemoRoom({ building: buildingValue, code, floor: floorValue });
      } else {
        await api.createRoom({
          code,
          building: buildingValue,
          floor: floorValue,
          capacity: null,
          room_type: "classroom",
        });
        await qc.invalidateQueries({ queryKey: ["rooms"] });
      }
      toast.success(`${code} added under ${buildingValue}`);
      setRoomNo("");
      setFloor("0");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add that class.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            DoAA / DoSAA
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold">
            <Building2 className="h-7 w-7" /> Classes
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Add a class by choosing its building, room number and floor. It appears on every
            dashboard under that building as soon as you save it.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          <form onSubmit={submit} className="h-fit rounded-xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Plus className="h-5 w-5" /> Add class
            </h2>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="class-building">Building name</Label>
                <select
                  id="class-building"
                  value={building}
                  onChange={(event) => setBuilding(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {buildings.length === 0 && <option value="">No buildings yet</option>}
                  {buildings.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-room">Room number</Label>
                <Input
                  id="class-room"
                  placeholder="LT-101 / L430"
                  value={roomNo}
                  onChange={(event) => setRoomNo(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-floor">Floor number</Label>
                <Input
                  id="class-floor"
                  type="number"
                  min={0}
                  step={1}
                  value={floor}
                  onChange={(event) => setFloor(event.target.value)}
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy || buildings.length === 0}>
                {busy ? "Adding…" : "Add class"}
              </Button>
            </div>
          </form>

          <section>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {roomList.length} class
                {roomList.length === 1 ? "" : "es"}
              </h2>
              <p className="text-sm text-muted-foreground">Grouped by building</p>
            </div>
            {grouped.length === 0 ? (
              <p className="mt-4 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                No classes yet. Add the first one on the left.
              </p>
            ) : (
              <div className="mt-4 space-y-5">
                {grouped.map(([name, list]) => (
                  <div key={name}>
                    <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                      {name}
                      <span className="font-mono text-xs font-normal text-muted-foreground">
                        {list.length} rooms
                      </span>
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {list.map((room) => (
                        <article
                          key={room.id}
                          className="rounded-lg border bg-card p-4 shadow-card"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-lg font-bold">{room.code}</p>
                              <p className="text-xs text-muted-foreground">
                                {name} · Floor {room.floor}
                              </p>
                            </div>
                            <StatusBadge status={room.current_status} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
