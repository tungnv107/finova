"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PremiumCheckoutButton({ priceId, available, children }: {
  priceId: string | null; available: boolean; children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function checkout() {
    if (!priceId || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await fetch("/api/v1/billing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ priceId }),
        cache: "no-store",
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error?.message ?? "Không tạo được đơn hàng.");
      router.push(`/billing/checkout/${encodeURIComponent(body.data.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo đơn hàng.");
      setPending(false);
    }
  }
  return <div><button type="button" className="button button-primary" disabled={!available || pending} onClick={checkout}>
    {pending ? "Đang tạo đơn…" : available ? children : "Chưa mở thanh toán"}
  </button>{error && <p role="alert" className="section-subtitle">{error}</p>}</div>;
}
