"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { formatVnd, premiumPeriodOptions, type PublishedPrice } from "@/modules/billing/subscription-view";

export function PremiumRegistrationForm({ prices, disabled = false }: { prices: ReadonlyArray<PublishedPrice>; disabled?: boolean }) {
  const router = useRouter();
  const options = premiumPeriodOptions(prices);
  const [period, setPeriod] = useState<"MONTH" | "YEAR">("MONTH");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const key = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true); setMessage("");
    try {
      key.current ??= crypto.randomUUID();
      const result = await fetch("/api/v1/me/premium-registrations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, idempotencyKey: key.current }),
      });
      const response = await result.json();
      if (!result.ok) throw new Error(response?.error?.message ?? "Không gửi được đăng ký.");
      key.current = null;
      setMessage("Đã gửi yêu cầu. Super Admin sẽ xem xét và phản hồi trạng thái tại đây.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không gửi được đăng ký."); }
    finally { setBusy(false); }
  }

  return <form className="premium-registration-form" onSubmit={submit}>
    <div className="field"><label htmlFor="premium-register-period">Kỳ hạn mong muốn</label>
      <select id="premium-register-period" value={period} disabled={busy || disabled}
        onChange={event => { setPeriod(event.target.value as "MONTH" | "YEAR"); key.current = null; }}>
        {options.map(option => <option key={option.productCode} value={option.billingPeriod}>
          {option.billingPeriod === "MONTH" ? "1 tháng" : "1 năm"}
          {option.priceId ? ` · ${formatVnd(option.priceVnd)} VNĐ (giá công bố)` : " · chưa công bố giá"}
        </option>)}
      </select></div>
    <button type="submit" className="button button-primary" disabled={busy || disabled}>
      {busy ? "Đang gửi…" : disabled ? "Đang chờ xét duyệt" : "Gửi đăng ký Premium"}
    </button>
    {message && <p role="status" className="section-subtitle">{message}</p>}
  </form>;
}
