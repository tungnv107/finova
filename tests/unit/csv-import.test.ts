import { describe, expect, it } from "vitest";
import { csvDay, parseCsv, safeCsvText } from "@/lib/csv-import";

describe("CSV parsing and validation", () => {
  it("handles UTF-8 BOM, commas, multiline and escaped quotes", () => {
    expect(parseCsv('\uFEFFdate,note\r\n2026-10-19,"Cà phê, sữa"\r\n2026-10-20,"A ""quoted""\nnote"')).toEqual([
      ["date", "note"], ["2026-10-19", "Cà phê, sữa"], ["2026-10-20", 'A "quoted"\nnote'],
    ]);
  });
  it("rejects invalid quotes, nonrectangular rows and > limit", () => {
    expect(() => parseCsv('a,b\n"oops,b')).toThrow();
    expect(() => parseCsv('a,b\n1')).toThrow();
    expect(() => parseCsv('a\n1\n2', 1)).toThrow();
  });
  it("parses Vietnamese and ISO dates, rejects rollover", () => {
    expect(csvDay("20/10/2026")).toBe("2026-10-20");
    expect(csvDay("2024-02-29")).toBe("2024-02-29");
    expect(() => csvDay("31/02/2026")).toThrow();
  });
  it("rejects spreadsheet formula prefixes", () => {
    expect(() => safeCsvText('=SUM(A1:A2)')).toThrow();
    expect(safeCsvText("Tiền nhà")).toBe("Tiền nhà");
  });
});
