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
export const deploymentMode =
  envValue("VITE_DEPLOYMENT_MODE") ?? (import.meta.env.PROD ? "controlled-demo" : "development");
export const deploymentNotice =
  envValue("VITE_DEPLOY_NOTICE") ??
  (import.meta.env.PROD
    ? "Controlled demo — real accounts use a shared hosted database. Local demo roles stay in this browser."
    : "");
