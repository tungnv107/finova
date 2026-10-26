import { requirePageContext, requirePremiumPage } from "@/server/page-context";
import { listNotifications, reconcileNotifications } from "@/server/notifications";
import { NotificationsManager } from "@/components/notifications-manager";

export default async function NotificationsPage() {
  const { workspaceId, userId } = await requirePageContext();
  await requirePremiumPage(userId, "NOTIFICATIONS");
  await reconcileNotifications(workspaceId);
  return <NotificationsManager data={await listNotifications(workspaceId)} />;
}
