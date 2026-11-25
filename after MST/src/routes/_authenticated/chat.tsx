import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Send, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  appendMessage,
  canDirectMessage,
  canPost,
  CHAT_BROADCAST,
  CHAT_CHANNELS,
  CHAT_EVENT,
  clearMessages,
  dmChannelId,
  dmPartner,
  isDmChannel,
  loadMessages,
  newMessage,
  STAFF_ROLES,
  staffRoleLabel,
  visibleChannels,
  type ChatChannel,
  type ChatMessage,
} from "@/lib/chat";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { demoEffectiveRole } from "@/lib/demo-roles";
import { clearRemoteMessages, pushChatMessage, refreshChatChannel } from "@/lib/remote-sync";
import { ROLE_LABEL, primaryRole, timeAgo, type AppRole } from "@/lib/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Messages — Room Status Tracker" },
      {
        name: "description",
        content: "Message portal between CRs, teachers and the DoAA/DoSAA office.",
      },
      { property: "og:title", content: "Messages — Room Status Tracker" },
      {
        property: "og:description",
        content: "Staff messaging for room and schedule coordination.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

interface Contact {
  email: string;
  name: string;
  role: AppRole;
}

function displayNameFor(user: ReturnType<typeof useAuth>["user"]): string {
  if (!user) return "Guest";
  const meta = user.user_metadata as { name?: unknown } | undefined;
  if (typeof meta?.name === "string" && meta.name.trim()) return meta.name.trim();
  return user.email?.split("@")[0] ?? "Guest";
}

function useStaffContacts(selfEmail: string, isDemo: boolean, selfRole: AppRole): Contact[] {
  const demoContacts = useMemo<Contact[]>(
    () =>
      DEMO_ACCOUNTS.filter(
        (account) =>
          account.email !== selfEmail && canDirectMessage(selfRole, demoEffectiveRole(account)),
      ).map((account) => ({
        email: account.email,
        name: account.name,
        role: demoEffectiveRole(account),
      })),
    [selfEmail, selfRole],
  );

  const realQ = useQuery({
    queryKey: ["staff-contacts", selfEmail],
    enabled: !isDemo && !!selfEmail,
    retry: false,
    queryFn: async () => {
      const staff = await api.listStaff();
      return staff
        .filter((profile) => profile.email !== selfEmail)
        .map<Contact>((profile) => ({
          email: profile.email,
          name: profile.name || profile.email.split("@")[0] || profile.email,
          role: (profile.roles.find((role) => STAFF_ROLES.includes(role)) ?? "teacher") as AppRole,
        }))
        .filter((contact) => canDirectMessage(selfRole, contact.role));
    },
  });

  if (isDemo) return demoContacts;
  return realQ.data ?? [];
}

function ChatPage() {
  const { hasAny, ready } = useAuth();

  if (!ready) return null;
  if (!hasAny(STAFF_ROLES)) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Staff only
          </p>
          <h1 className="mt-2 text-3xl font-bold">Messaging is for CRs, teachers and the office</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Student accounts do not have a messaging tab. Use Announcements for notices and Campus
            AI to check which rooms are free.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/">Back to dashboard</Link>
          </Button>
        </main>
      </div>
    );
  }

  return <ChatPortal />;
}

