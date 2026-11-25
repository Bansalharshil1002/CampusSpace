import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AUTH_EVENT, api, type AuthUser } from "@/lib/api";
import { DEMO_EVENT, loadDemoAccount, type DemoAccount } from "@/lib/demo";
import { DEMO_ROLES_EVENT, demoRolesForAccount } from "@/lib/demo-roles";
import { ensureDemoData } from "@/lib/seed";
import type { AppRole } from "@/lib/status";

function demoUser(account: DemoAccount): AuthUser {
  return {
    id: account.id,
    email: account.email,
    user_metadata: { name: account.name },
  };
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [ready, setReady] = useState(() => !!loadDemoAccount());
  const [demo, setDemo] = useState<DemoAccount | null>(() => loadDemoAccount());
  const [demoRoles, setDemoRoles] = useState<AppRole[]>(() => {
    const account = loadDemoAccount();
    return account ? demoRolesForAccount(account) : [];
  });

  useEffect(() => {
    const boot = loadDemoAccount();
    if (boot) ensureDemoData();
    setDemo(boot);
    setDemoRoles(boot ? demoRolesForAccount(boot) : []);

    let cancelled = false;
    const load = async () => {
      if (loadDemoAccount()) {
        if (!cancelled) setReady(true);
        return;
      }
      const session = await api.me();
      if (cancelled) return;
      setUser(session?.user ?? null);
      setRoles(session?.profile.roles ?? []);
      setReady(true);
    };
    void load();

    const onAuth = () => {
      void load();
    };
    const refreshDemo = () => {
      const account = loadDemoAccount();
      if (account) ensureDemoData();
      setDemo(account);
      setDemoRoles(account ? demoRolesForAccount(account) : []);
      if (account) {
        setUser(null);
        setRoles([]);
        setReady(true);
      } else {
        void load();
      }
    };
    const refreshDemoRoles = () => {
      const account = loadDemoAccount();
      if (account) setDemoRoles(demoRolesForAccount(account));
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener(DEMO_EVENT, refreshDemo);
    window.addEventListener(DEMO_ROLES_EVENT, refreshDemoRoles);
    window.addEventListener("storage", refreshDemo);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener(DEMO_EVENT, refreshDemo);
      window.removeEventListener(DEMO_ROLES_EVENT, refreshDemoRoles);
      window.removeEventListener("storage", refreshDemo);
    };
  }, []);

  const rolesQ = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user && !demo,
    queryFn: async () => {
      const session = await api.me();
      return session?.profile.roles ?? [];
    },
  });

  const liveRoles = demo ? demoRoles : (rolesQ.data ?? roles);
  return {
    user: demo ? demoUser(demo) : user,
    ready: ready || !!demo,
    roles: liveRoles,
    isDemo: !!demo,
    demoAccount: demo,
    has: (r: AppRole) => liveRoles.includes(r),
    hasAny: (rs: AppRole[]) => rs.some((r) => liveRoles.includes(r)),
  };
}
