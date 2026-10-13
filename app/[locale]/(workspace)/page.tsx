import { AppShell } from "@/components/layout/AppShell";

// Main mail route — everything here lives in AppShell so it can be a client
// component (this file stays a server component / thin wrapper).
export default function Home() {
  return <AppShell />;
}
