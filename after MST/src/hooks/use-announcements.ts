import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  ANNOUNCEMENTS_EVENT,
  loadAnnouncements,
  loadReadIds,
  markAnnouncementsRead,
  visibleAnnouncements,
  type Announcement,
} from "@/lib/announcements";
import { primaryRole } from "@/lib/status";

export function useAnnouncements() {
  const { user, roles } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const role = primaryRole(roles) ?? "student";
  const email = user?.email ?? "";

  useEffect(() => {
    const reload = () => {
      setItems(loadAnnouncements());
      setReadIds(email ? loadReadIds(email) : []);
    };
    reload();
    window.addEventListener(ANNOUNCEMENTS_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(ANNOUNCEMENTS_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, [email]);

  const visible = useMemo(() => visibleAnnouncements(items, role), [items, role]);
  const read = useMemo(() => new Set(readIds), [readIds]);
  const unread = visible.filter((item) => !read.has(item.id));

  return {
    items,
    visible,
    unread,
    role,
    email,
    markAllRead: () => {
      markAnnouncementsRead(
        email,
        visible.map((item) => item.id),
      );
      setReadIds(email ? loadReadIds(email) : []);
    },
    isRead: (id: string) => read.has(id),
  };
}
