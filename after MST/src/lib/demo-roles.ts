import type { DemoAccount } from "@/lib/demo-accounts";
import type { AppRole } from "@/lib/status";

/**
 * Demo accounts live entirely in the browser. The DoAA/DoSAA dashboard can
 * still assign roles locally: the assignment is stored here and applied the
 * next time that demo email is used.
 */
export const DEMO_ROLES_KEY = "rst.demo.roles.v1";
export const DEMO_ROLES_EVENT = "rst:demo-roles";

export interface DemoRoleAssignment {
  email: string;
  role: AppRole;
  name?: string;
  assignedAt: string;
}

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function normalizeDemoEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function loadDemoRoleAssignments(): Record<string, DemoRoleAssignment> {
  if (!canStore()) return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEMO_ROLES_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, DemoRoleAssignment>;
  } catch {
    return {};
  }
}

export function assignDemoRole(email: string, role: AppRole, name = ""): DemoRoleAssignment {
  const clean = normalizeDemoEmail(email);
  const assignment: DemoRoleAssignment = {
    email: clean,
    role,
    ...(name.trim() ? { name: name.trim() } : {}),
    assignedAt: new Date().toISOString(),
  };
  if (canStore()) {
    const all = loadDemoRoleAssignments();
    all[clean] = assignment;
    window.localStorage.setItem(DEMO_ROLES_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(DEMO_ROLES_EVENT));
  }
  return assignment;
}

export function clearDemoRoleAssignments(): void {
  if (!canStore()) return;
  window.localStorage.removeItem(DEMO_ROLES_KEY);
  window.dispatchEvent(new CustomEvent(DEMO_ROLES_EVENT));
}

export function demoEffectiveRole(account: DemoAccount): AppRole {
  return loadDemoRoleAssignments()[normalizeDemoEmail(account.email)]?.role ?? account.role;
}

/** Roles the demo account should expose to the rest of the UI. */
export function demoRolesForAccount(account: DemoAccount): AppRole[] {
  const assigned = loadDemoRoleAssignments()[normalizeDemoEmail(account.email)];
  if (!assigned) return [account.role];
  return assigned.role === "student" ? ["student"] : ["student", assigned.role];
}
