import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Clock3, DoorOpen, Send, Sparkles, UserRound } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAnnouncements } from "@/hooks/use-announcements";
import { useAuth } from "@/hooks/use-auth";
import { useNow } from "@/hooks/use-now";
import { useRoomViews } from "@/hooks/use-rooms";
import { useTimetable } from "@/hooks/use-timetable";
import { assistantReply } from "@/lib/assistant";
import {
  appendMessage,
  CHAT_EVENT,
  clearMessages,
  loadMessages,
  newMessage,
  type ChatMessage,
} from "@/lib/chat";
import { activeEntries, formatClock, upcomingEntries } from "@/lib/timetable";
import { primaryRole } from "@/lib/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Campus AI — Room Status Tracker" },
      {
        name: "description",
        content: "Ask which rooms are free on any day and time slot, or check a specific room.",
      },
      { property: "og:title", content: "Campus AI — Room Status Tracker" },
      { property: "og:description", content: "Find free rooms for any day and time slot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

const SUGGESTIONS = [
  "Which rooms are free on Friday 2–3 PM?",
  "Is CSED-204 free tomorrow at 10 AM?",
  "Free labs on Wednesday morning",
  "What's my next class?",
  "Where is Data Structures?",
];

function AssistantPage() {
  const { user, roles, demoAccount } = useAuth();
  const { unread } = useAnnouncements();
  const rooms = useRoomViews();
  const timetable = useTimetable();
  const now = useNow(30_000);
  const role = primaryRole(roles) ?? "student";
  const className =
    demoAccount?.classCode ?? (role === "student" || role === "cr" ? "COE 2A" : undefined);
  const teacherName = role === "teacher" ? demoAccount?.name : undefined;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reload = () => setMessages(loadMessages("assistant"));
    reload();
    window.addEventListener(CHAT_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(CHAT_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, thinking]);

  const live = activeEntries(timetable, now);
  const next = upcomingEntries(timetable, now, 3);
  const freeNow = rooms.filter((room) => room.current_status === "FREE" && !room.liveEntry).length;

  function ask(question: string) {
    const text = question.trim();
    if (!text || thinking) return;
    const questionMessage = newMessage(
      "assistant",
      { id: user?.id ?? "guest", name: displayName(user), role },
      text,
    );
    setMessages(appendMessage("assistant", questionMessage));
    setBody("");
    setThinking(true);
    window.setTimeout(() => {
      const reply = assistantReply(text, {
        rooms,
        entries: timetable,
        now: new Date(),
        ...(className ? { className } : {}),
        ...(teacherName ? { teacherName } : {}),
      });
      const answer = newMessage(
        "assistant",
        { id: "assistant", name: "Campus AI", role: "assistant" },
        reply,
        "assistant",
      );
      setMessages(appendMessage("assistant", answer));
      setThinking(false);
    }, 420);
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    ask(body);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Room intelligence
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold">
              <Bot className="h-7 w-7" /> Campus AI
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Ask about free rooms on any day and time slot. Answers combine the live board with the
              weekly timetable — including schedule changes posted by CRs and teachers.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearMessages("assistant");
              setMessages([]);
            }}
          >
            Clear chat
          </Button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-3">
            <section className="rounded-xl border bg-card p-4 shadow-card">
              <p className="flex items-center gap-2 font-semibold">
                <DoorOpen className="h-4 w-4" /> Right now
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border bg-muted/30 px-2 py-2">
                  <p className="font-display text-2xl font-bold">{freeNow}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    free
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-2">
                  <p className="font-display text-2xl font-bold">{live.length}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    in class
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-2">
                  <p className="font-display text-2xl font-bold">{next.length}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    upcoming
                  </p>
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {now.toLocaleDateString([], { weekday: "long" })} ·{" "}
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
              {next[0] && (
                <p className="mt-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                  Next: <span className="font-medium">{next[0].subject}</span> in{" "}
                  <span className="font-mono">{next[0].room}</span> at {formatClock(next[0].start)}
                </p>
              )}
              {unread.length > 0 && (
                <p className="mt-2 rounded-md border border-accent/50 bg-accent/10 px-2 py-1.5 text-xs">
                  {unread.length} new announcement{unread.length === 1 ? "" : "s"} on the
                  noticeboard.
                </p>
              )}
            </section>

            <section className="rounded-xl border bg-card p-4 shadow-card">
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4" /> Try asking
              </p>
              <div className="mt-3 space-y-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => ask(suggestion)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-left text-xs transition hover:border-primary hover:bg-muted/40"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </section>

            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              I'm a local assistant: no data leaves this browser. I read the timetable and room
              board in real time, so answers change when a class is moved or cancelled.
            </p>
          </aside>

          <section className="flex min-h-[600px] flex-col rounded-xl border bg-card shadow-card">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground">
                  <Bot className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-semibold">Campus AI</p>
                  <p className="text-xs text-muted-foreground">
                    Free rooms · timetable · room status
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-st-free/40 bg-st-free/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-st-free">
                online
              </span>
            </div>

            <div
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
              style={{ maxHeight: "56vh" }}
            >
              {messages.length === 0 && (
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">Ask me anything about rooms and classes.</p>
                  <p className="mt-1 text-muted-foreground">
                    For a specific slot, include the day and time: “Which rooms are free on Thursday
                    from 2 to 3 PM?”
                  </p>
                </div>
              )}
              {messages.map((message) => {
                const assistant = message.kind === "assistant";
                return (
                  <div
                    key={message.id}
                    className={cn("flex", assistant ? "justify-start" : "justify-end")}
                  >
                    <div
                      className={cn(
                        "max-w-[88%] rounded-lg border px-3 py-2 text-sm",
                        assistant
                          ? "border-accent/40 bg-accent/10"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] opacity-75">
                        {assistant ? (
                          <Bot className="h-3 w-3" />
                        ) : (
                          <UserRound className="h-3 w-3" />
                        )}
                        <span className="font-medium">{message.senderName}</span>
                        <span>
                          {new Date(message.at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    </div>
                  </div>
                );
              })}
              {thinking && (
                <div className="flex justify-start">
                  <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-muted-foreground">
                    Campus AI is checking the timetable…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="border-t p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="e.g. Which rooms are free on Tuesday 11 AM to 12 PM?"
                  rows={2}
                  aria-label="Ask Campus AI"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                />
                <Button type="submit" disabled={!body.trim() || thinking}>
                  <Send className="mr-1 h-4 w-4" /> Ask
                </Button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

function displayName(user: { email?: string; user_metadata?: unknown } | null): string {
  const meta = user?.user_metadata as { name?: unknown } | undefined;
  if (typeof meta?.name === "string" && meta.name.trim()) return meta.name.trim();
  return user?.email?.split("@")[0] ?? "Guest";
}
