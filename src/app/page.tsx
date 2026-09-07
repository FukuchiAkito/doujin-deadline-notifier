import { DeadlineDashboard } from "@/components/deadline-dashboard";
import { config } from "@/lib/server/config";

export default function Home() {
  return <DeadlineDashboard vapidPublicKey={config.vapidPublicKey} />;
}
