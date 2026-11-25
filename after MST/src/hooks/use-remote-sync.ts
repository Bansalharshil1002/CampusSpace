import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { hydrateRemote, isRemoteSession } from "@/lib/remote-sync";
import type { AppRole } from "@/lib/status";

/**
 * Keeps the localStorage caches in step with the FastAPI backend for real
 * sessions. Demo accounts stay entirely local, so they never reach this hook.
 */
export function useRemoteSync(): void {
  const { ready, roles, isDemo } = useAuth();
  const roleKey = roles.join(",");

  useEffect(() => {
    if (!ready || isDemo || !isRemoteSession()) return;
    const list = roleKey ? (roleKey.split(",") as AppRole[]) : [];
    let cancelled = false;

    const run = () => {
      if (!cancelled) void hydrateRemote(list);
    };

    run();
    window.addEventListener("focus", run);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", run);
    };
  }, [ready, isDemo, roleKey]);
}
