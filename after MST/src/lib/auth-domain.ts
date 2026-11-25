export const ALLOWED_EMAIL_DOMAIN = "thapar.edu";

/** Returns an error message, or null when the email may sign in. Backend enforces the same rule. */
export function emailError(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255)
    return "Enter a valid email address.";
  if (email.split("@")[1] !== ALLOWED_EMAIL_DOMAIN)
    return `Only @${ALLOWED_EMAIL_DOMAIN} college email addresses can sign in.`;
  return null;
}
