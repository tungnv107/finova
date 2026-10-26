"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminAccessForm({ userId, currentStatus }: { userId: string; currentStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === currentStatus || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/access`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? "Không thể cập nhật trạng thái.");
      setReason(""); setMessage("Đã cập nhật trạng thái và ghi nhật ký quản trị.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally { setBusy(false); }
  }
  return <form onSubmit={onSubmit} className="admin-access-form">
    <div className="field"><label htmlFor="access-status">Trạng thái truy cập</label><select id="access-status" value={status} onChange={e => setStatus(e.target.value)}>
      <option value="ACTIVE">Hoạt động</option><option value="SUSPENDED">Tạm khóa</option><option value="DEACTIVATED">Ngừng hoạt động</option>
    </select></div>
    <div className="field"><label htmlFor="access-reason">Lý do (bắt buộc, 10–500 ký tự)</label>
      <textarea id="access-reason" value={reason} onChange={e => setReason(e.target.value)} minLength={10} maxLength={500} required placeholder="Nêu căn cứ thay đổi để lưu audit" /></div>
    <button type="submit" className="button button-primary" disabled={busy || status === currentStatus || reason.trim().length < 10}>
      {busy ? "Đang cập nhật…" : "Lưu trạng thái"}</button>
    {message && <p role="status" className="section-subtitle">{message}</p>}
    <p className="section-subtitle">Thao tác nhạy cảm: cần phiên đăng nhập Google mới trong 5 phút. Nếu nhận thông báo yêu cầu xác thực lại, hãy đăng xuất và đăng nhập lại trước khi lưu. Khi khóa tài khoản, mọi phiên đăng nhập của người bị khóa sẽ bị thu hồi; mở khóa không tự đăng nhập lại.</p>
  </form>;
}
