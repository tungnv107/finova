import { describe, expect, it } from "vitest";
import { Decimal, formatVnd, normalAmount, parseVnd } from "@/lib/money";
import { transactionLines, validateBalanced } from "@/server/ledger";
import { transactionInput, transactionEdit } from "@/schemas/finance";

const A = "wallet-A", B = "wallet-B", C = "category-C";

describe("Tính đúng số tiền và hạch toán", () => {
  it("không làm tròn sai số tiền lớn bằng phép toán Number", () => {
    expect(parseVnd("9007199254740993").minus("9007199254740992").toString()).toBe("1");
    expect(formatVnd("15000000")).toBe("15.000.000 ₫");
    expect(() => parseVnd("0")).toThrow();
    expect(() => parseVnd("1.5")).toThrow();
  });

  for (const kind of ["INCOME", "EXPENSE", "TRANSFER", "REFUND"] as const) {
    it(`${kind} luôn ghi ít nhất hai bút toán cân bằng`, () => {
      const lines = transactionLines({ kind, amount: new Decimal("500000"), walletAccountId: A, destinationAccountId: B, categoryAccountId: C });
      expect(() => validateBalanced(lines)).not.toThrow();
      expect(lines).toHaveLength(2);
    });
  }

  it("transfer không có tài khoản thu nhập và chi phí", () => {
    expect(transactionLines({ kind: "TRANSFER", amount: new Decimal("500000"), walletAccountId: A, destinationAccountId: B }))
      .toEqual([{ ledgerAccountId: B, side: "DEBIT", amount: new Decimal("500000") }, { ledgerAccountId: A, side: "CREDIT", amount: new Decimal("500000") }]);
  });

  it("transfer có phí ghi debit ví nhận + chi phí và credit ví nguồn cho cả gốc lẫn phí", () => {
    const lines = transactionLines({ kind: "TRANSFER", amount: new Decimal("500000"), feeAmount: new Decimal("5000"),
      walletAccountId: A, destinationAccountId: B, feeAccountId: C });
    expect(lines).toEqual([
      { ledgerAccountId: B, side: "DEBIT", amount: new Decimal("500000") },
      { ledgerAccountId: C, side: "DEBIT", amount: new Decimal("5000") },
      { ledgerAccountId: A, side: "CREDIT", amount: new Decimal("505000") },
    ]);
    expect(() => validateBalanced(lines)).not.toThrow();
    const reversed = lines.map(line => ({ ...line, side: line.side === "DEBIT" ? "CREDIT" as const : "DEBIT" as const }));
    expect(() => validateBalanced(reversed)).not.toThrow();
    for (const account of [A, B, C]) {
      const balance = [...lines, ...reversed].filter(line => line.ledgerAccountId === account)
        .reduce((total, line) => total.add(line.side === "DEBIT" ? line.amount : line.amount.negated()), new Decimal(0));
      expect(balance.isZero()).toBe(true);
    }
  });

  it("phí VND chỉ hợp lệ với chuyển ví, là số nguyên không âm và cần expense account khi dương", () => {
    const transfer = { kind: "TRANSFER" as const, walletId: A, destinationWalletId: B, amount: "500000", occurredAt: "2026-10-21T12:00:00+07:00" };
    expect(transactionInput.parse({ ...transfer, feeAmount: "0" }).feeAmount).toBe("0");
    expect(transactionInput.parse({ ...transfer, feeAmount: "5000" }).feeAmount).toBe("5000");
    expect(transactionEdit.parse({ ...transfer, feeAmount: "5000", version: 1 }).feeAmount).toBe("5000");
    for (const feeAmount of ["-1", "1.2", "abc", "00", "10000000000000000"]) {
      expect(transactionInput.safeParse({ ...transfer, feeAmount }).success).toBe(false);
    }
    expect(transactionInput.safeParse({ ...transfer, kind: "EXPENSE", feeAmount: "5" }).success).toBe(false);
    expect(() => transactionLines({ kind: "TRANSFER", amount: new Decimal("5"), feeAmount: new Decimal("1"),
      walletAccountId: A, destinationAccountId: B })).toThrow();
  });

  it("kiểm tra tags giao dịch: trim, giới hạn và chống trùng không phân biệt hoa thường", () => {
    const base = { kind: "EXPENSE" as const, walletId: A, categoryId: C,
      amount: "100", occurredAt: "2026-10-21T12:00:00+07:00" };
    expect(transactionInput.parse({ ...base, tags: ["  Ăn uống ", "Công việc"] }).tags)
      .toEqual(["Ăn uống", "Công việc"]);
    expect(transactionEdit.parse({ ...base, version: 1, tags: [] }).tags).toEqual([]);
    expect(transactionInput.parse(base).tags).toBeUndefined();
    for (const tags of [
      ["Ăn uống", "ăn uống"], [""], ["  "], ["a".repeat(31)],
      ["tag,tag"], ["tag\nother"], Array.from({ length: 11 }, (_, i) => `tag-${i}`),
    ]) {
      expect(transactionInput.safeParse({ ...base, tags }).success, JSON.stringify(tags)).toBe(false);
    }
    expect(transactionInput.safeParse({ ...base, tags: Array.from({ length: 10 }, (_, i) => `tag-${i}`) }).success).toBe(true);
  });

  it("refund ghi đảo chiều so với expense", () => {
    const expense = transactionLines({ kind: "EXPENSE", amount: new Decimal(100), walletAccountId: A, categoryAccountId: C });
    const refund = transactionLines({ kind: "REFUND", amount: new Decimal(100), walletAccountId: A, categoryAccountId: C });
    expect(expense.map(x => x.side)).toEqual(["DEBIT", "CREDIT"]);
    expect(refund.map(x => x.side)).toEqual(["DEBIT", "CREDIT"]);
    expect(refund.map(x => x.ledgerAccountId)).toEqual(expense.map(x => x.ledgerAccountId).reverse());
    expect(normalAmount("EXPENSE", "CREDIT", "100").toString()).toBe("-100");
  });

  it("không chấp nhận bút toán lệch hoặc số tiền không dương", () => {
    expect(() => validateBalanced([{ ledgerAccountId: A, side: "DEBIT", amount: new Decimal(4) }, { ledgerAccountId: B, side: "CREDIT", amount: new Decimal(3) }])).toThrow();
    expect(() => validateBalanced([{ ledgerAccountId: A, side: "DEBIT", amount: new Decimal(0) }, { ledgerAccountId: B, side: "CREDIT", amount: new Decimal(0) }])).toThrow();
  });

  it("512 kịch bản có seed: ghi sổ cân, reversal triệt tiêu và VND không mất precision qua JSON", () => {
    // Deterministic pseudo-random property sweep; repeatable failures with seed 0x51F0A.
    let state = 0x51f0a;
    const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
    const kinds = ["INCOME", "EXPENSE", "TRANSFER", "REFUND"] as const;

    for (let index = 0; index < 512; index++) {
      const amountString = (BigInt(next()) * BigInt(65536) + BigInt(next() & 0xffff) + BigInt(1)).toString();
      const kind = kinds[index % kinds.length];
      const amount = parseVnd(amountString);
      const lines = transactionLines({ kind, amount, walletAccountId: A, destinationAccountId: B, categoryAccountId: C });
      expect(() => validateBalanced(lines), `case ${index} ${kind}`).not.toThrow();

      const reversed = lines.map((line) => ({ ...line, side: line.side === "DEBIT" ? "CREDIT" as const : "DEBIT" as const }));
      expect(() => validateBalanced(reversed), `reversal ${index}`).not.toThrow();
      const accountBalance = new Map<string, Decimal>();
      for (const line of [...lines, ...reversed]) {
        const delta = line.side === "DEBIT" ? line.amount : line.amount.negated();
        accountBalance.set(line.ledgerAccountId, (accountBalance.get(line.ledgerAccountId) ?? new Decimal(0)).plus(delta));
      }
      for (const balance of accountBalance.values()) expect(balance.isZero(), `case ${index}`).toBe(true);
      if (kind === "TRANSFER") expect(lines.every((line) => line.ledgerAccountId !== C)).toBe(true);

      const transported = JSON.parse(JSON.stringify({ amount: amount.toFixed(0) })) as { amount: string };
      expect(parseVnd(transported.amount).eq(amount), `JSON ${index}`).toBe(true);
    }
  });
});
