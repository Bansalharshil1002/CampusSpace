import { useEffect, useState } from "react";
import { DEMO_OVERRIDES_EVENT, loadDemoOverrides, type DemoRoomOverride } from "@/lib/demo";

export function useDemoOverrides(): Record<string, DemoRoomOverride> {
  const [overrides, setOverrides] = useState<Record<string, DemoRoomOverride>>(() =>
    loadDemoOverrides(),
  );

  useEffect(() => {
    const refresh = () => setOverrides(loadDemoOverrides());
    window.addEventListener(DEMO_OVERRIDES_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DEMO_OVERRIDES_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return overrides;
}
