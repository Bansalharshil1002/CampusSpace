import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useDemoOverrides } from "@/hooks/use-demo-overrides";
import { useDemoRooms } from "@/hooks/use-demo-rooms";
import { useTimetable } from "@/hooks/use-timetable";
import { withOccupancy, type RoomView } from "@/lib/occupancy";
import { seedRooms, type SeedRoom } from "@/lib/seed";

export function useRooms() {
  const { isDemo } = useAuth();
  const seed = useMemo<SeedRoom[]>(() => seedRooms(), []);
  const customRooms = useDemoRooms();
  const demoData = useMemo<SeedRoom[]>(() => [...seed, ...customRooms], [seed, customRooms]);
  const query = useQuery({
    queryKey: ["rooms"],
    enabled: !isDemo,
    refetchInterval: !isDemo ? 15_000 : false,
    queryFn: () => api.listRooms(true),
  });

  if (isDemo) {
    return {
      data: demoData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve({ data: demoData }),
    };
  }
  return query;
}

export function useRoomViews(): RoomView[] {
  const rooms = useRooms();
  const entries = useTimetable();
  const overrides = useDemoOverrides();
  const { isDemo } = useAuth();
  return useMemo(
    () =>
      withOccupancy(rooms.data ?? [], entries, {
        overrides: isDemo ? overrides : {},
      }),
    [rooms.data, entries, overrides, isDemo],
  );
}
