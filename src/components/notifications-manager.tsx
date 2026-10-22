"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Notification = { id: string; title: string; body: string; link: string | null; readAt: Date | null; createdAt: Date };
export function NotificationsManager({ data }: { data: { items: Notification[]; unread: number } }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function toggle(id: string, read: boolean) {
    setBusy(id); setError("");
    try {
      const r = await fetch(`/api/v1/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read }) });
      if (!r.ok) { const json = await r.json(); throw new Error(json.error?.message || "Không cập nhật được."); }
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi kết nối."); }
    finally { setBusy(""); }
  }
  return <><div className="page-head feature-page-head"><div><h1 className="page-title">Thông báo</h1><p className="subtitle">{data.unread} chưa đọc. Nhắc lịch, ngân sách, vay nợ và hạn thẻ.</p></div></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <section className="card card-pad notifications-list">{data.items.length === 0 ? <div className="empty">Chưa có thông báo mới.</div> : data.items.map(n => <article key={n.id} className={`notification-item ${n.readAt ? "notification-read" : ""}`}><strong>{n.title}</strong><p>{n.body}</p><div className="notification-meta"><small>{new Date(n.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</small>{n.link && <a className="text-link" href={n.link}>Xem chi tiết</a>}<button className="button button-outline" disabled={busy === n.id} onClick={() => toggle(n.id, !n.readAt)}>{n.readAt ? "Đánh dấu chưa đọc" : "Đã đọc"}</button></div></article>)}</section>
  </>;
}
