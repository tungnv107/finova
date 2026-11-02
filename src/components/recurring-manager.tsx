"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatVnd } from "@/lib/money";
import { localDay } from "@/lib/dates";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarClock, CalendarDays, CheckCheck, Clock3, Info, Pause, Pencil, Play, Plus, RefreshCw, X } from "lucide-react";
import { ActionMenu, ContentTabs, SegmentedControl } from "@/components/ui/interaction-controls";
import styles from "./finance-pages.module.css";

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
  const [showCreate, setShowCreate] = useState(false);
  const today = localDay(new Date());
  const activeCount = data.rules.filter(r => !r.paused).length;
  const dueCount = data.occurrences.filter(o => o.status === "PENDING" && o.periodKey <= today).length;
  useEffect(() => { if (showCreate) document.getElementById("rec-name")?.focus(); else if (editingRule) document.getElementById("rec-edit-name")?.focus(); }, [showCreate, editingRule]);
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
    if (result) { setName(""); setAmount(""); setNote(""); setShowCreate(false); setActiveTab("rules"); setMessage("Đã tạo lịch. Các kỳ dự kiến sẽ xuất hiện sau khi đồng bộ."); }
  }

  async function sync() {
    const result = await request("/api/v1/recurring", "PUT");
    if (result) {
      setMessage(`Đã đồng bộ ${result.generated} kỳ, ghi sổ ${result.posted} kỳ; lỗi ${result.errors.length}.`);
      if (result.errors.length) setError(`Có ${result.errors.length} kỳ ghi sổ thất bại. Hãy kiểm tra ví, danh mục và thử đồng bộ lại; nếu vẫn lỗi, liên hệ quản trị viên.`);
    }
  }

  function beginEdit(rule: Rule) {
    setShowCreate(false);
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

  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>CHỦ ĐỘNG MỖI CHU KỲ</span><h1>Giao dịch định kỳ</h1><p>Lên lịch một lần, theo dõi những khoản thu chi lặp lại.</p></div><div className={styles.headerActions}><button disabled={busy} className="button button-outline" onClick={sync}><RefreshCw size={16} /> Đồng bộ đến hạn</button><button type="button" className="button button-primary" disabled={busy || !wallets.length} onClick={() => { setShowCreate(true); setEditingRule(null); setError(""); }}><Plus size={17} /> Lập lịch mới</button></div></header>
    <section className={styles.stats} aria-label="Tổng quan lịch định kỳ"><div className={`${styles.stat} ${styles.accentStat}`}><div className={styles.statTop}><span>Đang hoạt động</span><span className={styles.statIcon}><CalendarClock size={18} /></span></div><strong>{activeCount}</strong><p>Lịch thu, chi và chuyển ví</p></div><div className={styles.stat}><div className={styles.statTop}><span>Đến hạn chờ ghi</span><span className={`${styles.statIcon} ${styles.warning}`}><Clock3 size={18} /></span></div><strong>{dueCount}</strong><p>Các kỳ chờ ghi nhận đã đến hạn</p></div><div className={styles.stat}><div className={styles.statTop}><span>Đang tạm dừng</span><span className={`${styles.statIcon} ${styles.muted}`}><Pause size={18} /></span></div><strong>{data.rules.length - activeCount}</strong><p>Có thể tiếp tục khi bạn cần</p></div></section>
    {!wallets.length && <div className={styles.note}><Info size={16} /><p>Hãy <a className="text-link" href="/wallets">tạo ví</a> trước khi lập lịch.</p></div>}
    {error && <div className="form-error" role="alert">{error}</div>}{message && <p role="status">{message}</p>}
    {showCreate && <form onSubmit={create} className={styles.editor} aria-label="Lập lịch định kỳ mới"><div className={styles.editorHead}><h2>Lập lịch mới</h2><button className={styles.closeButton} type="button" aria-label="Đóng biểu mẫu lập lịch" disabled={busy} onClick={() => setShowCreate(false)}><X size={19} /></button></div><fieldset disabled={busy}>
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
    </fieldset></form>}
    <section className={styles.panel}><div className={styles.panelHead}><div><h2>Lịch của bạn</h2><p>Quản lý quy tắc và theo dõi từng kỳ phát sinh.</p></div><CalendarDays size={20} className={styles.muted} /></div>
    <ContentTabs idBase="recurring" label="Nội dung giao dịch định kỳ" value={activeTab} onChange={setActiveTab} className={styles.tabs} options={[
      { value: "rules", label: `Lịch định kỳ (${data.rules.length})` },
      { value: "pending", label: `Chờ ghi nhận (${data.occurrences.filter(o => o.status === "PENDING").length})` },
      { value: "history", label: "Lịch sử" },
    ]} />
    {activeTab === "rules" && <div role="tabpanel" id="recurring-panel-rules" aria-labelledby="recurring-tab-rules" tabIndex={0} className={styles.tabPanel}>
      {!data.rules.length ? <div className={styles.empty}><span className={styles.emptyIcon}><CalendarClock size={31} /></span><h3>Những khoản quen thuộc, một lịch rõ ràng</h3><p>Tạo lịch cho tiền nhà, lương hoặc khoản tiết kiệm để dễ theo dõi mỗi kỳ.</p><button className="button button-primary" disabled={busy || !wallets.length} onClick={() => setShowCreate(true)}><Plus size={16} />Lập lịch đầu tiên</button></div> : data.rules.map(r => <article key={r.id} className={`${styles.recordRow} ${r.paused ? styles.paused : ""}`}><div className={styles.recordIdentity}><span className={`${styles.rowIcon} ${r.kind === "INCOME" ? styles.income : r.kind === "EXPENSE" ? styles.expense : ""}`}>{r.kind === "INCOME" ? <ArrowDownLeft size={19} /> : r.kind === "EXPENSE" ? <ArrowUpRight size={19} /> : <ArrowLeftRight size={19} />}</span><div><h3>{r.name}</h3><p>{labels[r.kind]} · từ {r.startDate.split("-").reverse().join("/")}{r.endDate ? ` đến ${r.endDate.split("-").reverse().join("/")}` : ""}</p></div></div><div className={styles.recordMeta}><span>{labels[r.frequency]}</span><small>{r.interval > 1 ? `Mỗi ${r.interval} chu kỳ` : "Mỗi chu kỳ"}</small></div><div className={styles.recordAmount}>{formatVnd(r.amount)}<small>Số tiền mỗi kỳ</small></div><span className={`${styles.recordState} ${styles.badge} ${r.paused ? styles.muted : r.mode === "AUTO" ? styles.income : styles.warning}`}>{r.paused ? "Tạm dừng" : r.mode === "AUTO" ? "Tự động" : "Chờ xác nhận"}</span><ActionMenu label={`Thao tác lịch ${r.name}`} disabled={busy} items={[
        { label: "Chỉnh sửa", icon: Pencil, onSelect: () => beginEdit(r) },
        { label: r.paused ? "Tiếp tục" : "Tạm dừng", icon: r.paused ? Play : Pause, onSelect: () => request(`/api/v1/recurring/${r.id}`, "PATCH", { paused: !r.paused }) },
      ]} /></article>)}
      {editingRule && <form onSubmit={saveRule} className={`${styles.editor} ${styles.inlineEditor}`} aria-label="Chỉnh sửa lịch định kỳ"><h3 className="section-title">Chỉnh sửa lịch định kỳ</h3><p className="section-subtitle">Có thể đổi tên và ngày kết thúc. Những kỳ đã ghi sổ không thay đổi; để đổi số tiền hoặc chu kỳ, hãy tạm dừng lịch cũ và tạo lịch mới.</p><div className="form-grid"><div className="field"><label htmlFor="rec-edit-name">Tên lịch</label><input id="rec-edit-name" required maxLength={100} value={editName} onChange={e => setEditName(e.target.value)} /></div><div className="field"><label htmlFor="rec-edit-end">Ngày kết thúc (tùy chọn)</label><input id="rec-edit-end" type="date" min={editingRule.startDate} value={editEndDate} onChange={e => setEditEndDate(e.target.value)} /></div></div><div className="form-footer"><button type="button" className="button button-outline" disabled={busy} onClick={() => setEditingRule(null)}>Hủy</button><button type="submit" className="button button-primary" disabled={busy}>Lưu thay đổi</button></div></form>}
    </div>}
    {activeTab !== "rules" && <section role="tabpanel" id={`recurring-panel-${activeTab}`} aria-labelledby={`recurring-tab-${activeTab}`} tabIndex={0} className={styles.tabPanel}><div className={styles.panelHead}><div><h2>{activeTab === "pending" ? "Các kỳ chờ ghi nhận" : "Lịch sử kỳ định kỳ"}</h2><p>Tối đa 250 kỳ gần nhất. Kỳ tương lai chỉ được ghi sổ khi đến hạn.</p></div></div>
      {!shownOccurrences.length ? <div className={styles.empty}><span className={styles.emptyIcon}>{activeTab === "pending" ? <Clock3 size={29} /> : <CheckCheck size={29} />}</span><h3>Chưa có kỳ nào trong nhóm này</h3><p>Các kỳ phát sinh sẽ xuất hiện khi lịch được đồng bộ.</p></div> : shownOccurrences.map(o => <article key={o.id} className={`${styles.recordRow} ${styles.occurrenceRow}`}><div className={styles.recordIdentity}><span className={styles.dateTile}>{o.periodKey.slice(8)}<small>{o.periodKey.slice(5, 7)}/{o.periodKey.slice(0, 4)}</small></span><div><h3>{o.rule.name}</h3><p>{labels[o.rule.kind]} · {o.rule.mode === "AUTO" ? "Tự ghi sổ" : "Chờ xác nhận"}</p></div></div><strong className={styles.recordAmount}>{formatVnd(o.rule.amount)}</strong><span className={`${styles.recordState} ${styles.badge} ${o.status === "POSTED" ? styles.income : o.status === "PENDING" ? styles.warning : styles.muted}`}>{labels[o.status] ?? o.status}</span><div className={styles.rowActions}>{o.status === "PENDING" ? <>{o.periodKey <= today && <button className="button button-primary" disabled={busy} onClick={() => request(`/api/v1/recurring/${o.id}/confirm`, "POST")}>Ghi nhận</button>}<ActionMenu label={`Thao tác kỳ ${o.periodKey}`} disabled={busy} items={[{ label: "Bỏ qua", danger: true, onSelect: () => request(`/api/v1/recurring/${o.id}/skip`, "POST") }]} /></> : o.transactionId ? <a href={`/transactions?transactionId=${encodeURIComponent(o.transactionId)}`} className="text-link">Xem giao dịch</a> : null}</div></article>)}
    </section>}
    </section><p className={styles.footnote}><Info size={14} />Số tiền dự kiến chỉ xuất hiện trong báo cáo thu chi sau khi kỳ được ghi sổ.</p>
  </div>;
}
