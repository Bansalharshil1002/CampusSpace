import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { clearDemoSession } from "@/lib/demo";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — Room Status Tracker" },
      { name: "description", content: "Your roles and password." },
      { property: "og:title", content: "Account — Room Status Tracker" },
      { property: "og:description", content: "Your roles and password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user, roles, ready, isDemo, demoAccount } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user && !isDemo,
    queryFn: async () => {
      const session = await api.me();
      if (!session) return null;
      return session.profile;
    },
  });

  useEffect(() => {
    if (isDemo && demoAccount) {
      setName(demoAccount.name);
      return;
    }
    if (profileQ.data?.name) setName(profileQ.data.name);
  }, [profileQ.data?.name, isDemo, demoAccount]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim() || isDemo) return;
    setSavingName(true);
    try {
      await api.updateProfile(name.trim());
    } catch (error) {
      setSavingName(false);
      toast.error(error instanceof Error ? error.message : "Could not save name");
      return;
    }
    setSavingName(false);
    toast.success("Name updated");
    void profileQ.refetch();
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(password);
    } catch (error) {
      setSavingPassword(false);
      toast.error(error instanceof Error ? error.message : "Could not update password");
      return;
    }
    setSavingPassword(false);
    setPassword("");
    setConfirm("");
    toast.success("Password updated");
  }

  async function signOut() {
    clearDemoSession();
    api.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  if (!ready) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-10 text-muted-foreground">Loading account…</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Profile
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold">
          <UserRound className="h-6 w-6" /> Account
        </h1>
        <p className="mt-1 break-all text-sm text-muted-foreground">{user?.email}</p>
        {isDemo && (
          <p className="mt-3 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            Demo mode — profile and password changes are disabled. Exit demo from the header to use
            a real account.
          </p>
        )}

        <section className="mt-6 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4" /> Roles
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {roles.length === 0 && (
              <span className="text-sm text-muted-foreground">No roles assigned yet.</span>
            )}
            {roles.map((role) => (
              <span
                key={role}
                className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium"
              >
                {ROLE_LABEL[role]}
              </span>
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {roles.map((role) => (
              <li key={role}>• {ROLE_HINT[role]}</li>
            ))}
          </ul>
        </section>

        <section className="mt-4 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold">Display name</h2>
          <form onSubmit={saveName} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="display-name">Name</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <Button type="submit" disabled={isDemo || savingName || !name.trim()}>
              {savingName ? "Saving…" : "Save"}
            </Button>
          </form>
        </section>

        <section className="mt-4 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4" /> Password
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isDemo
              ? "Password changes are disabled for demo accounts."
              : "Change the password you use to sign in."}
          </p>
          {!isDemo && (
            <form onSubmit={savePassword} className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={savingPassword || password.length < 8}>
                  {savingPassword ? "Saving…" : "Set password"}
                </Button>
              </div>
            </form>
          )}
        </section>

        <section className="mt-4 flex items-center justify-between rounded-xl border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Signed in on this device</p>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </section>
      </main>
    </div>
  );
}
