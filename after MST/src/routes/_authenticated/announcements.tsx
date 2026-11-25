import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, CheckCheck, Megaphone, Pin, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAnnouncements } from "@/hooks/use-announcements";
import { useAuth } from "@/hooks/use-auth";
import {
  addAnnouncement,
  AUDIENCE_LABEL,
  CATEGORY_META,
  type AnnouncementAudience,
  type AnnouncementCategory,
} from "@/lib/announcements";
import { pushAnnouncement } from "@/lib/remote-sync";
import { ROLE_LABEL, primaryRole, timeAgo } from "@/lib/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => ({
    meta: [
      { title: "Announcements — Room Status Tracker" },
      {
        name: "description",
        content: "Schedule changes, room updates and notices from CRs, teachers and DoAA/DoSAA.",
      },
      { property: "og:title", content: "Announcements — Room Status Tracker" },
      { property: "og:description", content: "Schedule changes and campus notices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnnouncementsPage,
});

const FILTERS = ["all", "unread", "schedule", "urgent"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  unread: "Unread",
  schedule: "Schedule",
  urgent: "Urgent",
};

function AnnouncementsPage() {
  const { user, roles, demoAccount, isDemo } = useAuth();
  const { visible, unread, markAllRead, isRead } = useAnnouncements();
  const role = primaryRole(roles) ?? "student";
  const staff = role !== "student";
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AnnouncementCategory>("general");
  const [audience, setAudience] = useState<AnnouncementAudience>("all");
  const [pinned, setPinned] = useState(false);

  const list = useMemo(() => {
    if (filter === "all") return visible;
    if (filter === "unread") return unread;
    return visible.filter((item) => item.category === filter);
  }, [filter, visible, unread]);

  function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Add a title and a message");
      return;
    }
    const item = addAnnouncement({
      title: title.trim(),
      body: body.trim(),
      category,
      audience,
      authorName: demoAccount?.name ?? displayName(user),
      authorRole: role,
      authorEmail: demoAccount?.email ?? user?.email ?? "",
      pinned,
      source: "manual",
    });
    if (!isDemo) void pushAnnouncement(item);
    toast.success("Announcement published");
    setTitle("");
    setBody("");
    setCategory("general");
    setAudience("all");
    setPinned(false);
    setOpen(false);
    setFilter("all");
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Noticeboard
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold">
              <Megaphone className="h-7 w-7" /> Announcements
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Schedule changes from CRs and teachers appear here automatically.{" "}
              {staff
                ? "You can also publish a notice to students or staff."
                : "Your CR, teachers and the DoAA office post updates here."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unread.length > 0 && (
              <Button variant="outline" onClick={markAllRead}>
                <CheckCheck className="mr-1 h-4 w-4" /> Mark all read ({unread.length})
              </Button>
            )}
            {staff && (
              <Button onClick={() => setOpen((value) => !value)}>
                <Plus className="mr-1 h-4 w-4" /> New announcement
              </Button>
            )}
          </div>
        </div>

        {open && staff && (
          <form onSubmit={publish} className="mt-6 rounded-xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Bell className="h-5 w-5" /> Publish a notice
            </h2>
            <div className="mt-4 grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ann-title">Title</Label>
                <Input
                  id="ann-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Operating Systems class moved to LT-301"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-body">Message</Label>
                <Textarea
                  id="ann-body"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What changed, when, and what students should do."
                  maxLength={1200}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium">Type</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(Object.keys(CATEGORY_META) as AnnouncementCategory[]).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setCategory(item)}
                        aria-pressed={category === item}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition",
                          category === item
                            ? "border-foreground bg-foreground text-background"
                            : "hover:bg-muted",
                        )}
                      >
                        {CATEGORY_META[item].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Audience</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(Object.keys(AUDIENCE_LABEL) as AnnouncementAudience[]).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAudience(item)}
                        aria-pressed={audience === item}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition",
                          audience === item
                            ? "border-foreground bg-foreground text-background"
                            : "hover:bg-muted",
                        )}
                      >
                        {AUDIENCE_LABEL[item]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Pin to the top
              </label>
              <div className="flex gap-2">
                <Button type="submit">Publish</Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        )}

        <div className="mt-6 flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                filter === item ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {FILTER_LABEL[item]}
              {item === "unread" && unread.length > 0 ? ` (${unread.length})` : ""}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {list.length === 0 && (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {filter === "unread"
                ? "You're all caught up. Nothing unread."
                : "No announcements here yet."}
            </div>
          )}
          {list.map((item) => {
            const meta = CATEGORY_META[item.category];
            const unreadItem = !isRead(item.id);
            return (
              <article
                key={item.id}
                className={cn(
                  "relative rounded-xl border bg-card p-5 shadow-card",
                  unreadItem && "border-accent/60",
                )}
              >
                {unreadItem && (
                  <span
                    className="absolute right-4 top-4 h-2 w-2 rounded-full bg-accent"
                    aria-label="Unread"
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                      meta.className,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                  <span className="rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {AUDIENCE_LABEL[item.audience]}
                  </span>
                  {item.pinned && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
                      <Pin className="h-3 w-3" /> Pinned
                    </span>
                  )}
                  {item.category === "urgent" && (
                    <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden />
                  )}
                </div>
                <h2 className="mt-3 text-lg font-semibold">{item.title}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.body}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{item.authorName}</span>
                  <span>{ROLE_LABEL[item.authorRole]}</span>
                  <span>· {timeAgo(item.createdAt)}</span>
                  {item.room && <span className="font-mono">· {item.room}</span>}
                  {item.className && <span>· {item.className}</span>}
                  {item.source !== "manual" && (
                    <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">
                      auto
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function displayName(user: { email?: string; user_metadata?: unknown } | null): string {
  const meta = user?.user_metadata as { name?: unknown } | undefined;
  if (typeof meta?.name === "string" && meta.name.trim()) return meta.name.trim();
  return user?.email?.split("@")[0] ?? "Staff";
}
