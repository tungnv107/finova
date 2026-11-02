"use client";
import { Mail, MailOpen } from "lucide-react";
import { IconButton } from "@/components/ui/interaction-controls";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Notification = { id: string; title: string; body: string; link: string | null; readAt: Date | null; createdAt: Date };
export function NotificationsManager({ data }: { data: { items: Notification[]; unread: number } }) {
  const router = useRouter();
  const saving = useRef(false);
  const [reads, setReads] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function toggle(id: string, read: boolean) {
    if (saving.current) return;
    saving.current = true; setBusy(id); setError("");
    try {
      const r = await fetch(`/api/v1/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read }) });
      if (!r.ok) { const json = await r.json(); throw new Error(json.error?.message || "Không cập nhật được."); }
      setReads(current => ({ ...current, [id]: read }));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi kết nối."); }
    finally { saving.current = false; setBusy(""); }
  }
  const isRead = (item: Notification) => reads[item.id] ?? Boolean(item.readAt);
  const unread = Math.max(0, data.unread + data.items.reduce((count, item) => count + (isRead(item) ? 0 : 1) - (item.readAt ? 0 : 1), 0));
  return <><div className="page-head feature-page-head"><div><h1 className="page-title">Thông báo</h1><p className="subtitle">{unread} chưa đọc. Nhắc lịch, ngân sách, vay nợ và hạn thẻ.</p></div></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <section className="card card-pad notifications-list">{data.items.length === 0 ? <div className="empty">Chưa có thông báo mới.</div> : data.items.map(n => <article key={n.id} className={`notification-item ${isRead(n) ? "notification-read" : "notification-unread"}`}><div className="notification-heading"><strong>{n.title}</strong>{!isRead(n) && <span className="notification-status">Chưa đọc</span>}</div><p>{n.body}</p><div className="notification-meta"><small>{new Date(n.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</small>{n.link && <a className="text-link" href={n.link}>Xem chi tiết</a>}<IconButton label={`${isRead(n) ? "Đánh dấu chưa đọc" : "Đánh dấu đã đọc"}: ${n.title}`} icon={isRead(n) ? Mail : MailOpen} disabled={Boolean(busy)} onClick={() => toggle(n.id, !isRead(n))} /></div></article>)}</section>
  </>;
}
