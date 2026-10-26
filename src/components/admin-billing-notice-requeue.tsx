"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminBillingNoticeRequeue({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || reason.trim().length < 12) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/billing/notices/${encodeURIComponent(id)}/requeue`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? "Không thể đưa vào hàng đợi.");
      setReason(""); setMessage("Đã ghi nhật ký và đưa thông báo vào hàng đợi xử lý lại.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi khi xử lý.");
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="admin-access-form">
    <label htmlFor={`reason-${id}`}>Lý do mở lại hàng đợi</label>
    <textarea id={`reason-${id}`} value={reason} onChange={event => setReason(event.target.value)}
      required minLength={12} maxLength={500} placeholder="Ghi rõ kết quả điều tra lỗi" />
    <button className="button button-outline" type="submit" disabled={busy || reason.trim().length < 12}>
      {busy ? "Đang xử lý…" : "Đưa vào hàng đợi"}</button>
    {message && <p role="status" className="section-subtitle">{message}</p>}
  </form>;
}
