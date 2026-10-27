"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ClipboardCheck, RotateCcw } from "lucide-react";

async function sendAction(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? "Không gửi được yêu cầu điều chỉnh gói.");
  return result;
}

export function AdminManualGrantForm({ userId }: { userId: string }) {
  const router = useRouter();
  const idempotency = useRef<string | null>(null);
  const [period, setPeriod] = useState<"MONTH" | "YEAR">("MONTH");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      idempotency.current ??= crypto.randomUUID();
      await sendAction(`/api/v1/admin/users/${encodeURIComponent(userId)}/subscription/grants`, {
        period, reason, idempotencyKey: idempotency.current,
      });
      idempotency.current = null;
      setReason(""); setMessage("Đã gửi yêu cầu. Premium chỉ được cấp sau khi quản trị cấp cao khác phê duyệt.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không gửi được yêu cầu."); }
    finally { setBusy(false); }
  }
  return <form className="admin-access-form" onSubmit={submit}>
    <div className="field"><label htmlFor="manual-period">Thời hạn cấp bù</label>
      <select id="manual-period" value={period} onChange={e => { setPeriod(e.target.value as "MONTH" | "YEAR"); idempotency.current = null; }}>
        <option value="MONTH">1 tháng lịch</option><option value="YEAR">1 năm lịch</option>
      </select></div>
    <div className="field"><label htmlFor="manual-reason">Lý do cấp bù (12–500 ký tự)</label>
      <textarea id="manual-reason" minLength={12} maxLength={500} required value={reason}
        onChange={e => { setReason(e.target.value); idempotency.current = null; }} /></div>
    <button className="button button-primary" disabled={busy || reason.trim().length < 12} type="submit">
      {busy ? "Đang gửi…" : "Đề xuất cấp Premium"}</button>
    {message && <p role="status" className="section-subtitle">{message}</p>}
    <p className="section-subtitle">Cấp bù không ghi doanh thu và luôn cần người thứ hai phê duyệt.</p>
  </form>;
}

export function AdminManualRevoke({ grantId }: { grantId: string }) {
  const router = useRouter();
  const idempotency = useRef<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage("");
    try {
      idempotency.current ??= crypto.randomUUID();
      await sendAction(`/api/v1/admin/subscriptions/${encodeURIComponent(grantId)}/revoke`, {
        reason, idempotencyKey: idempotency.current,
      });
      idempotency.current = null; setExpanded(false); setReason("");
      setMessage("Đã đề xuất thu hồi. Quyền chỉ thay đổi khi được duyệt."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không gửi được đề xuất."); }
    finally { setBusy(false); }
  }
  return <div>
    {!expanded ? <button type="button" className="v4-secondary-text-button" onClick={() => setExpanded(true)}>
      <RotateCcw size={16} aria-hidden="true" />Đề xuất thu hồi</button> :
      <form onSubmit={submit} className="admin-access-form">
        <label htmlFor={`revoke-${grantId}`}>Lý do thu hồi (12–500 ký tự)</label>
        <textarea id={`revoke-${grantId}`} minLength={12} maxLength={500} required value={reason}
          onChange={e => { setReason(e.target.value); idempotency.current = null; }} />
        <button type="submit" className="button button-primary" disabled={busy || reason.trim().length < 12}>{busy ? "Đang gửi…" : "Gửi đề xuất"}</button>
        <button type="button" className="v4-secondary-text-button" onClick={() => setExpanded(false)}>Hủy</button>
      </form>}
    {message && <p role="status" className="section-subtitle">{message}</p>}
  </div>;
}

export function AdminSubscriptionDecision({ id, canReview }: { id: string; canReview: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [pendingDecision, setPendingDecision] = useState<"APPROVE" | "REJECT" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function decide(decision: "APPROVE" | "REJECT") {
    if (busy || !canReview) return;
    setBusy(true); setMessage("");
    try {
      await sendAction(`/api/v1/admin/subscriptions/actions/${encodeURIComponent(id)}/decision`, { decision, reason });
      setReason(""); setPendingDecision(null); setExpanded(false); router.refresh();
      setMessage(decision === "APPROVE" ? "Đã phê duyệt và ghi lịch sử cấp quyền." : "Đã từ chối và ghi nhật ký.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không xử lý được yêu cầu."); }
    finally { setBusy(false); }
  }
  if (!canReview) return <span className="section-subtitle">Cần SUPER_ADMIN khác xem xét</span>;
  if (!expanded) return <button className="v4-admin-record-link" type="button" onClick={() => setExpanded(true)}>
    <ClipboardCheck size={16} aria-hidden="true" />Xem xét yêu cầu</button>;
  return <div className="admin-access-form v4-decision-form" role="group" aria-label="Đánh giá yêu cầu Premium">
    <label htmlFor={`review-reason-${id}`}>Lý do quyết định</label>
    <textarea id={`review-reason-${id}`} minLength={12} maxLength={500} required value={reason}
      onChange={e => { setReason(e.target.value); setPendingDecision(null); }} disabled={busy} />
    {pendingDecision ? <div className="v4-decision-confirm" role="group" aria-label="Xác nhận quyết định Premium">
      <p><strong>{pendingDecision === "APPROVE" ? "Xác nhận phê duyệt Premium?" : "Xác nhận từ chối yêu cầu?"}</strong></p>
      <p className="section-subtitle">Quyết định và lý do sẽ được lưu nhật ký. Chỉ quản trị viên được phép mới có thể xác nhận.</p>
      <div className="v4-inline-actions"><button className="button button-primary" type="button" disabled={busy || reason.trim().length < 12}
        onClick={() => void decide(pendingDecision)}>{busy ? "Đang xử lý…" : "Xác nhận quyết định"}</button>
        <button className="v4-secondary-text-button" type="button" disabled={busy} onClick={() => setPendingDecision(null)}>Quay lại</button></div>
    </div> : <div className="v4-inline-actions">
      <button className="button button-primary" type="button" disabled={busy || reason.trim().length < 12} onClick={() => setPendingDecision("APPROVE")}>Phê duyệt</button>
      <button className="v4-secondary-text-button" type="button" disabled={busy || reason.trim().length < 12} onClick={() => setPendingDecision("REJECT")}>Từ chối</button>
      <button className="v4-secondary-text-button" type="button" disabled={busy} onClick={() => { setPendingDecision(null); setExpanded(false); }}>Đóng</button>
    </div>}
    {message && <p role="status" className="section-subtitle">{message}</p>}
  </div>;
}
