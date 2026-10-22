import { localDay } from "@/lib/dates";

export type ReportPeriodPreset = "thisMonth" | "lastMonth" | "threeMonths" | "thisYear";

// Calendar periods use Vietnam-local dates and an exclusive end, matching parseRange().
export function reportPeriodPreset(preset: ReportPeriodPreset, now = new Date()) {
  const today = localDay(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const monthStart = (offset: number) => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    return date.toISOString().slice(0, 10);
  };

  switch (preset) {
    case "thisMonth": return { start: monthStart(0), endExclusive: monthStart(1) };
    case "lastMonth": return { start: monthStart(-1), endExclusive: monthStart(0) };
    case "threeMonths": return { start: monthStart(-2), endExclusive: monthStart(1) };
    case "thisYear": return { start: `${year}-01-01`, endExclusive: `${year + 1}-01-01` };
  }
}
