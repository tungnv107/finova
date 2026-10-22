import { describe, expect, it } from "vitest";
import { projectedDebtSchedule } from "@/lib/debt-schedule";

describe("Kế hoạch vay gốc cố định, lãi trên dư nợ giảm dần", () => {
  it("10 triệu VND, 10 kỳ, 12%/năm với ngày tất toán cuối", () => {
    const plan = projectedDebtSchedule("10000000", "12", 10, "2026-10-12", "2027-08-12")!;
    expect(plan).toHaveLength(10);
    expect(plan[0]).toEqual({ installment: 1, dueDate: "2026-11-12", principal: "1000000", interest: "100000", total: "1100000", remaining: "9000000" });
    expect(plan[9]).toEqual({ installment: 10, dueDate: "2027-08-12", principal: "1000000", interest: "10000", total: "1010000", remaining: "0" });
  });
  it("dồn phần dư VND về kỳ cuối và kẹp ngày 31 khi sang tháng 2", () => {
    const plan = projectedDebtSchedule("100", "0", 3, "2026-01-31", null)!;
    expect(plan.map(x => x.dueDate)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(plan.map(x => x.principal)).toEqual(["33", "33", "34"]);
    expect(plan.at(-1)?.remaining).toBe("0");
  });
  it("không giả định kỳ hạn vô lý là lịch trả hợp lệ", () => {
    expect(projectedDebtSchedule("1000000", "12", 12, "2026-10-12", "2026-11-12")).toBeNull();
  });
});
