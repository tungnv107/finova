export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

function utcParts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const value = match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])) : null;
  if (!value || value.toISOString().slice(0, 10) !== date) throw new Error("Ngày không hợp lệ (YYYY-MM-DD).");
  return { y: +match![1], m: +match![2], d: +match![3] };
}

/** Add from the original anchor, so 31 Jan -> 28 Feb -> 31 Mar. */
export function occurrenceDate(start: string, frequency: Frequency, interval: number, index: number) {
  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(interval) || interval < 1) throw new Error("Chu kỳ không hợp lệ.");
  const { y, m, d } = utcParts(start);
  if (frequency === "DAILY" || frequency === "WEEKLY") {
    const date = new Date(Date.UTC(y, m - 1, d + index * interval * (frequency === "WEEKLY" ? 7 : 1)));
    return date.toISOString().slice(0, 10);
  }
  const months = (m - 1) + index * interval * (frequency === "YEARLY" ? 12 : 1);
  const first = new Date(Date.UTC(y, months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export function scheduleDates(start: string, end: string | null, frequency: Frequency, interval: number, horizon: string) {
  const dates: string[] = [];
  for (let i = 0; i < 2500; i++) {
    const day = occurrenceDate(start, frequency, interval, i);
    if (day > horizon || (end && day > end)) break;
    dates.push(day);
  }
  return dates;
}
