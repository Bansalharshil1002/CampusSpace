import type { AppRole, RoomStatus, RoomType } from "@/lib/status";

const TOKEN_KEY = "rst_access_token";
export const AUTH_EVENT = "rst-auth";

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: { name?: string };
};

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
  roles: AppRole[];
};

export type ApiRoom = {
  id: string;
  code: string;
  building: string;
  floor: number;
  capacity: number | null;
  room_type: RoomType;
  active: boolean;
  current_status: RoomStatus;
  status_note: string | null;
  status_updated_at: string;
  status_updated_by_name: string | null;
  created_at: string;
};

export type ApiAssignment = {
  id: string;
  active: boolean;
  created_at: string;
  room_id: string;
  user_id: string;
  rooms: { code: string | null; room_type: RoomType | null };
  user: { name: string | null; email: string | null };
};

export type ApiHistory = {
  id: string;
  status: RoomStatus;
  note: string | null;
  created_at: string;
  room_id: string;
  rooms: { code: string } | null;
  profiles: { name: string | null; email: string | null } | null;
};

export type ApiTimetableEntry = {
  id: string;
  day: number;
  start: string;
  end: string;
  subject: string;
  room: string;
  className: string;
  teacher: string;
};

export type ApiTimetable = {
  entries: ApiTimetableEntry[];
  scope: "campus" | "personal";
};

export type ApiAnnouncement = {
  id: string;
  title: string;
  body: string;
  category: "schedule" | "room" | "general" | "urgent";
  audience: "all" | "students" | "staff";
  authorName: string;
  authorRole: AppRole;
  authorEmail: string;
  createdAt: string;
  room?: string | null;
  className?: string | null;
  pinned: boolean;
  source: "manual" | "room" | "timetable";
};

export type ApiChatMessage = {
  id: string;
  channel: string;
  senderId: string;
  senderName: string;
  senderRole: AppRole | "assistant";
  body: string;
  at: string;
  kind: "user" | "assistant" | "system";
};

export type ApiChallenge = {
  ok: boolean;
  message: string;
  dev_code?: string | null;
  dev_token?: string | null;
  magic_url?: string | null;
};

function apiBase(): string {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  const fromEnv = env["VITE_API_URL"]?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  // Local development only. Production builds that forget VITE_API_URL call
  // the same origin instead of a visitor's localhost.
  return import.meta.env.DEV ? "http://localhost:8000" : "";
}

export function getToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string | null) {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function toUser(profile: ApiUser): AuthUser {
  return {
    id: profile.id,
    email: profile.email,
    user_metadata: { name: profile.name },
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(
      import.meta.env.DEV
        ? `Can't reach the campus backend at ${apiBase()}. Start it with "npm run backend", then try again.`
        : "Can't reach the campus backend right now. Please try again later.",
    );
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { detail: text };
    }
  }
  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => (item as { msg?: string }).msg ?? JSON.stringify(item)).join("; ")
          : res.statusText;
    throw new Error(message || "Request failed");
  }
  return body as T;
}

function persistSession(data: { access_token: string; user: ApiUser }) {
  setToken(data.access_token);
  return { user: toUser(data.user), profile: data.user };
}

