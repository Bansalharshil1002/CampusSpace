import type { AppRole } from "@/lib/status";

export type ChatMessageKind = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  channel: string;
  senderId: string;
  senderName: string;
  senderRole: AppRole | "assistant";
  body: string;
  at: string;
  kind: ChatMessageKind;
}

export interface ChatChannel {
  id: string;
  label: string;
  description: string;
  staffOnly: boolean;
  roles: AppRole[];
  kind: "group" | "dm";
}

export const STAFF_ROLES: AppRole[] = ["cr", "teacher", "admin"];

export const CHAT_CHANNELS: ChatChannel[] = [
  {
    id: "staff",
    label: "Staff room",
    description: "The main coordination room for CRs, teachers and DoAA/DoSAA.",
    staffOnly: true,
    roles: STAFF_ROLES,
    kind: "group",
  },
  {
    id: "cr-teachers",
    label: "CR ↔ Teachers",
    description: "Class-level requests: room changes, syllabus and lab coordination.",
    staffOnly: true,
    roles: STAFF_ROLES,
    kind: "group",
  },
  {
    id: "office",
    label: "DoAA / DoSAA office",
    description: "Escalate room clashes, maintenance and approval requests to the office.",
    staffOnly: true,
    roles: STAFF_ROLES,
    kind: "group",
  },
  {
    id: "general",
    label: "General",
    description: "Open channel for everyone signed in — questions and campus notices.",
    staffOnly: false,
    roles: ["student", "cr", "teacher", "admin"],
    kind: "group",
  },
];

const CHAT_PREFIX = "rst.chat.v1.";
export const CHAT_EVENT = "rst:chat";
export const CHAT_BROADCAST = "rst-chat";
const MAX_MESSAGES = 250;

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function chatKey(channel: string): string {
  return `${CHAT_PREFIX}${channel}`;
}

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.channel === "string" &&
    typeof message.senderId === "string" &&
    typeof message.senderName === "string" &&
    typeof message.senderRole === "string" &&
    typeof message.body === "string" &&
    typeof message.at === "string" &&
    (message.kind === "user" || message.kind === "assistant" || message.kind === "system")
  );
}

export function loadMessages(channel: string): ChatMessage[] {
  if (!canStore()) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(chatKey(channel)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isChatMessage) : [];
  } catch {
    return [];
  }
}

function broadcast(channel: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_EVENT, { detail: { channel } }));
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(CHAT_BROADCAST);
      bc.postMessage({ channel });
      bc.close();
    } catch {
      // BroadcastChannel is optional; localStorage storage events still reach other tabs.
    }
  }
}

export function saveMessages(channel: string, messages: ChatMessage[]): void {
  if (!canStore()) return;
  window.localStorage.setItem(chatKey(channel), JSON.stringify(messages.slice(-MAX_MESSAGES)));
  broadcast(channel);
}

export function appendMessage(channel: string, message: ChatMessage): ChatMessage[] {
  const next = [...loadMessages(channel), message].slice(-MAX_MESSAGES);
  saveMessages(channel, next);
  return next;
}

export function clearMessages(channel: string): void {
  if (!canStore()) return;
  window.localStorage.removeItem(chatKey(channel));
  broadcast(channel);
}

export function seedMessages(channel: string, messages: ChatMessage[]): void {
  if (!canStore()) return;
  if (window.localStorage.getItem(chatKey(channel)) !== null) return;
  saveMessages(channel, messages);
}

export function newMessage(
  channel: string,
  sender: { id: string; name: string; role: AppRole | "assistant" },
  body: string,
  kind: ChatMessageKind = "user",
): ChatMessage {
  return {
    id: makeId(),
    channel,
    senderId: sender.id,
    senderName: sender.name,
    senderRole: sender.role,
    body,
    at: new Date().toISOString(),
    kind,
  };
}

export function canUseChannel(channel: ChatChannel, roles: AppRole[]): boolean {
  return roles.some((role) => channel.roles.includes(role));
}

export function canPost(channel: ChatChannel, roles: AppRole[]): boolean {
  return canUseChannel(channel, roles);
}

export function visibleChannels(roles: AppRole[]): ChatChannel[] {
  return CHAT_CHANNELS.filter((channel) => canUseChannel(channel, roles));
}

const STAFF_ROLE_LABEL: Record<string, string> = {
  cr: "CR",
  teacher: "Teacher",
  admin: "DoAA/DoSAA",
};

export function staffRoleLabel(role: AppRole): string {
  return STAFF_ROLE_LABEL[role] ?? role;
}

/** Stable id for a direct conversation between two college emails. */
export function dmChannelId(emailA: string, emailB: string): string {
  const pair = [emailA.trim().toLowerCase(), emailB.trim().toLowerCase()].sort();
  return `dm:${pair[0]}|${pair[1]}`;
}

export function dmPartner(channel: string, selfEmail: string): string | null {
  if (!channel.startsWith("dm:")) return null;
  const [a, b] = channel.slice(3).split("|");
  const self = selfEmail.trim().toLowerCase();
  if (a === self) return b ?? null;
  if (b === self) return a ?? null;
  return a ?? null;
}

export function isDmChannel(channel: string): boolean {
  return channel.startsWith("dm:");
}

/**
 * Personal messages are limited to teacher ↔ CR and teacher ↔ DoAA/DoSAA.
 * CRs cannot DM other CRs or the office, and teachers cannot DM each other.
 */
const DM_PAIRS: ReadonlyArray<readonly [AppRole, AppRole]> = [
  ["teacher", "cr"],
  ["teacher", "admin"],
];

export function canDirectMessage(
  roleA: AppRole | null | undefined,
  roleB: AppRole | null | undefined,
): boolean {
  if (!roleA || !roleB) return false;
  return DM_PAIRS.some(
    ([pairA, pairB]) =>
      (roleA === pairA && roleB === pairB) || (roleA === pairB && roleB === pairA),
  );
}

export { assistantReply } from "@/lib/assistant";
