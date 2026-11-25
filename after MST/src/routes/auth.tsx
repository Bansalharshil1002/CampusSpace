import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { ALLOWED_EMAIL_DOMAIN, emailError } from "@/lib/auth-domain";
import {
  allowEmailAuth,
  allowRegistration,
  deploymentNotice,
  showLocalDemo,
} from "@/lib/deploy-config";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEMO_ACCOUNTS,
  clearDemoSession,
  findDemoAccount,
  findDemoAccountByKey,
  loadDemoAccount,
  startDemoSession,
  type DemoAccount,
} from "@/lib/demo";
import { demoEffectiveRole } from "@/lib/demo-roles";
import { ROLE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Room Status Tracker" },
      { name: "description", content: "Sign in with your college email and password." },
      { property: "og:title", content: "Sign in — Room Status Tracker" },
      { property: "og:description", content: "Sign in with your college email and password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Tab = "signin" | "signup" | "code";
type ResetState = { email: string; token: string };

function friendlyAuthError(message: string): string {
  if (/invalid login credentials|wrong email or password/i.test(message)) {
    return allowEmailAuth
      ? "Wrong email or password. If you have not set a password yet, use “Forgot password” to create one."
      : "Wrong email or password.";
  }
  if (/already registered|already has an account/i.test(message)) {
    return "That email already has an account. Use the Sign in tab instead.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (/only @|college email/i.test(message)) {
    return `Only @${ALLOWED_EMAIL_DOMAIN} college email addresses can sign in.`;
  }
  return message;
}

function readParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/** Read `?magic=`, `?reset=`, `?email=` and `?demo=` once, before any redirect. */
function initialLinkState() {
  const params = readParams();
  const demoKey = (params.get("demo") ?? "").trim().toLowerCase();
  return {
    demoKey: demoKey || null,
    magic: params.get("magic"),
    reset: params.get("reset"),
    email: params.get("email") ?? "",
  };
}

function AuthPage() {
  const navigate = useNavigate();
  const [link] = useState(initialLinkState);
  const [tab, setTab] = useState<Tab>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(link.email);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [reset, setReset] = useState<ResetState | null>(
    link.reset ? { email: link.email, token: link.reset } : null,
  );
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function enterDemo(account: DemoAccount) {
    clearDemoSession();
    startDemoSession(account);
    toast.success(`Previewing the ${ROLE_LABEL[demoEffectiveRole(account)]} dashboard`);
    void navigate({ to: "/", replace: true });
  }

  // Handle shared links (magic sign-in, password reset, demo preview) before
  // deciding whether an existing session should bounce the visitor onward.
  useEffect(() => {
    let cancelled = false;

    if (link.demoKey) {
      const account = findDemoAccountByKey(link.demoKey);
      if (account) {
        enterDemo(account);
        return;
      }
      setEmailMsg(`No demo account matches “${link.demoKey}”. Pick one below.`);
    }

    if (link.magic && !allowEmailAuth) {
      setEmailMsg("Sign-in links are unavailable in this controlled demo. Use your password.");
      setBusy(false);
      return;
    }

    if (link.magic) {
      setBusy(true);
      void api
        .verifyMagic(link.magic)
        .then(() => {
          if (cancelled) return;
          setBusy(false);
          toast.success("Signed in");
          void navigate({ to: "/", replace: true });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setBusy(false);
          setEmailMsg(
            friendlyAuthError(
              error instanceof Error ? error.message : "That sign-in link is not valid",
            ),
          );
        });
      return;
    }

    if (link.reset) {
      if (!allowEmailAuth) {
        setEmailMsg(
          "Password reset is unavailable in this controlled demo. Ask the administrator to reset your password.",
        );
      }
      setBusy(false);
      return;
    }

    if (loadDemoAccount()) {
      void navigate({ to: "/", replace: true });
      return;
    }
    void api.me().then((session) => {
      if (!cancelled && session?.user) void navigate({ to: "/", replace: true });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  function validatedEmail(): string | null {
    const problem = emailError(email);
    setEmailMsg(problem);
    return problem ? null : email.trim().toLowerCase();
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const clean = validatedEmail();
    if (!clean) return;
    if (!password) {
      setEmailMsg(
        allowEmailAuth
          ? "Enter your password, or use a one-time code instead."
          : "Enter your password.",
      );
      return;
    }
    const demo = findDemoAccount(clean, password);
    if (demo) {
      enterDemo(demo);
      return;
    }
    setNotice(null);
    setBusy(true);
    clearDemoSession();
    try {
      await api.login({ email: clean, password });
    } catch (error) {
      setBusy(false);
      setEmailMsg(friendlyAuthError(error instanceof Error ? error.message : "Sign-in failed"));
      return;
    }
    setBusy(false);
    toast.success("Signed in");
    void navigate({ to: "/", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const clean = validatedEmail();
    if (!clean) return;
    if (password.length < 8) {
      setEmailMsg("Use at least 8 characters for the password.");
      return;
    }
    if (password !== confirm) {
      setEmailMsg("The two passwords do not match.");
      return;
    }
    setNotice(null);
    setBusy(true);
    clearDemoSession();
    try {
      await api.register({
        email: clean,
        password,
        name: name.trim() || clean.split("@")[0] || clean,
      });
    } catch (error) {
      setBusy(false);
      setEmailMsg(
        friendlyAuthError(error instanceof Error ? error.message : "Could not create account"),
      );
      return;
    }
    setBusy(false);
    toast.success("Account created");
    void navigate({ to: "/", replace: true });
  }

  async function forgotPassword() {
    const clean = validatedEmail();
    if (!clean) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.forgotPassword(clean);
      setBusy(false);
      toast.success("Reset instructions ready");
      if (result.dev_token) {
        setReset({ email: clean, token: result.dev_token });
        setPassword("");
        setConfirm("");
        setHint("The local backend printed a reset token, so you can set a new password now.");
      } else {
        setNotice("Check your email for the reset link, then choose a new password here.");
      }
    } catch (error) {
      setBusy(false);
      setEmailMsg(
        friendlyAuthError(error instanceof Error ? error.message : "Could not send reset email"),
      );
    }
  }

  async function sendCode() {
    const clean = validatedEmail();
    if (!clean) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.requestOtp(clean);
      setBusy(false);
      setCodeSentTo(clean);
      setCode("");
      setHint(
        result.dev_code
          ? `Local backend code: ${result.dev_code} (valid for 15 minutes).`
          : result.message,
      );
      toast.success("Code sent");
    } catch (error) {
      setBusy(false);
      setEmailMsg(
        friendlyAuthError(error instanceof Error ? error.message : "Could not send code"),
      );
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = codeSentTo ?? validatedEmail();
    if (!clean) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setEmailMsg("Enter the six-digit code from your email.");
      return;
    }
    setBusy(true);
    setEmailMsg(null);
    try {
      await api.verifyOtp({ email: clean, code: code.trim() });
    } catch (error) {
      setBusy(false);
      setEmailMsg(
        friendlyAuthError(error instanceof Error ? error.message : "Could not verify code"),
      );
      return;
    }
    setBusy(false);
    toast.success("Signed in");
    void navigate({ to: "/", replace: true });
  }

  async function sendMagicLink() {
    const clean = validatedEmail();
    if (!clean) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.requestMagic(clean);
      setBusy(false);
      setHint(
        result.magic_url
          ? `Local backend link: ${result.magic_url}`
          : "Check your email and open the sign-in link on this device.",
      );
      toast.success("Magic link sent");
    } catch (error) {
      setBusy(false);
      setEmailMsg(
        friendlyAuthError(error instanceof Error ? error.message : "Could not send sign-in link"),
      );
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!reset) return;
    const clean = emailError(reset.email) ? null : reset.email.trim().toLowerCase();
    if (!clean) {
      setEmailMsg(`Enter your @${ALLOWED_EMAIL_DOMAIN} email address.`);
      return;
    }
    if (password.length < 8) {
      setEmailMsg("Use at least 8 characters for the new password.");
      return;
    }
    if (password !== confirm) {
      setEmailMsg("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setEmailMsg(null);
    try {
      await api.resetPassword({ email: clean, token: reset.token, password });
    } catch (error) {
      setBusy(false);
      setEmailMsg(
        friendlyAuthError(error instanceof Error ? error.message : "Could not reset password"),
      );
      return;
    }
    setBusy(false);
    setReset(null);
    setHint(null);
    setEmail(clean);
    setPassword("");
    setConfirm("");
    setTab("signin");
    setNotice("Password updated. Sign in with your new password.");
    toast.success("Password updated");
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid max-w-lg px-4 py-16">
        <div className="rounded-xl border bg-card p-8 shadow-card">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {deploymentNotice ? "Controlled demo account" : "College account"}
          </p>
          <h1 className="mt-2 text-3xl font-bold">{reset ? "Set a new password" : "Sign in"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {reset
              ? "Choose a new password for your college account."
              : allowEmailAuth
                ? `Use your @${ALLOWED_EMAIL_DOMAIN} email and password, or sign in with a one-time code.`
                : `Use the password issued for your @${ALLOWED_EMAIL_DOMAIN} demo account.`}
          </p>
          {deploymentNotice && <Note>{deploymentNotice}</Note>}

          {reset ? (
            <form onSubmit={savePassword} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">College email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
                  value={reset.email}
                  onChange={(e) => setReset({ ...reset, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-token">Reset token</Label>
                <Input
                  id="reset-token"
                  value={reset.token}
                  onChange={(e) => setReset({ ...reset, token: e.target.value })}
                  className="font-mono text-xs"
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reset-password">New password</Label>
                  <Input
                    id="reset-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm">Confirm password</Label>
                  <Input
                    id="reset-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </div>
              {emailMsg && <Alert>{emailMsg}</Alert>}
              {hint && <Note>{hint}</Note>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Saving…" : "Save new password"}
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => {
                  setReset(null);
                  setHint(null);
                  setEmailMsg(null);
                  setPassword("");
                  setConfirm("");
                }}
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <Tabs
              value={tab}
              onValueChange={(value) => {
                setTab(value as Tab);
                setEmailMsg(null);
                setNotice(null);
                setHint(null);
              }}
              className="mt-6"
            >
              <TabsList
                className={cn(
                  "grid w-full",
                  allowEmailAuth && allowRegistration
                    ? "grid-cols-3"
                    : allowEmailAuth || allowRegistration
                      ? "grid-cols-2"
                      : "grid-cols-1",
                )}
              >
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                {allowEmailAuth && <TabsTrigger value="code">Email code</TabsTrigger>}
                {allowRegistration && <TabsTrigger value="signup">Create account</TabsTrigger>}
              </TabsList>

              <TabsContent value="signin" className="mt-5">
                <form onSubmit={signIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">College email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailMsg(null);
                      }}
                      required
                      aria-invalid={!!emailMsg}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="signin-password">Password</Label>
                      {allowEmailAuth && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline"
                          onClick={() => void forgotPassword()}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <Input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {emailMsg && <Alert>{emailMsg}</Alert>}
                  {notice && <Note>{notice}</Note>}
                  {hint && <Note>{hint}</Note>}
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Only @{ALLOWED_EMAIL_DOMAIN} addresses are allowed.{" "}
                    {allowRegistration
                      ? "New here? Open the Create account tab, or try a demo account below."
                      : showLocalDemo
                        ? "Use your issued password, or try a local demo account below."
                        : "Use the password issued for your account."}
                  </p>
                </form>
              </TabsContent>

              {allowEmailAuth && (
                <TabsContent value="code" className="mt-5">
                  <form onSubmit={verifyCode} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="code-email">College email</Label>
                      <Input
                        id="code-email"
                        type="email"
                        autoComplete="email"
                        placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setEmailMsg(null);
                        }}
                        required
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void sendCode()}
                        disabled={busy}
                      >
                        Send a 6-digit code
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void sendMagicLink()}
                        disabled={busy}
                      >
                        Email a sign-in link
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="code-input">One-time code</Label>
                      <Input
                        id="code-input"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        maxLength={6}
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value.replace(/\D/g, ""));
                          setEmailMsg(null);
                        }}
                      />
                    </div>
                    {emailMsg && <Alert>{emailMsg}</Alert>}
                    {notice && <Note>{notice}</Note>}
                    {hint && <Note>{hint}</Note>}
                    <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
                      {busy ? "Checking…" : "Sign in with code"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      No password needed. Codes expire after 15 minutes and links after one hour.
                    </p>
                  </form>
                </TabsContent>
              )}

              {allowRegistration && (
                <TabsContent value="signup" className="mt-5">
                  <form onSubmit={signUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full name</Label>
                      <Input
                        id="signup-name"
                        autoComplete="name"
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">College email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        autoComplete="email"
                        placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setEmailMsg(null);
                        }}
                        required
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="signup-password">Password</Label>
                        <Input
                          id="signup-password"
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          minLength={8}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signup-confirm">Confirm password</Label>
                        <Input
                          id="signup-confirm"
                          type="password"
                          autoComplete="new-password"
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          minLength={8}
                          required
                        />
                      </div>
                    </div>
                    {emailMsg && <Alert>{emailMsg}</Alert>}
                    {notice && <Note>{notice}</Note>}
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? "Creating account…" : "Create account"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      New accounts start as Students. A DoAA/DoSAA can promote you to CR, Teacher or
                      DoAA/DoSAA from Manage → Users &amp; roles.
                    </p>
                  </form>
                </TabsContent>
              )}
            </Tabs>
          )}

          {showLocalDemo && (
            <section className="mt-6 rounded-lg border border-dashed p-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Demo accounts
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                No backend needed. Pick a role to preview its dashboard. Demo changes stay in this
                browser.
              </p>
              <ul className="mt-3 space-y-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <li
                    key={account.email}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {ROLE_LABEL[demoEffectiveRole(account)]} · {account.name}
                      </p>
                      <p className="break-all font-mono text-xs">
                        {account.email} / {account.password}
                      </p>
                      <p className="text-xs text-muted-foreground">{account.note}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => enterDemo(account)}
                    >
                      <KeyRound className="mr-1 h-3.5 w-3.5" /> Use
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="break-words rounded-md border border-st-changed/40 bg-st-changed/10 px-3 py-2 text-sm">
      {children}
    </p>
  );
}
