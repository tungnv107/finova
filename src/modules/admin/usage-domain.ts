/** Only feature categories are collected: never raw paths, IDs, query strings or financial data. */
export const usageRouteGroups = ["DASHBOARD", "TRANSACTIONS", "WALLETS", "REPORTS",
  "BUDGETS", "GOALS", "RECURRING", "CATEGORIES", "CARDS", "DEBTS",
  "IMPORTS", "BANK_SYNC", "NOTIFICATIONS", "SETTINGS", "PRICING", "BILLING"] as const;
export type UsageRouteGroup = typeof usageRouteGroups[number];

export function usageGroupFromPath(pathname: string): UsageRouteGroup | null {
  const segment = pathname.split("/").filter(Boolean)[0]?.toUpperCase().replaceAll("-", "_");
  return usageRouteGroups.find(group => group === segment) ?? null;
}

/** One browser-document navigation tracker, shared across component remounts.
 * A React StrictMode effect replay is not a new navigation; a path transition,
 * including back/forward to a previously visited path, is. A reload creates
 * a new document and therefore a new tracker and navigation receipt.
 */
export function createPageviewTracker(newId: () => string = () => crypto.randomUUID()) {
  let lastPath: string | null = null;
  return (pathname: string) => {
    if (pathname === lastPath) return null;
    lastPath = pathname;
    const routeGroup = usageGroupFromPath(pathname);
    return routeGroup ? { navigationId: newId(), routeGroup } : null;
  };
}

export function vietnamUsageDay(date: Date) {
  const vietnam = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(vietnam.getUTCFullYear(), vietnam.getUTCMonth(), vietnam.getUTCDate()));
}
