import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useAnnouncements } from "@/hooks/use-announcements";
import { Button } from "@/components/ui/button";
import { clearDemoSession } from "@/lib/demo";
import { deploymentNotice } from "@/lib/deploy-config";
import { ROLE_LABEL, primaryRole } from "@/lib/status";

export function SiteHeader() {
  const { user, roles, isDemo } = useAuth();
  const { unread } = useAnnouncements();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const top = primaryRole(roles);
  const isStudent = top === "student";

  async function signOut() {
    clearDemoSession();
    await qc.cancelQueries();
    qc.clear();
    api.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-ink/20 bg-ink text-ink-foreground">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded bg-accent font-mono text-xs text-accent-foreground">
            RS
          </span>
          Room Status
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
          <Link
            to="/"
            className="shrink-0 rounded px-2.5 py-1.5 opacity-80 hover:opacity-100 sm:px-3"
            activeProps={{ className: "bg-ink-foreground/10 opacity-100" }}
            activeOptions={{ exact: true }}
          >
            Dashboard
          </Link>
          {user && (
            <>
              {top !== "admin" && (
                <Link
                  to="/timetable"
                  className="shrink-0 rounded px-2.5 py-1.5 opacity-80 hover:opacity-100 sm:px-3"
                  activeProps={{ className: "bg-ink-foreground/10 opacity-100" }}
                >
                  Timetable
                </Link>
              )}
              {top === "admin" && (
                <Link
                  to="/classes"
                  className="shrink-0 rounded px-2.5 py-1.5 opacity-80 hover:opacity-100 sm:px-3"
                  activeProps={{ className: "bg-ink-foreground/10 opacity-100" }}
                >
                  Classes
                </Link>
              )}
              <Link
                to="/announcements"
                className="relative shrink-0 rounded px-2.5 py-1.5 opacity-80 hover:opacity-100 sm:px-3"
                activeProps={{ className: "bg-ink-foreground/10 opacity-100" }}
              >
                Announcements
                {unread.length > 0 && (
                  <span className="ml-1.5 inline-grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-accent-foreground">
                    {unread.length}
                  </span>
                )}
              </Link>
              <Link
                to="/assistant"
                className="shrink-0 rounded px-2.5 py-1.5 opacity-80 hover:opacity-100 sm:px-3"
                activeProps={{ className: "bg-ink-foreground/10 opacity-100" }}
              >
                AI Assistant
              </Link>
              {!isStudent && (
                <Link
                  to="/chat"
                  className="shrink-0 rounded px-2.5 py-1.5 opacity-80 hover:opacity-100 sm:px-3"
                  activeProps={{ className: "bg-ink-foreground/10 opacity-100" }}
                >
                  Messages
                </Link>
              )}
              {top && top !== "student" && !isDemo && (
                <Link
                  to="/manage"
                  className="shrink-0 rounded px-2.5 py-1.5 opacity-80 hover:opacity-100 sm:px-3"
                  activeProps={{ className: "bg-ink-foreground/10 opacity-100" }}
                >
                  Manage
                </Link>
              )}
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link
                to="/account"
                className="hidden text-right leading-tight hover:opacity-80 sm:block"
              >
                <span className="block text-xs opacity-60">
                  {top ? ROLE_LABEL[top] : "Signed in"}
                  {isDemo ? " · demo" : ""}
                </span>
                <span className="block font-mono text-xs">{user.email}</span>
              </Link>
              <Button size="sm" variant="secondary" onClick={signOut}>
                {isDemo ? "Exit demo" : "Sign out"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              asChild
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
      {deploymentNotice && (
        <div className="border-t border-ink-foreground/10 bg-accent/10 px-4 py-1.5 text-center text-[11px] text-accent">
          {deploymentNotice}
        </div>
      )}
    </header>
  );
}
