"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target, AlertTriangle } from "lucide-react";
import { formatVnd } from "@/lib/money";
import type { listGoals } from "@/server/goals";

type Goal = Awaited<ReturnType<typeof listGoals>>[number];
type Wallet = { id: string; name: string; balance: string };

export function GoalsManager({ goals, wallets }: { goals: Goal[]; wallets: Wallet[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", walletId: wallets[0]?.id ?? "", target: "", dueDate: "" });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function request(url: string, method: "POST" | "PATCH", body: object, key?: string) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Không thể lưu thay đổi.");
    return payload.data;
  }
  function begin(g?: Goal) {
    setEditing(g?.id ?? null); setOpen(true); setError(""); setSuccess("");
    setForm(g ? { name: g.name, walletId: g.walletId, target: g.target, dueDate: g.dueDate ?? "" }
      : { name: "", walletId: wallets[0]?.id ?? "", target: "", dueDate: "" });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await request(editing ? `/api/v1/goals/${editing}` : "/api/v1/goals", editing ? "PATCH" : "POST", { ...form, dueDate: form.dueDate || null });
      setOpen(false); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  async function archive(g: Goal) {
    setBusy(true); setError(""); setSuccess("");
    try { await request(`/api/v1/goals/${g.id}`, "PATCH", { archived: !g.archived }); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  async function allocate(g: Goal, kind: "ALLOCATE" | "RELEASE") {
    setBusy(true); setError(""); setSuccess("");
    try {
      await request(`/api/v1/goals/${g.id}/allocations`, "POST", { kind, amount: amounts[g.id] ?? "" }, crypto.randomUUID());
      setAmounts(v => ({ ...v, [g.id]: "" }));
      setSuccess(kind === "ALLOCATE" ? "Đã dành tiền trong ví cho mục tiêu." : "Đã rút số tiền phân bổ.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-head feature-page-head"><div><h1 className="page-title">Mục tiêu tiết kiệm</h1><p className="subtitle">Lập mục tiêu và phân bổ từ số dư ví thực tế.</p></div>
      <button className="button button-primary" disabled={busy || !wallets.length} onClick={() => begin()}><Plus /> Tạo mục tiêu</button></div>
    <section className="module-overview" aria-label="Tổng quan mục tiêu"><div className="module-overview-copy"><span className="module-overview-eyebrow">TÍCH LŨY CÓ MỤC ĐÍCH</span><strong>Mỗi mục tiêu, một bước tiến</strong><span>Theo dõi phân bổ từ các ví hiện có.</span></div><div className="module-overview-stats"><div><span>Đang tích lũy</span><strong>{goals.filter(g => !g.archived && Number(g.progress) < 100).length}</strong></div><div><span>Đạt mục tiêu</span><strong>{goals.filter(g => !g.archived && Number(g.progress) >= 100).length}</strong></div></div></section>
    <section className="card card-pad module-info-card" style={{ marginBottom: 20 }}>
      <strong>Tiền phân bổ vẫn thuộc ví của bạn.</strong><p className="subtitle" style={{ marginTop: 7 }}>Dành tiền hoặc rút phân bổ chỉ đánh dấu số dư cho mục tiêu, không làm phát sinh thu chi hay tăng tài sản. Chuyển tiền sang ví khác được thực hiện riêng ở trang Giao dịch.</p>
    </section>
    {open && <form className="card card-pad" onSubmit={save} style={{ marginBottom: 20 }}>
      <div className="section-header"><h2 className="section-title">{editing ? "Sửa mục tiêu" : "Mục tiêu mới"}</h2><button type="button" className="button button-outline" onClick={() => setOpen(false)}>Đóng</button></div>
      <div className="form-grid" style={{ marginTop: 18 }}>
        <div className="field"><label htmlFor="goal-name">Tên mục tiêu</label><input id="goal-name" required maxLength={100} placeholder="Ví dụ: Quỹ khẩn cấp" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} /></div>
        <div className="field"><label htmlFor="goal-wallet">Ví liên kết</label><select id="goal-wallet" required value={form.walletId} onChange={e => setForm(v => ({ ...v, walletId: e.target.value }))}>{wallets.map(w => <option key={w.id} value={w.id}>{w.name} · {formatVnd(w.balance)}</option>)}</select></div>
        <div className="field"><label htmlFor="goal-target">Số tiền đích (₫)</label><input id="goal-target" required inputMode="numeric" pattern="[1-9][0-9]*" value={form.target} onChange={e => setForm(v => ({ ...v, target: e.target.value }))} /></div>
        <div className="field"><label htmlFor="goal-due">Ngày hoàn thành (tùy chọn)</label><input id="goal-due" type="date" value={form.dueDate} onChange={e => setForm(v => ({ ...v, dueDate: e.target.value }))} /></div>
      </div>{error && <div role="alert" className="form-error">{error}</div>}
      <div className="form-footer"><button disabled={busy} className="button button-primary">{busy ? "Đang lưu…" : "Lưu mục tiêu"}</button></div>
    </form>}
    {error && !open && <div role="alert" className="form-error" style={{ marginBottom: 18 }}>{error}</div>}
    {success && !open && <div role="status" className="form-success" style={{ marginBottom: 18 }}>{success}</div>}
    {(!wallets.length || !goals.length) && <section className="card card-pad"><div className="empty"><Target /><strong>{!wallets.length ? "Cần tạo ví trước" : "Chưa có mục tiêu"}</strong><span>{!wallets.length ? "Tạo ví để liên kết tiền tiết kiệm." : "Lập mục tiêu đầu tiên để theo dõi tiến độ."}</span></div></section>}
    <div style={{ display: "grid", gap: 16 }}>
      {goals.map(g => <article className={`card card-pad module-record ${g.archived ? "module-record-archived" : ""}`} key={g.id}>
        <div className="section-header"><div><h2 className="section-title">{g.name}</h2><p className="subtitle">Ví: {g.walletName}{g.dueDate ? ` · Hạn ${g.dueDate}` : ""}</p></div><span className="pill">{g.archived ? "Đã lưu trữ" : Number(g.progress) >= 100 ? "Đạt mục tiêu" : "Đang tích lũy"}</span></div>
        <div className="module-amount-row"><div><div className="subtitle">Đã dành</div><strong className="module-primary-amount">{formatVnd(g.allocated)}</strong></div><div><div className="subtitle">Mục tiêu</div><strong>{formatVnd(g.target)}</strong></div><div><div className="subtitle">Còn thiếu</div><strong>{formatVnd(g.remaining)}</strong></div></div>
        <div className="module-progress" role="progressbar" aria-label={`Tiến độ ${g.name}`} aria-valuenow={Math.max(0, Math.min(100, Number(g.progress)))} aria-valuemin={0} aria-valuemax={100}><div className="module-progress-fill" style={{ width: `${Math.max(0, Math.min(100, Number(g.progress)))}%` }} /></div>
        <p className="subtitle" style={{ marginTop: 8 }}>{g.progress}% hoàn thành{g.daysLeft !== null && g.daysLeft > 0 && g.monthlyNeeded ? ` · Ước tính cần ${formatVnd(g.monthlyNeeded)} mỗi 30 ngày` : ""}</p>
        {g.walletUnderfunded && <p role="alert" className="module-alert module-danger-text"><AlertTriangle size={16} /> Ví đang có ít tiền hơn mức phân bổ. Kiểm tra lại sau khi chi tiêu hoặc chuyển tiền.</p>}
        {!g.archived && <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 10, marginTop: 16 }}><div className="field" style={{ flex: "1 1 180px" }}><label htmlFor={`goal-amount-${g.id}`}>Số tiền (₫)</label><input id={`goal-amount-${g.id}`} inputMode="numeric" pattern="[1-9][0-9]*" value={amounts[g.id] ?? ""} onChange={e => setAmounts(v => ({ ...v, [g.id]: e.target.value }))} /></div><button type="button" className="button button-primary" disabled={busy || !amounts[g.id]} onClick={() => allocate(g, "ALLOCATE")}>Dành tiền</button><button type="button" className="button button-outline" disabled={busy || !amounts[g.id]} onClick={() => allocate(g, "RELEASE")}>Rút phân bổ</button></div>}
        <div style={{ display: "flex", gap: 10, marginTop: 17 }}><button type="button" className="button button-outline" disabled={busy} onClick={() => begin(g)}>Sửa</button><button type="button" className="button button-outline" disabled={busy} onClick={() => archive(g)}>{g.archived ? "Khôi phục" : "Lưu trữ"}</button></div>
        {!!g.events.length && <details style={{ marginTop: 15 }}><summary style={{ cursor: "pointer", color: "#1E5EFF" }}>Lịch sử phân bổ ({g.events.length} gần nhất)</summary><div className="table-wrap"><table><thead><tr><th>Ngày giờ</th><th>Nghiệp vụ</th><th>Số tiền</th></tr></thead><tbody>{g.events.map(e => <tr key={e.id}><td>{new Date(e.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td><td>{e.kind === "ALLOCATE" ? "Dành tiền" : "Rút phân bổ"}</td><td>{formatVnd(e.amount)}</td></tr>)}</tbody></table></div></details>}
      </article>)}
    </div>
  </>;
}
