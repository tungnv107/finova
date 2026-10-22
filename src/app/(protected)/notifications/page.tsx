import { requirePageContext } from "@/server/page-context";
import { listNotifications, reconcileNotifications } from "@/server/notifications";
import { NotificationsManager } from "@/components/notifications-manager";

export default async function NotificationsPage() {
  const { workspaceId } = await requirePageContext();
  await reconcileNotifications(workspaceId);
  return <NotificationsManager data={await listNotifications(workspaceId)} />;
}