function ChatPortal() {
  const { user, roles, isDemo, demoAccount } = useAuth();
  const role = primaryRole(roles) ?? "student";
  const staff = role !== "student";
  const selfEmail = demoAccount?.email ?? user?.email ?? "";
  const name = demoAccount?.name ?? displayNameFor(user);
  const contacts = useStaffContacts(selfEmail, isDemo, role);
  const available = useMemo(() => visibleChannels(roles), [roles]);
  const [channelId, setChannelId] = useState(staff ? "staff" : "general");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [tick, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const dmContact = isDmChannel(channelId)
    ? contacts.find((contact) => contact.email === dmPartner(channelId, selfEmail))
    : null;

  const channel: ChatChannel =
    available.find((item) => item.id === channelId) ??
    (dmContact
      ? {
          id: channelId,
          label: dmContact.name,
          description: `Direct message with ${dmContact.name}`,
          staffOnly: true,
          roles: STAFF_ROLES,
          kind: "dm",
        }
      : (available[0] ?? {
          id: "general",
          label: "General",
          description: "Open channel",
          staffOnly: false,
          roles: ["student", "cr", "teacher", "admin"],
          kind: "group",
        }));

  useEffect(() => {
    if (!staff) {
      if (channelId !== "general") setChannelId("general");
      return;
    }
    if (available.some((item) => item.id === channelId)) return;
    if (isDmChannel(channelId) && dmContact) return;
    setChannelId(available[0]?.id ?? "staff");
  }, [staff, available, channelId, dmContact]);

  useEffect(() => {
    const reload = () => {
      setMessages(loadMessages(channelId));
      setTick((value) => value + 1);
    };
    reload();
    window.addEventListener(CHAT_EVENT, reload);
    window.addEventListener("storage", reload);
    const bc =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHAT_BROADCAST) : null;
    if (bc) bc.onmessage = reload;
    return () => {
      window.removeEventListener(CHAT_EVENT, reload);
      window.removeEventListener("storage", reload);
      bc?.close();
    };
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, channelId]);

  useEffect(() => {
    if (isDemo) return;
    void refreshChatChannel(channelId);
    const timer = window.setInterval(() => {
      void refreshChatChannel(channelId);
    }, 6_000);
    return () => window.clearInterval(timer);
  }, [channelId, isDemo]);

  const canWrite = canPost(channel, roles) && (channel.kind === "group" || staff);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canWrite || !body.trim()) return;
    const message = newMessage(channelId, { id: user.id, name, role }, body.trim());
    setBody("");
    setMessages(appendMessage(channelId, message));
    if (!isDemo) void pushChatMessage(message);
  }

  function openDm(contact: Contact) {
    setChannelId(dmChannelId(selfEmail, contact.email));
    setBody("");
  }

  const groupChannels = available.filter((item) => item.kind === "group");

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Staff coordination
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold">
            <MessageSquare className="h-7 w-7" /> Messages
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {staff
              ? "Group rooms for CRs, teachers and DoAA/DoSAA. Direct messages connect teachers with CRs and the DoAA/DoSAA office."
              : "Read the general channel. Staff-only rooms are visible to CRs, teachers and the DoAA office."}
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-4">
            <section>
              <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <Users className="h-3 w-3" /> Group rooms
              </p>
              <div className="space-y-2">
                {groupChannels.map((item) => {
                  const active = item.id === channelId;
                  const last = loadMessages(item.id).at(-1);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setChannelId(item.id)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition",
                        active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{item.label}</span>
                        {item.staffOnly && (
                          <span className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                            Staff
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {item.id === "general"
                          ? "Everyone signed in"
                          : `${contacts.length + 1} staff member${contacts.length === 0 ? "" : "s"}`}
                      </span>
                      {last && (
                        <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">
                          {last.senderName}: {last.body}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {staff && contacts.length > 0 && (
              <section>
                <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <UserRound className="h-3 w-3" /> Direct messages
                </p>
                <div className="space-y-2">
                  {contacts.map((contact) => {
                    const id = dmChannelId(selfEmail, contact.email);
                    const active = id === channelId;
                    const last = loadMessages(id).at(-1);
                    return (
                      <button
                        key={contact.email}
                        type="button"
                        onClick={() => openDm(contact)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition",
                          active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40",
                        )}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink font-mono text-xs text-ink-foreground">
                          {contact.name
                            .split(" ")
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{contact.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {staffRoleLabel(contact.role)}
                            {last ? ` · ${last.body}` : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              {isDemo
                ? "Demo messages are stored in this browser and stay signed in across all six demo accounts, so you can switch accounts and continue the same conversation."
                : "Messages are synced with the campus backend and refresh every few seconds."}
              <span className="mt-1 block">
                {tick} live update{tick === 1 ? "" : "s"}.
              </span>
            </p>
          </aside>

          <section className="flex min-h-[600px] flex-col rounded-xl border bg-card shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <p className="font-semibold">{channel.label}</p>
                <p className="text-xs text-muted-foreground">{channel.description}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (isDemo) {
                    clearMessages(channelId);
                    setMessages([]);
                    toast.success("Conversation cleared on this device");
                    return;
                  }
                  void clearRemoteMessages(channelId).then(() => {
                    clearMessages(channelId);
                    setMessages([]);
                    toast.success("Conversation cleared");
                  });
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Clear
              </Button>
            </div>

            <div
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
              style={{ maxHeight: "55vh" }}
            >
              {messages.length === 0 && (
                <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                  No messages yet. Say hello, share a room update, or ask the DoAA office for help.
                </div>
              )}
              {messages.map((message) => {
                const mine = message.senderId === user?.id;
                return (
                  <div
                    key={message.id}
                    className={cn("flex", mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                        mine ? "bg-primary text-primary-foreground" : "bg-muted/50",
                      )}
                    >
                      <div className="flex flex-wrap items-baseline gap-2 text-[11px] opacity-80">
                        <span className="font-medium">{message.senderName}</span>
                        <span>
                          {message.senderRole === "assistant"
                            ? "Assistant"
                            : ROLE_LABEL[message.senderRole]}
                        </span>
                        <span>{timeAgo(message.at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="border-t p-3">
              {!canWrite && (
                <p className="mb-2 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  This room is read-only for students. Ask your CR or a teacher to post.
                </p>
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={`Message ${channel.label}…`}
                  rows={2}
                  disabled={!canWrite}
                  aria-label="Message"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                />
                <Button type="submit" disabled={!canWrite || !body.trim()}>
                  <Send className="mr-1 h-4 w-4" /> Send
                </Button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
