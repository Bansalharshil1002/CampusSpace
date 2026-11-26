import { demoRoles } from "@/lib/deploy-config";
import { roomMatches } from "@/lib/rooms";
import type { AppRole, RoomStatus } from "@/lib/status";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/lib/demo-accounts";
import { ensureDemoData } from "@/lib/seed";

export { DEMO_ACCOUNTS };
export type { DemoAccount };

export const DEMO_SESSION_KEY = "rst.demo.session.v1";
export const DEMO_EVENT = "rst:demo";
export const DEMO_OVERRIDES_KEY = "rst.demo.rooms.v1";
export const DEMO_OVERRIDES_EVENT = "rst:demo-rooms";

export interface DemoRoomOverride {
  status: RoomStatus;
  note: string;
  updatedAt: string;
  by: string;
}

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function findDemoAccount(email: string, password: string): DemoAccount | null {
  const clean = email.trim().toLowerCase();
  return (
    DEMO_ACCOUNTS.find(
      (account) => account.email.toLowerCase() === clean && account.password === password,
    ) ?? null
  );
}

export function findDemoAccountByEmail(email: string): DemoAccount | null {
  const clean = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.email.toLowerCase() === clean) ?? null;
}

/** Accept role names, email prefixes, ids and full emails for `?demo=` links. */
export function findDemoAccountByKey(value: string): DemoAccount | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  const byEmail = findDemoAccountByEmail(key);
  const byPrefix = DEMO_ACCOUNTS.find(
    (account) =>
      account.email.split("@")[0]?.toLowerCase() === key || account.id.toLowerCase() === key,
  );
  const byId = DEMO_ACCOUNTS.find((account) => account.id.toLowerCase() === `demo-${key}`);
  const byRole = DEMO_ACCOUNTS.find((account) => account.role === (key as AppRole));
  return byEmail ?? byPrefix ?? byId ?? byRole ?? null;
}

export function isDemoRoleVisible(role: AppRole): boolean {
  return demoRoles.includes(role);
}

export function findVisibleDemoAccount(email: string, password: string): DemoAccount | null {
  const account = findDemoAccount(email, password);
  return account && isDemoRoleVisible(account.role) ? account : null;
}

export function visibleDemoAccounts(): DemoAccount[] {
  return DEMO_ACCOUNTS.filter((account) => isDemoRoleVisible(account.role));
}

/** `?demo=` links must honour the deployed role allowlist. */
export function findVisibleDemoAccountByKey(value: string): DemoAccount | null {
  const account = findDemoAccountByKey(value);
  return account && isDemoRoleVisible(account.role) ? account : null;
}

export function isDemoEmail(email: string): boolean {
  return findDemoAccountByEmail(email) !== null;
}

export function loadDemoAccount(): DemoAccount | null {
  if (!canStore()) return null;
  const email = window.localStorage.getItem(DEMO_SESSION_KEY);
  if (!email) return null;
  return (
    DEMO_ACCOUNTS.find((account) => account.email.toLowerCase() === email.toLowerCase()) ?? null
  );
}

export function startDemoSession(account: DemoAccount): void {
  if (!canStore()) return;
  window.localStorage.setItem(DEMO_SESSION_KEY, account.email);
  ensureDemoData();
  window.dispatchEvent(new CustomEvent(DEMO_EVENT));
}

export function clearDemoSession(): void {
  if (!canStore()) return;
  window.localStorage.removeItem(DEMO_SESSION_KEY);
  window.dispatchEvent(new CustomEvent(DEMO_EVENT));
}

/** Drop stale demo sessions whose role is hidden in this deployment. */
export function loadVisibleDemoAccount(): DemoAccount | null {
  const account = loadDemoAccount();
  if (!account) return null;
  if (!isDemoRoleVisible(account.role)) {
    clearDemoSession();
    return null;
  }
  return account;
}

export function demoCanUpdate(account: DemoAccount | null, roomCode: string): boolean {
  if (!account) return false;
  return account.roomCodes.some((code) => code === "*" || roomMatches(code, roomCode));
}

export function loadDemoOverrides(): Record<string, DemoRoomOverride> {
  if (!canStore()) return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEMO_OVERRIDES_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, DemoRoomOverride>;
  } catch {
    return {};
  }
}

export function saveDemoOverride(roomCode: string, override: DemoRoomOverride): void {
  if (!canStore()) return;
  const all = loadDemoOverrides();
  all[roomCode] = override;
  window.localStorage.setItem(DEMO_OVERRIDES_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent(DEMO_OVERRIDES_EVENT));
}
