"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatVnd } from "@/lib/money";
import { localDay } from "@/lib/dates";
import { Archive, Pencil, Play, RefreshCw } from "lucide-react";
import { ActionMenu, ContentTabs, SegmentedControl } from "@/components/ui/interaction-controls";

type Rule = { id: string; name: string; frequency: string; interval: number; mode: string; kind: string; amount: string; startDate: string; endDate: string | null; paused: boolean };
type Occurrence = { id: string; periodKey: string; status: string; transactionId: string | null; rule: { name: string; kind: string; mode: string; paused: boolean; amount: string } };
type RecurringTab = "rules" | "pending" | "history";
type Props = { data: { rules: Rule[]; occurrences: Occurrence[] }; wallets: { id: string; name: string }[]; categories: { id: string; name: string; kind: string }[]; initialTab?: RecurringTab };
const labels: Record<string, string> = { INCOME: "Thu", EXPENSE: "Chi", TRANSFER: "Chuyển ví", DAILY: "Hằng ngày", WEEKLY: "Hằng tuần", MONTHLY: "Hằng tháng", YEARLY: "Hằng năm", PENDING: "Chờ ghi nhận", POSTED: "Đã ghi sổ", SKIPPED: "Đã bỏ qua", PROCESSING: "Đang xử lý" };

