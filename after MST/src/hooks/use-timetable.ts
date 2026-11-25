import { useEffect, useState } from "react";
import { loadTimetable, TIMETABLE_EVENT, type TimetableEntry } from "@/lib/timetable";

export function useTimetable(): TimetableEntry[] {
  const [entries, setEntries] = useState<TimetableEntry[]>([]);

  useEffect(() => {
    const reload = () => setEntries(loadTimetable());
    reload();
    window.addEventListener(TIMETABLE_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(TIMETABLE_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  return entries;
}