export const api = {
  register(input: { name: string; email: string; password: string }) {
    return request<{ access_token: string; user: ApiUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }).then(persistSession);
  },
  login(input: { email: string; password: string }) {
    return request<{ access_token: string; user: ApiUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }).then(persistSession);
  },
  async me(): Promise<{ user: AuthUser; profile: ApiUser } | null> {
    if (!getToken()) return null;
    try {
      const profile = await request<ApiUser>("/auth/me");
      return { user: toUser(profile), profile };
    } catch {
      setToken(null);
      return null;
    }
  },
  signOut() {
    setToken(null);
  },
  updateProfile(name: string) {
    return request<ApiUser>("/auth/me", { method: "PATCH", body: JSON.stringify({ name }) });
  },
  changePassword(password: string) {
    return request("/auth/change-password", { method: "POST", body: JSON.stringify({ password }) });
  },
  forgotPassword(email: string) {
    return request<ApiChallenge>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  resetPassword(input: { email: string; token: string; password: string }) {
    return request<{ ok: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  requestMagic(email: string) {
    return request<ApiChallenge>("/auth/magic/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  verifyMagic(token: string) {
    return request<{ access_token: string; user: ApiUser }>("/auth/magic/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }).then(persistSession);
  },
  requestOtp(email: string) {
    return request<ApiChallenge>("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  verifyOtp(input: { email: string; code: string }) {
    return request<{ access_token: string; user: ApiUser }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify(input),
    }).then(persistSession);
  },
  listRooms(active?: boolean) {
    const q = active === undefined ? "" : `?active=${active}`;
    return request<ApiRoom[]>(`/rooms${q}`);
  },
  updatableRoomIds() {
    return request<string[]>("/rooms/updatable");
  },
  canUpdate(roomId: string) {
    return request<{ allowed: boolean }>(`/rooms/${roomId}/can-update`);
  },
  setRoomStatus(roomId: string, status: RoomStatus, note?: string) {
    return request<ApiRoom>(`/rooms/${roomId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note: note || null }),
    });
  },
  createRoom(input: {
    code: string;
    building: string;
    floor: number;
    capacity: number | null;
    room_type: RoomType;
  }) {
    return request<ApiRoom>("/rooms", { method: "POST", body: JSON.stringify(input) });
  },
  patchRoom(id: string, patch: Partial<Pick<ApiRoom, "active" | "code" | "building" | "floor">>) {
    return request<ApiRoom>(`/rooms/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  seedRooms() {
    return request<{ added: number }>("/rooms/seed", { method: "POST" });
  },
  listAssignments() {
    return request<ApiAssignment[]>("/assignments");
  },
  assignRoom(email: string, roomId: string) {
    return request<ApiAssignment>("/assignments", {
      method: "POST",
      body: JSON.stringify({ email, room_id: roomId }),
    });
  },
  patchAssignment(id: string, active: boolean) {
    return request<ApiAssignment>(`/assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    });
  },
  roomHistory(roomId: string) {
    return request<ApiHistory[]>(`/rooms/${roomId}/history`);
  },
  allHistory() {
    return request<ApiHistory[]>("/history");
  },
  listUsers() {
    return request<ApiUser[]>("/users");
  },
  listStaff() {
    return request<ApiUser[]>("/users/staff");
  },
  assignRole(email: string, role: AppRole, name = "") {
    return request<ApiUser>("/users/assign-role", {
      method: "POST",
      body: JSON.stringify({ email, role, name }),
    });
  },
  toggleRole(userId: string, role: AppRole, on: boolean) {
    return request<ApiUser>(`/users/${userId}/roles`, {
      method: "POST",
      body: JSON.stringify({ role, on }),
    });
  },
  getTimetable() {
    return request<ApiTimetable>("/timetable");
  },
  replaceTimetable(entries: Omit<ApiTimetableEntry, "id">[]) {
    return request<ApiTimetable>("/timetable", {
      method: "PUT",
      body: JSON.stringify({ entries }),
    });
  },
  patchTimetableEntry(id: string, patch: Partial<Omit<ApiTimetableEntry, "id">>) {
    return request<ApiTimetableEntry>(`/timetable/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  deleteTimetableEntry(id: string) {
    return request<{ ok: boolean; id: string }>(`/timetable/${id}`, { method: "DELETE" });
  },
  restoreTimetable() {
    return request<ApiTimetable>("/timetable/restore", { method: "POST" });
  },
  listAnnouncements() {
    return request<ApiAnnouncement[]>("/announcements");
  },
  createAnnouncement(input: {
    title: string;
    body: string;
    category: string;
    audience: string;
    pinned?: boolean;
    room?: string;
    className?: string;
    source?: string;
  }) {
    return request<ApiAnnouncement>("/announcements", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listChatMessages(channel: string) {
    return request<ApiChatMessage[]>(`/chat/messages?channel=${encodeURIComponent(channel)}`);
  },
  postChatMessage(channel: string, body: string) {
    return request<ApiChatMessage>("/chat/messages", {
      method: "POST",
      body: JSON.stringify({ channel, body, kind: "user" }),
    });
  },
  clearChatMessages(channel: string) {
    return request<{ channel: string; cleared: number }>(
      `/chat/messages?channel=${encodeURIComponent(channel)}`,
      { method: "DELETE" },
    );
  },
};
