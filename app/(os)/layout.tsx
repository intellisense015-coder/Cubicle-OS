
import { PageShell } from "@/components/ui/page-shell";
import { OsRealtimeProvider } from "@/components/os/realtime-provider";
import { QueryProvider } from "@/components/providers/query-provider";

export default function OsLayout({ children }) {
  return <QueryProvider><OsRealtimeProvider><PageShell>{children}</PageShell></OsRealtimeProvider></QueryProvider>;
}
