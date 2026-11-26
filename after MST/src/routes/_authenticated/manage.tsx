import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { RoomDialog } from "@/components/RoomDialog";
import { RoleAssignForm } from "@/components/RoleAssignForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { loadVisibleDemoAccount } from "@/lib/demo";
import { DEFAULT_CAMPUS_ROOMS, normalizeRoomCode, roomKindLabel } from "@/lib/rooms";
import { ROLE_LABEL, ROOM_TYPE_LABEL, timeAgo, type AppRole, type RoomType } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/manage")({
  beforeLoad: () => {
    if (loadVisibleDemoAccount()) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Manage — Room Status Tracker" },
      {
        name: "description",
        content: "Update assigned rooms, manage assignments, rooms and history.",
      },
      { property: "og:title", content: "Manage — Room Status Tracker" },
      { property: "og:description", content: "Role-based room management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Manage,
});

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

function useRooms() {
  return useQuery({
    queryKey: ["rooms-all"],
    queryFn: async () => {
      return api.listRooms();
    },
  });
}

function Manage() {
  const { user, has, hasAny } = useAuth();
  const isAdmin = has("admin");
  const isStaff = hasAny(["admin", "teacher"]);
  const hash = typeof window === "undefined" ? "" : window.location.hash.replace("#", "");
  const initialTab = isAdmin && hash === "users" ? "users" : "mine";
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold">Manage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What you can do here depends on your role and room assignments.
        </p>
        <Tabs defaultValue={initialTab} className="mt-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="mine">My rooms</TabsTrigger>
            {isStaff && <TabsTrigger value="assign">Assignments</TabsTrigger>}
            {isStaff && <TabsTrigger value="history">History</TabsTrigger>}
            {isAdmin && <TabsTrigger value="rooms">Rooms</TabsTrigger>}
            {isAdmin && <TabsTrigger value="users">Users & roles</TabsTrigger>}
          </TabsList>
          <TabsContent value="mine">
            <MyRooms userId={user?.id} />
          </TabsContent>
          {isStaff && (
            <TabsContent value="assign">
              <Assignments isAdmin={isAdmin} />
            </TabsContent>
          )}
          {isStaff && (
            <TabsContent value="history">
              <History />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="rooms">
              <RoomsAdmin />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="users">
              <UsersAdmin selfId={user?.id} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

function MyRooms({ userId }: { userId: string | undefined }) {
  const rooms = useRooms();
  const [openId, setOpenId] = useState<string | null>(null);
  const can = useQuery({
    queryKey: ["my-updatable", userId, rooms.data?.length],
    enabled: !!userId && !!rooms.data,
    queryFn: async () => {
      const res = await Promise.all(
        rooms
          .data!.filter((r) => r.active)
          .map(async (r) => {
            const { allowed } = await api.canUpdate(r.id);
            return allowed ? r.id : null;
          }),
      );
      return res.filter(Boolean) as string[];
    },
  });
  const list = (rooms.data ?? []).filter((r) => can.data?.includes(r.id));
  const open = rooms.data?.find((r) => r.id === openId) ?? null;
  return (
    <div className="mt-4">
      {can.isLoading && <p className="text-muted-foreground">Checking your permissions…</p>}
      {can.data && list.length === 0 && (
        <p className="rounded-lg border bg-card p-6 text-muted-foreground">
          You don't have any rooms to update yet. Students can view the dashboard; a teacher or
          admin can assign you as a CR or society rep.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenId(r.id)}
            className="rounded-lg border bg-card p-4 text-left shadow-card hover:bg-muted/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold">{r.code}</span>
              <StatusBadge status={r.current_status} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {roomKindLabel(r)} · updated {timeAgo(r.status_updated_at)}
            </p>
            <p className="mt-3 text-sm font-medium underline">Update status →</p>
          </button>
        ))}
      </div>
      <RoomDialog room={open} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}

function Assignments({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const rooms = useRooms();
  const [email, setEmail] = useState("");
  const [roomId, setRoomId] = useState("");
  const list = useQuery({
    queryKey: ["assignments"],
    queryFn: async () => {
      return api.listAssignments();
    },
  });
  const assignable = (rooms.data ?? []).filter(
    (r) => r.active && (isAdmin || r.room_type !== "activity_space"),
  );
  const add = useMutation({
    mutationFn: async () => {
      await api.assignRoom(email, roomId);
    },
    onSuccess: () => {
      toast.success("Assignment created");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await api.patchAssignment(id, active);
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="mt-4 space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email && roomId) add.mutate();
        }}
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="text-sm font-medium" htmlFor="as-email">
            User email
          </label>
          <Input
            id="as-email"
            type="email"
            placeholder="cr@thapar.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <span className="text-sm font-medium">Room</span>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger aria-label="Room">
              <SelectValue placeholder="Choose room" />
            </SelectTrigger>
            <SelectContent>
              {assignable.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.code} · {roomKindLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={!email || !roomId || add.isPending}>
          Assign
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Assigning a classroom/LT grants CR access; assigning an activity space grants Society Rep
        access. The person must have signed in once.
      </p>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="p-3">Person</th>
              <th className="p-3">Room</th>
              <th className="p-3">Since</th>
              <th className="p-3">State</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-3">
                  {a.user?.name}
                  <div className="font-mono text-xs text-muted-foreground">{a.user?.email}</div>
                </td>
                <td className="p-3 font-mono">{a.rooms?.code}</td>
                <td className="p-3 text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString()}
                </td>
                <td className="p-3">{a.active ? "Active" : "Inactive"}</td>
                <td className="p-3 text-right">
                  {(isAdmin || a.rooms?.room_type !== "activity_space") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggle.mutate({ id: a.id, active: !a.active })}
                    >
                      {a.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No assignments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function History() {
  const q = useQuery({
    queryKey: ["history-all"],
    queryFn: async () => {
      return api.allHistory();
    },
  });
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left">
          <tr>
            <th className="p-3">When</th>
            <th className="p-3">Room</th>
            <th className="p-3">Status</th>
            <th className="p-3">Note</th>
            <th className="p-3">By</th>
          </tr>
        </thead>
        <tbody>
          {q.data?.map((h) => (
            <tr key={h.id} className="border-t">
              <td className="whitespace-nowrap p-3 text-muted-foreground">
                {new Date(h.created_at).toLocaleString()}
              </td>
              <td className="p-3 font-mono">{h.rooms?.code}</td>
              <td className="p-3">
                <StatusBadge status={h.status} />
              </td>
              <td className="p-3">{h.note ?? "—"}</td>
              <td className="p-3">{h.profiles?.name || h.profiles?.email}</td>
            </tr>
          ))}
          {q.data?.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-muted-foreground">
                No status changes recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RoomsAdmin() {
  const qc = useQueryClient();
  const rooms = useRooms();
  const [f, setF] = useState({
    code: "",
    building: "",
    floor: "0",
    capacity: "",
    room_type: "classroom" as RoomType,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rooms-all"] });
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };
  const add = useMutation({
    mutationFn: async () => {
      if (!f.code.trim() || !f.building.trim()) throw new Error("Code and building are required");
      await api.createRoom({
        code: f.code.trim(),
        building: f.building.trim(),
        floor: Number(f.floor) || 0,
        capacity: f.capacity ? Number(f.capacity) : null,
        room_type: f.room_type,
      });
    },
    onSuccess: () => {
      toast.success("Room added");
      setF({ ...f, code: "" });
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await api.patchRoom(id, { active });
    },
    onSuccess: () => {
      toast.success("Room updated");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const seed = useMutation({
    mutationFn: async () => {
      const existing = new Set((rooms.data ?? []).map((r) => normalizeRoomCode(r.code)));
      const missing = DEFAULT_CAMPUS_ROOMS.filter(
        (r) => !existing.has(normalizeRoomCode(r.code ?? "")),
      );
      if (missing.length === 0) return 0;
      const result = await api.seedRooms();
      return result.added;
    },
    onSuccess: (count) => {
      toast.success(
        count ? `Added ${count} CSED labs / LT / LP rooms` : "Those rooms already exist",
      );
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="mt-4 space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-6 sm:items-end"
      >
        <Input
          aria-label="Room code"
          placeholder="Code e.g. CSED-305"
          value={f.code}
          onChange={(e) => setF({ ...f, code: e.target.value })}
          className="sm:col-span-2"
        />
        <Input
          aria-label="Building"
          placeholder="Building"
          value={f.building}
          onChange={(e) => setF({ ...f, building: e.target.value })}
        />
        <Input
          aria-label="Floor"
          type="number"
          placeholder="Floor"
          value={f.floor}
          onChange={(e) => setF({ ...f, floor: e.target.value })}
        />
        <Select value={f.room_type} onValueChange={(v) => setF({ ...f, room_type: v as RoomType })}>
          <SelectTrigger aria-label="Room type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROOM_TYPE_LABEL) as RoomType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {ROOM_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={add.isPending}>
          Add room
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          CSED rooms are shown as labs; LT/LP rooms as lecture theatres.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => seed.mutate()}
          disabled={seed.isPending}
        >
          {seed.isPending ? "Adding…" : "Add CSED labs & LT/LP rooms"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Type</th>
              <th className="p-3">Building</th>
              <th className="p-3">Floor</th>
              <th className="p-3">State</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rooms.data?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-mono">{r.code}</td>
                <td className="p-3">{roomKindLabel(r)}</td>
                <td className="p-3">{r.building}</td>
                <td className="p-3">{r.floor}</td>
                <td className="p-3">{r.active ? "Active" : "Deactivated"}</td>
                <td className="p-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                  >
                    {r.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ROLES: AppRole[] = ["student", "cr", "society_rep", "teacher", "admin"];

function UsersAdmin({ selfId }: { selfId: string | undefined }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      return api.listUsers();
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ id, role, on }: { id: string; role: AppRole; on: boolean }) => {
      if (!on && id === selfId && role === "admin") {
        throw new Error("You can't remove your own admin role");
      }
      await api.toggleRole(id, role, on);
    },
    onSuccess: () => {
      toast.success("Roles updated");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="mt-4 space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <p className="font-medium">Assign a role by email</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Use a full <span className="font-mono">@thapar.edu</span> address. If the person has not
          signed in yet, the account is created now and keeps this role when they register.
        </p>
        <RoleAssignForm className="mt-3" />
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Roles</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.map((u) => (
              <tr key={u.id} className="border-t align-top">
                <td className="p-3">
                  {u.name}
                  <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map((item) => {
                      const on = u.roles.includes(item);
                      return (
                        <button
                          key={item}
                          onClick={() => toggle.mutate({ id: u.id, role: item, on: !on })}
                          aria-pressed={on}
                          className={
                            on
                              ? "rounded-full border border-foreground bg-foreground px-3 py-1 text-xs text-background"
                              : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                          }
                        >
                          {ROLE_LABEL[item]}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
            {q.data?.length === 0 && (
              <tr>
                <td colSpan={2} className="p-6 text-center text-muted-foreground">
                  No accounts yet. Assign a role above to pre-create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
