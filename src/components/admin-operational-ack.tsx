"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminOperationalAck({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function acknowledge() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/admin/billing/operations/" + encodeURIComponent(id) + "/ack", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Không xác nhận được cảnh báo.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }
  return <div>
    <button type="button" className="button button-outline" disabled={busy} onClick={() => void acknowledge()}>
      {busy ? "Đang xác nhận…" : "Xác nhận đã nhận"}
    </button>
    {error && <p role="alert" className="section-subtitle">{error}</p>}
  </div>;
}
