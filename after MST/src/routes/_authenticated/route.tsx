import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { loadDemoAccount } from "@/lib/demo";
import { useRemoteSync } from "@/hooks/use-remote-sync";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (loadDemoAccount()) return;
    const session = await api.me();
    if (!session?.user) throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  useRemoteSync();
  return <Outlet />;
}
