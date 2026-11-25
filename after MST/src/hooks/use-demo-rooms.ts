import { useEffect, useState } from "react";
import { DEMO_ROOMS_EVENT, loadDemoRooms } from "@/lib/demo-rooms";
import type { Room } from "@/lib/occupancy";

/** Rooms added by the DoAA/DoSAA demo account, merged into the demo campus. */
export function useDemoRooms(): Room[] {
  const [rooms, setRooms] = useState<Room[]>(() => loadDemoRooms());

  useEffect(() => {
    const refresh = () => setRooms(loadDemoRooms());
    window.addEventListener(DEMO_ROOMS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DEMO_ROOMS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return rooms;
}
