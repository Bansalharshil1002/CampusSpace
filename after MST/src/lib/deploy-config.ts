import type { AppRole } from "@/lib/status";

type AuthMode = "full" | "password";

function envValue(key: string): string | undefined {
  const value = (import.meta.env as unknown as Record<string, string | undefined>)[key];
  return value?.trim() || undefined;
}

function envBool(key: string, fallback: boolean): boolean {
  const value = envValue(key);
  if (value === undefined) return fallback;
  return !["false", "0", "no", "off"].includes(value.toLowerCase());
}

/**
 * Controlled demo defaults to password-only auth and hidden public signup.
 * Local development keeps the full auth flows unless VITE_AUTH_MODE is set.
 */
export const authMode: AuthMode = envValue("VITE_AUTH_MODE") === "full" ? "full" : "password";
export const allowEmailAuth = envBool("VITE_ALLOW_EMAIL_AUTH", authMode === "full");
export const allowRegistration = envBool("VITE_ALLOW_REGISTRATION", authMode === "full");
export const showLocalDemo = envBool("VITE_SHOW_LOCAL_DEMO", true);

/** Production shows staff preview roles only; students sign in for real. */
const defaultDemoRoles = import.meta.env.PROD ? "cr,teacher,admin" : "student,cr,teacher,admin";
export const demoRoles = (envValue("VITE_DEMO_ROLES") ?? defaultDemoRoles)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean) as AppRole[];

export const deploymentMode =
  envValue("VITE_DEPLOYMENT_MODE") ?? (import.meta.env.PROD ? "controlled-demo" : "development");
export const deploymentNotice =
  envValue("VITE_DEPLOY_NOTICE") ??
  (import.meta.env.PROD
    ? "Controlled demo — students sign in with a real account. Staff roles are browser-local previews."
    : "");