export function RecurringManager({ data, wallets, categories, initialTab = "rules" }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY">("MONTHLY");
  const [interval, setInterval] = useState(1);
  const [mode, setMode] = useState<"CONFIRM" | "AUTO">("CONFIRM");
  const [walletId, setWalletId] = useState(wallets[0]?.id || "");
  const [destinationWalletId, setDestinationWalletId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState(localDay(new Date()));
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [editName, setEditName] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<RecurringTab>(initialTab);
  const shownOccurrences = data.occurrences.filter(o => activeTab === "pending" ? o.status === "PENDING" : o.status !== "PENDING");

  async function request(url: string, method: "POST" | "PATCH" | "PUT", body?: unknown) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Không thực hiện được.");
      router.refresh();
      return result.data;
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); return null; }
    finally { setBusy(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const result = await request("/api/v1/recurring", "POST", { name, frequency, interval, mode, kind, walletId,
      ...(kind === "TRANSFER" ? { destinationWalletId } : { categoryId }), amount, startDate, endDate: endDate || null, note });
    if (result) { setName(""); setAmount(""); setNote(""); setMessage("Đã tạo lịch. Các kỳ dự kiến sẽ xuất hiện sau khi đồng bộ."); }
  }

  async function sync() {
    const result = await request("/api/v1/recurring", "PUT");
    if (result) {
      setMessage(`Đã đồng bộ ${result.generated} kỳ, ghi sổ ${result.posted} kỳ; lỗi ${result.errors.length}.`);
      if (result.errors.length) setError(`Có ${result.errors.length} kỳ ghi sổ thất bại. Hãy kiểm tra ví, danh mục và thử đồng bộ lại; nếu vẫn lỗi, liên hệ quản trị viên.`);
    }
  }

  function beginEdit(rule: Rule) {
    setEditingRule(rule);
    setEditName(rule.name);
    setEditEndDate(rule.endDate || "");
    setError("");
    setMessage("");
  }

  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRule) return;
    const result = await request(`/api/v1/recurring/${editingRule.id}`, "PATCH", {
      name: editName.trim(), endDate: editEndDate || null,
    });
    if (result) {
      setEditingRule(null);
      setMessage("Đã cập nhật lịch. Các kỳ đã ghi sổ được giữ nguyên.");
    }
  }

  return <>
    <div className="page-head feature-page-head"><div><h1 className="page-title">Giao dịch định kỳ</h1><p className="subtitle">Lập lịch thu, chi và chuyển ví. Số tiền dự kiến chỉ vào báo cáo thực tế sau khi ghi sổ.</p></div><button disabled={busy} className="button button-outline" onClick={sync}><RefreshCw size={17} aria-hidden="true" /> Đồng bộ kỳ đến hạn</button></div>
    {!wallets.length && <div className="card card-pad">Hãy <a className="text-link" href="/wallets">tạo ví</a> trước khi lập lịch.</div>}
    {error && <div className="form-error" role="alert">{error}</div>}{message && <p role="status">{message}</p>}
    <ContentTabs idBase="recurring" label="Nội dung giao dịch định kỳ" value={activeTab} onChange={setActiveTab} options={[
      { value: "rules", label: `Lịch định kỳ (${data.rules.length})` },
      { value: "pending", label: `Chờ ghi nhận (${data.occurrences.filter(o => o.status === "PENDING").length})` },
      { value: "history", label: "Lịch sử" },
    ]} />
    {activeTab === "rules" && <div role="tabpanel" id="recurring-panel-rules" aria-labelledby="recurring-tab-rules" tabIndex={0} className="v4-tab-panel">
    <form onSubmit={create} className="card card-pad" style={{ marginBottom: 22 }}>
      <h2 className="section-title">Lập lịch mới</h2>
      <div className="form-grid" style={{ marginTop: 18 }}>
        <div className="field"><label htmlFor="rec-name">Tên lịch</label><input id="rec-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><span className="v4-field-label">Loại</span><SegmentedControl label="Loại giao dịch định kỳ" value={kind} onChange={next => { setKind(next); setCategoryId(""); }} options={[
          { value: "EXPENSE", label: "Chi" }, { value: "INCOME", label: "Thu" }, { value: "TRANSFER", label: "Chuyển ví" },
        ]} /></div>
        <div className="field"><label htmlFor="rec-wallet">Ví nguồn</label><select id="rec-wallet" required value={walletId} onChange={e => setWalletId(e.target.value)}>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        {kind === "TRANSFER" ? <div className="field"><label htmlFor="rec-dest">Ví đích</label><select id="rec-dest" required value={destinationWalletId} onChange={e => setDestinationWalletId(e.target.value)}><option value="">Chọn ví</option>{wallets.filter(w => w.id !== walletId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div> : <div className="field"><label htmlFor="rec-category">Danh mục</label><select id="rec-category" required value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Chọn danh mục</option>{categories.filter(c => c.kind === kind).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        <div className="field"><label htmlFor="rec-amount">Số tiền VND</label><input id="rec-amount" required inputMode="numeric" pattern="[1-9][0-9]*" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <div className="field"><label htmlFor="rec-frequency">Chu kỳ</label><select id="rec-frequency" value={frequency} onChange={e => setFrequency(e.target.value as typeof frequency)}>{["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].map(f => <option key={f} value={f}>{labels[f]}</option>)}</select></div>
        <div className="field"><label htmlFor="rec-interval">Mỗi bao nhiêu chu kỳ</label><input id="rec-interval" type="number" min={1} max={365} value={interval} onChange={e => setInterval(Number(e.target.value))} required /></div>
        <div className="field"><label htmlFor="rec-mode">Chế độ</label><select id="rec-mode" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="CONFIRM">Chờ xác nhận</option><option value="AUTO">Tự ghi sổ khi đến hạn</option></select></div>
        <div className="field"><label htmlFor="rec-start">Bắt đầu</label><input id="rec-start" type="date" value={startDate} required onChange={e => setStartDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="rec-end">Kết thúc (tùy chọn)</label><input id="rec-end" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="rec-note">Ghi chú</label><input id="rec-note" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></div>
      </div>
      <div className="form-footer"><button className="button button-primary" type="submit" disabled={busy || !wallets.length}>Tạo lịch định kỳ</button></div>
    </form>
    <section className="card card-pad module-record" style={{ marginBottom: 22 }}><h2 className="section-title">Quy tắc ({data.rules.length})</h2>
      {!data.rules.length ? <p className="empty">Chưa có lịch nào.</p> : <>
        <div className="table-wrap recurring-desktop-table"><table><thead><tr><th>Lịch</th><th>Chu kỳ</th><th>Số tiền</th><th>Chế độ</th><th>Thao tác</th></tr></thead><tbody>{data.rules.map(r => <tr key={r.id}><td><strong>{r.name}</strong><div>{labels[r.kind]} · từ {r.startDate}{r.endDate ? ` đến ${r.endDate}` : ""}</div></td><td>{labels[r.frequency]}{r.interval > 1 ? ` / ${r.interval}` : ""}</td><td>{formatVnd(r.amount)}</td><td>{r.mode === "AUTO" ? "Tự động" : "Xác nhận"}</td><td><ActionMenu label={`Thao tác lịch ${r.name}`} disabled={busy} items={[
          { label: "Chỉnh sửa", icon: Pencil, onSelect: () => beginEdit(r) },
          { label: r.paused ? "Tiếp tục" : "Tạm dừng", icon: r.paused ? Play : Archive, onSelect: () => request(`/api/v1/recurring/${r.id}`, "PATCH", { paused: !r.paused }) },
        ]} /></td></tr>)}</tbody></table></div>
        <div className="recurring-mobile-list">{data.rules.map(r => <article key={r.id} className="recurring-mobile-card"><div className="recurring-mobile-card-head"><div><span className="section-subtitle">{labels[r.kind]} · {labels[r.frequency]}{r.interval > 1 ? ` / ${r.interval}` : ""}</span><h3>{r.name}</h3></div><span className="pill">{r.paused ? "Tạm dừng" : r.mode === "AUTO" ? "Tự động" : "Xác nhận"}</span></div><strong className="recurring-mobile-amount">{formatVnd(r.amount)}</strong><p className="section-subtitle">Từ {r.startDate}{r.endDate ? ` đến ${r.endDate}` : ""}</p><div className="finance-actions"><ActionMenu label={`Thao tác lịch ${r.name}`} disabled={busy} items={[
          { label: "Chỉnh sửa", icon: Pencil, onSelect: () => beginEdit(r) },
          { label: r.paused ? "Tiếp tục" : "Tạm dừng", icon: r.paused ? Play : Archive, onSelect: () => request(`/api/v1/recurring/${r.id}`, "PATCH", { paused: !r.paused }) },
        ]} /></div></article>)}</div>
      </>}
      {editingRule && <form onSubmit={saveRule} style={{ marginTop: 18 }} aria-label="Chỉnh sửa lịch định kỳ"><h3 className="section-title">Chỉnh sửa lịch định kỳ</h3><p className="section-subtitle">Có thể đổi tên và ngày kết thúc. Những kỳ đã ghi sổ không thay đổi; để đổi số tiền hoặc chu kỳ, hãy tạm dừng lịch cũ và tạo lịch mới.</p><div className="form-grid"><div className="field"><label htmlFor="rec-edit-name">Tên lịch</label><input id="rec-edit-name" required maxLength={100} value={editName} onChange={e => setEditName(e.target.value)} /></div><div className="field"><label htmlFor="rec-edit-end">Ngày kết thúc (tùy chọn)</label><input id="rec-edit-end" type="date" min={editingRule.startDate} value={editEndDate} onChange={e => setEditEndDate(e.target.value)} /></div></div><div className="form-footer"><button type="button" className="button button-outline" disabled={busy} onClick={() => setEditingRule(null)}>Hủy</button><button type="submit" className="button button-primary" disabled={busy}>Lưu thay đổi</button></div></form>}
    </section></div>}
    {activeTab !== "rules" && <section role="tabpanel" id={`recurring-panel-${activeTab}`} aria-labelledby={`recurring-tab-${activeTab}`} tabIndex={0} className="card card-pad module-record v4-tab-panel"><h2 className="section-title">{activeTab === "pending" ? "Các kỳ chờ ghi nhận" : "Lịch sử kỳ định kỳ"}</h2><p className="section-subtitle">Tối đa 250 kỳ gần nhất. Kỳ trong tương lai không thể ghi sổ trước hạn.</p>
      {!shownOccurrences.length ? <p className="empty">Chưa có kỳ nào trong nhóm này.</p> : <>
        <div className="table-wrap recurring-desktop-table"><table><thead><tr><th>Ngày</th><th>Lịch</th><th>Số tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{shownOccurrences.map(o => <tr key={o.id}><td>{o.periodKey}</td><td>{o.rule.name}</td><td>{formatVnd(o.rule.amount)}</td><td>{labels[o.status]}</td><td>{o.status === "PENDING" ? <div className="finance-actions">{o.periodKey <= localDay(new Date()) && <button className="button button-primary" disabled={busy} onClick={() => request(`/api/v1/recurring/${o.id}/confirm`, "POST")}>Ghi nhận</button>}<ActionMenu label={`Thao tác kỳ ${o.periodKey}`} disabled={busy} items={[{ label: "Bỏ qua", danger: true, onSelect: () => request(`/api/v1/recurring/${o.id}/skip`, "POST") }]} /></div> : o.transactionId ? <a href={`/transactions?transactionId=${encodeURIComponent(o.transactionId)}`} className="text-link">Xem giao dịch</a> : "—"}</td></tr>)}</tbody></table></div>
        <div className="recurring-mobile-list">{shownOccurrences.map(o => <article key={o.id} className="recurring-mobile-card"><div className="recurring-mobile-card-head"><div><span className="section-subtitle">{o.periodKey}</span><h3>{o.rule.name}</h3></div><span className="pill">{labels[o.status] ?? o.status}</span></div><strong className="recurring-mobile-amount">{formatVnd(o.rule.amount)}</strong><div className="finance-actions">{o.status === "PENDING" ? <>{o.periodKey <= localDay(new Date()) && <button className="button button-primary" disabled={busy} onClick={() => request(`/api/v1/recurring/${o.id}/confirm`, "POST")}>Ghi nhận</button>}<ActionMenu label={`Thao tác kỳ ${o.periodKey}`} disabled={busy} items={[{ label: "Bỏ qua", danger: true, onSelect: () => request(`/api/v1/recurring/${o.id}/skip`, "POST") }]} /></> : o.transactionId ? <a href={`/transactions?transactionId=${encodeURIComponent(o.transactionId)}`} className="text-link">Xem giao dịch</a> : null}</div></article>)}</div>
      </>}
    </section>}
  </>;
}
