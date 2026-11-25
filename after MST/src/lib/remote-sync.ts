import {
  api,
  getToken,
  type ApiAnnouncement,
  type ApiChatMessage,
  type ApiTimetableEntry,
} from "@/lib/api";
import { loadAnnouncements, saveAnnouncements, type Announcement } from "@/lib/announcements";
import { CHAT_CHANNELS, loadMessages, saveMessages, type ChatMessage } from "@/lib/chat";
import { loadDemoAccount } from "@/lib/demo";
import { saveTimetable, type TimetableEntry, type Weekday } from "@/lib/timetable";
import type { AppRole } from "@/lib/status";

const STAFF_ROLES: AppRole[] = ["cr", "teacher", "admin"];

export function isRemoteSession(): boolean {
  return typeof window !== "undefined" && !loadDemoAccount() && !!getToken();
}

function toTimetableEntry(entry: ApiTimetableEntry): TimetableEntry {
  return {
    id: entry.id,
    day: entry.day as Weekday,
    start: entry.start,
    end: entry.end,
    subject: entry.subject,
    room: entry.room,
    className: entry.className,
    teacher: entry.teacher,
  };
}

function toAnnouncement(item: ApiAnnouncement): Announcement {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    category: item.category,
    audience: item.audience,
    authorName: item.authorName,
    authorRole: item.authorRole,
    authorEmail: item.authorEmail,
    createdAt: item.createdAt,
    ...(item.room ? { room: item.room } : {}),
    ...(item.className ? { className: item.className } : {}),
    pinned: item.pinned,
    source: item.source,
  };
}

function toMessage(item: ApiChatMessage): ChatMessage {
  return {
    id: item.id,
    channel: item.channel,
    senderId: item.senderId,
    senderName: item.senderName,
    senderRole: item.senderRole,
    body: item.body,
    at: item.at,
    kind: item.kind,
  };
}

function isStaff(roles: AppRole[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

function warn(label: string, error: unknown): void {
  console.warn(`[remote-sync] ${label} failed`, error);
}

// --- hydration (write local caches only, never push) -----------------------

export async function hydrateTimetable(): Promise<void> {
  try {
    const data = await api.getTimetable();
    saveTimetable(data.entries.map(toTimetableEntry));
  } catch (error) {
    warn("timetable", error);
  }
}

export async function hydrateAnnouncements(): Promise<void> {
  try {
    const items = await api.listAnnouncements();
    saveAnnouncements(items.map(toAnnouncement));
  } catch (error) {
    warn("announcements", error);
  }
}

export async function hydrateChatChannel(channel: string): Promise<void> {
  try {
    const items = await api.listChatMessages(channel);
    saveMessages(channel, items.map(toMessage));
  } catch (error) {
    warn(`chat:${channel}`, error);
  }
}

export async function hydrateChat(): Promise<void> {
  await Promise.allSettled(CHAT_CHANNELS.map((channel) => hydrateChatChannel(channel.id)));
}

export async function hydrateRemote(roles: AppRole[]): Promise<void> {
  if (!isRemoteSession()) return;
  const tasks = [hydrateTimetable(), hydrateAnnouncements()];
  if (isStaff(roles)) {
    tasks.push(hydrateChat());
  }
  await Promise.allSettled(tasks);
}

// --- pushes ----------------------------------------------------------------

export async function pushTimetableReplace(entries: TimetableEntry[]): Promise<void> {
  try {
    const data = await api.replaceTimetable(
      entries.map((entry) => ({
        day: entry.day,
        start: entry.start,
        end: entry.end,
        subject: entry.subject,
        room: entry.room,
        className: entry.className,
        teacher: entry.teacher,
      })),
    );
    saveTimetable(data.entries.map(toTimetableEntry));
  } catch (error) {
    warn("replace timetable", error);
    await hydrateTimetable();
  }
}

export async function pushTimetablePatch(
  id: string,
  patch: Partial<Omit<TimetableEntry, "id">>,
): Promise<void> {
  try {
    await api.patchTimetableEntry(id, patch);
  } catch (error) {
    warn("move class", error);
    await hydrateTimetable();
  }
}

export async function pushTimetableDelete(id: string): Promise<void> {
  try {
    await api.deleteTimetableEntry(id);
  } catch (error) {
    warn("cancel class", error);
    await hydrateTimetable();
  }
}

export async function restoreRemoteTimetable(): Promise<void> {
  try {
    const data = await api.restoreTimetable();
    saveTimetable(data.entries.map(toTimetableEntry));
  } catch (error) {
    warn("restore timetable", error);
    await hydrateTimetable();
  }
}

export async function pushAnnouncement(item: Announcement): Promise<void> {
  try {
    const created = await api.createAnnouncement({
      title: item.title,
      body: item.body,
      category: item.category,
      audience: item.audience,
      pinned: item.pinned ?? false,
      ...(item.room ? { room: item.room } : {}),
      ...(item.className ? { className: item.className } : {}),
      source: item.source,
    });
    const server = toAnnouncement(created);
    saveAnnouncements(
      loadAnnouncements().map((current) => (current.id === item.id ? server : current)),
    );
  } catch (error) {
    warn("announcement", error);
    await hydrateAnnouncements();
  }
}

export async function pushChatMessage(message: ChatMessage): Promise<void> {
  try {
    const created = toMessage(await api.postChatMessage(message.channel, message.body));
    const merged = loadMessages(message.channel)
      .filter((item) => item.id !== message.id && item.id !== created.id)
      .concat(created)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    saveMessages(message.channel, merged);
  } catch (error) {
    warn("chat message", error);
    await hydrateChatChannel(message.channel);
  }
}

export async function clearRemoteMessages(channel: string): Promise<void> {
  try {
    await api.clearChatMessages(channel);
    saveMessages(channel, []);
  } catch (error) {
    warn("clear chat", error);
    await hydrateChatChannel(channel);
  }
}

export async function refreshChatChannel(channel: string): Promise<void> {
  if (!isRemoteSession()) return;
  await hydrateChatChannel(channel);
}
