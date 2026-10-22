import { DashboardPage } from "@/server/dashboard-page";
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DashboardPage searchParams={searchParams} />;
}
