"use client";

import { useState } from "react";

export function CopyPaymentButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Đã sao chép");
    } catch {
      setStatus("Không thể sao chép tự động. Vui lòng chọn và sao chép nội dung phía trên.");
    }
  }
  return <span className="copy-payment-wrap">
    <button type="button" className="button button-outline" aria-label={`Sao chép ${label}`} onClick={() => void copy()}>Sao chép</button>
    <span className="section-subtitle" role="status" aria-live="polite">{status}</span>
  </span>;
}
