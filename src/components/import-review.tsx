"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Check, CheckCheck, Download, FileCheck2, Pencil, Trash2 } from "lucide-react";
import { Decimal, formatVnd } from "@/lib/money";
import { localDay } from "@/lib/dates";
import type { getImport } from "@/server/imports";
import { IconButton, StatusBadge } from "@/components/ui/interaction-controls";
import styles from "./statement-import.module.css";

export type ImportBatch = Awaited<ReturnType<typeof getImport>> & { warnings?: string[] };
export type ImportWallet = { id: string; name: string };
export type ImportCategory = ImportWallet & { kind: string };
type Row = ImportBatch["rows"][number];
export async function importResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Không xử lý được yêu cầu.");
  return result.data;
}
const statusNames: Record<string, string> = { VALID: "Sẵn sàng", INVALID: "Cần kiểm tra", DUPLICATE: "Trùng giao dịch", IMPORTED: "Đã nhập", FAILED: "Nhập thất bại" };
type Filter = "ALL" | "REVIEW" | "VALID" | "IMPORTED" | "DUPLICATE";

function RowEditor({ row, wallets, categories, busy, onSave, onCancel }: {
  row: Row; wallets: ImportWallet[]; categories: ImportCategory[]; busy: boolean;
  onSave: (input: Record<string, unknown>) => Promise<void>; onCancel: () => void;
}) {
  const [kind, setKind] = useState(row.kind || "EXPENSE"), [amount, setAmount] = useState(row.amount || ""), [date, setDate] = useState(row.date || "");
  const [categoryId, setCategory] = useState(row.categoryId || ""), [destinationWalletId, setDestination] = useState(row.destinationWalletId || ""), [note, setNote] = useState(row.note || "");
  return <form className={styles.editor} onSubmit={e => { e.preventDefault(); void onSave({ kind, amount, date, note, categoryId: kind === "TRANSFER" ? null : categoryId || null, destinationWalletId: kind === "TRANSFER" ? destinationWalletId || null : null, confirmed: true }); }}>
    <fieldset disabled={busy}><legend>Kiểm tra giao dịch · Dòng {row.rowNumber}</legend><div className={styles.editorGrid}>
      <div className="field"><label htmlFor={`review-date-${row.id}`}>Ngày giao dịch</label><input id={`review-date-${row.id}`} type="date" max={localDay(new Date())} required value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="field"><label htmlFor={`review-amount-${row.id}`}>Số tiền (VND)</label><input id={`review-amount-${row.id}`} required inputMode="numeric" pattern="[1-9][0-9]{0,15}" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="field"><label htmlFor={`review-kind-${row.id}`}>Loại giao dịch</label><select id={`review-kind-${row.id}`} value={kind} onChange={e => { setKind(e.target.value as typeof kind); setCategory(""); setDestination(""); }}><option value="INCOME">Thu nhập</option><option value="EXPENSE">Chi tiêu</option><option value="TRANSFER">Chuyển giữa ví</option></select></div>
      {kind === "TRANSFER" ? <div className="field"><label htmlFor={`review-dest-${row.id}`}>Ví nhận</label><select id={`review-dest-${row.id}`} required value={destinationWalletId} onChange={e => setDestination(e.target.value)}><option value="">Chọn ví nhận</option>{wallets.filter(w => w.id !== row.walletId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div> : <div className="field"><label htmlFor={`review-category-${row.id}`}>Danh mục</label><select id={`review-category-${row.id}`} required value={categoryId} onChange={e => setCategory(e.target.value)}><option value="">Chọn danh mục</option>{categories.filter(c => c.kind === kind).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      <div className={`field ${styles.editorNote}`}><label htmlFor={`review-note-${row.id}`}>Nội dung giao dịch</label><textarea id={`review-note-${row.id}`} rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></div>
    </div><div className={styles.editorFooter}><span>Lưu để đưa dòng này vào danh sách sẵn sàng nhập.</span><button type="button" className="button button-outline" onClick={onCancel}>Hủy</button><button type="submit" className="button button-primary"><Check size={16} />{busy ? "Đang lưu…" : "Lưu & xác nhận"}</button></div></fieldset>
  </form>;
}

export function ImportReview({ batch, wallets, categories, onChange, onLockedChange }: {
  batch: ImportBatch; wallets: ImportWallet[]; categories: ImportCategory[];
  onChange: (batch: ImportBatch) => void; onLockedChange: (locked: boolean) => void;
}) {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null), [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const count = (status: string) => batch.counts[status] || 0;
  const reviewCount = count("INVALID") + count("FAILED");
  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "ALL", label: "Tất cả", count: batch.total }, { value: "REVIEW", label: "Cần kiểm tra", count: reviewCount },
    { value: "VALID", label: "Sẵn sàng", count: count("VALID") }, { value: "IMPORTED", label: "Đã nhập", count: count("IMPORTED") }, { value: "DUPLICATE", label: "Trùng", count: count("DUPLICATE") },
  ];
  const rows = batch.rows.filter(row => filter === "ALL" || (filter === "REVIEW" ? ["INVALID", "FAILED"].includes(row.status) : row.status === filter));
  const total = (kind: string) => formatVnd(batch.rows.filter(r => r.kind === kind && r.status !== "DUPLICATE").reduce((sum, r) => sum.plus(r.amount || "0"), new Decimal(0)).toFixed(0));
  function edit(id: string | null) { setEditingId(id); setDeletingId(null); onLockedChange(id !== null); }
  async function mutate(action: () => Promise<void>, success: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onLockedChange(true); setError(""); setMessage("");
    let succeeded = false;
    try { await action(); succeeded = true; setEditingId(null); setDeletingId(null); setMessage(success); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối. Hãy thử lại."); }
    finally { lock.current = false; setBusy(false); onLockedChange(!succeeded && Boolean(editingId || deletingId)); }
  }
  async function updateRow(row: Row, input: Record<string, unknown>) {
    await mutate(async () => {
      await importResponse(await fetch(`/api/v1/imports/${batch.id}/rows/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
      onChange(await importResponse(await fetch(`/api/v1/imports/${batch.id}`, { cache: "no-store" })));
      onLockedChange(false);
    }, `Đã xác nhận dòng ${row.rowNumber}. Bạn có thể nhập các dòng sẵn sàng vào ví.`);
  }
  async function confirm(row: Row) {
    const complete = row.kind && row.date && row.amount && (row.kind === "TRANSFER" ? wallets.some(w => w.id === row.destinationWalletId && w.id !== row.walletId) : categories.some(c => c.id === row.categoryId && c.kind === row.kind));
    if (!complete) { edit(row.id); return; }
    await updateRow(row, { kind: row.kind, amount: row.amount, date: row.date, note: row.note || "", categoryId: row.categoryId, destinationWalletId: row.destinationWalletId, confirmed: true });
  }
  async function remove(row: Row) {
    await mutate(async () => {
      await importResponse(await fetch(`/api/v1/imports/${batch.id}/rows/${row.id}`, { method: "DELETE" }));
      onChange(await importResponse(await fetch(`/api/v1/imports/${batch.id}`, { cache: "no-store" })));
      onLockedChange(false);
    }, `Đã xóa dòng ${row.rowNumber} khỏi đợt nhập.`);
  }
  async function commit() {
    if (!count("VALID") || editingId) return;
    await mutate(async () => {
      let remaining = count("VALID");
      while (remaining > 0) {
        const data = await importResponse(await fetch("/api/v1/imports/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: batch.id }) }));
        onChange(data.batch);
        if (data.remaining >= remaining) throw new Error("Chưa thể xử lý hết giao dịch. Hãy tải lại đợt nhập và thử lại.");
        remaining = data.remaining;
      }
      onLockedChange(false);
    }, "Đã xử lý các dòng sẵn sàng. Kiểm tra trạng thái từng dòng bên dưới.");
  }

  return <section id="import-review" className={`card ${styles.reviewCard}`} aria-labelledby="review-title" aria-busy={busy}>
    <header className={styles.reviewHeader}><div className={styles.titleGroup}><span className={styles.reviewIcon}><FileCheck2 size={23} aria-hidden="true" /></span><div><span className={styles.eyebrow}>KIỂM TRA GIAO DỊCH</span><h2 id="review-title">{batch.fileName}</h2><p>{batch.total} dòng · Dữ liệu được lưu để bạn tiếp tục sau khi tải lại trang.</p></div></div><a className={styles.downloadLink} href={`/api/v1/imports/${batch.id}/errors.csv`}><Download size={15} aria-hidden="true" />Tải báo cáo lỗi / trùng</a></header>
    <div className={styles.summaryGrid}><div><span>Thu nhập</span><strong className={styles.income}>{total("INCOME")}</strong></div><div><span>Chi tiêu</span><strong className={styles.expense}>{total("EXPENSE")}</strong></div><div><span>Chuyển giữa ví</span><strong>{total("TRANSFER")}</strong></div><div><span>Sẵn sàng nhập</span><strong>{count("VALID")} <small>/ {batch.total} dòng</small></strong></div></div>
    <p className={styles.summaryNote}>Tổng tiền của {batch.rows.length} dòng đang hiển thị, không tính dòng trùng. Đối chiếu với sao kê trước khi nhập.</p>
    {batch.warnings?.map((warning, index) => <p key={index} className={styles.notice}>{warning}</p>)}
    <div className={styles.filters} role="group" aria-label="Lọc trạng thái giao dịch">{filters.map(item => <button key={item.value} type="button" aria-pressed={filter === item.value} disabled={busy || editingId !== null || deletingId !== null} onClick={() => setFilter(item.value)}>{item.label}<span>{item.count}</span></button>)}</div>
    {error && <div role="alert" className={styles.errorNotice}>{error}<button type="button" className="text-link" disabled={busy} onClick={() => { edit(null); setError(""); onLockedChange(false); }}>Đóng thông báo</button></div>}
    {message && <p role="status" className={styles.successNotice}>{message}</p>}
    <div className={styles.reviewTableWrap}><table className={styles.reviewTable}><thead><tr><th>Giao dịch</th><th>Danh mục / Ví</th><th>Số tiền</th><th>Trạng thái</th><th><span className={styles.srOnly}>Thao tác</span></th></tr></thead><tbody>
      {rows.map(row => {
        const editable = ["VALID", "INVALID", "FAILED"].includes(row.status);
        const active = editingId === row.id;
        const blocked = busy || (editingId !== null && !active) || (deletingId !== null && deletingId !== row.id);
        const KindIcon = row.kind === "INCOME" ? ArrowDownLeft : row.kind === "TRANSFER" ? ArrowLeftRight : ArrowUpRight;
        const tone = row.status === "VALID" || row.status === "IMPORTED" ? "success" : row.status === "FAILED" ? "danger" : "warning";
        return <Fragment key={row.id}>
          <tr className={`${styles.dataRow} ${active ? styles.activeRow : ""}`} data-row-id={row.id}>
            <td className={styles.transactionCell}><span className={`${styles.kindIcon} ${row.kind === "INCOME" ? styles.income : row.kind === "EXPENSE" ? styles.expense : ""}`}><KindIcon size={18} aria-hidden="true" /></span><div><strong>{row.note || "Chưa có nội dung"}</strong><small>#{row.rowNumber} · {row.date ? row.date.split("-").reverse().join("/") : "Chưa rõ ngày"} · {row.kind === "INCOME" ? "Thu nhập" : row.kind === "EXPENSE" ? "Chi tiêu" : row.kind === "TRANSFER" ? "Chuyển ví" : "Chưa rõ loại"}</small>{row.sourceReference && <small>Mã: {row.sourceReference}</small>}</div></td>
            <td className={styles.categoryCell}><span>{row.kind === "TRANSFER" ? wallets.find(w => w.id === row.destinationWalletId)?.name || "Chọn ví nhận" : categories.find(c => c.id === row.categoryId)?.name || "Chưa chọn danh mục"}</span><small>{wallets.find(w => w.id === row.walletId)?.name || "Ví nguồn không còn hoạt động"}</small></td>
            <td className={`${styles.amountCell} ${row.kind === "INCOME" ? styles.income : row.kind === "EXPENSE" ? styles.expense : ""}`}>{row.amount ? formatVnd(row.amount) : "Chưa rõ số tiền"}</td>
            <td className={styles.statusCell}><StatusBadge tone={tone}>{statusNames[row.status]}</StatusBadge>{row.error && <small>{row.error}</small>}{row.confidence != null && <details className={styles.rowDetails}><summary>Chi tiết AI</summary><p>Độ tin cậy đọc dữ liệu: {Math.round(row.confidence * 100)}%. {row.categoryReason}</p></details>}</td>
            <td className={styles.actionsCell}><div className={styles.rowActions}>
              {editable && !active && <>{row.status !== "VALID" && <button type="button" className={styles.confirmButton} disabled={blocked} aria-label={`Xác nhận dòng ${row.rowNumber}`} onClick={() => void confirm(row)}><Check size={15} />Xác nhận</button>}<IconButton label={`Sửa dòng ${row.rowNumber}`} icon={Pencil} disabled={blocked} onClick={() => edit(row.id)} /></>}
              {row.status !== "IMPORTED" && !active && <IconButton label={`Xóa dòng ${row.rowNumber}`} icon={Trash2} disabled={blocked} className={styles.deleteButton} onClick={() => { setDeletingId(row.id); onLockedChange(true); }} />}
              {row.status === "IMPORTED" && <span className={styles.postedLabel}><CheckCheck size={17} />Đã ghi vào ví</span>}
            </div></td>
          </tr>
          {active && <tr className={styles.expandedRow}><td colSpan={5}><RowEditor key={row.id} row={row} wallets={wallets} categories={categories} busy={busy} onSave={input => updateRow(row, input)} onCancel={() => edit(null)} /></td></tr>}
          {deletingId === row.id && <tr className={styles.expandedRow}><td colSpan={5}><div className={styles.deletePrompt} role="group" aria-label={`Xóa dòng ${row.rowNumber}`}><p>Xóa dòng {row.rowNumber} khỏi đợt nhập? Dòng này sẽ không được ghi vào ví.</p><button type="button" className="button button-outline" disabled={busy} onClick={() => { setDeletingId(null); onLockedChange(false); }}>Giữ lại</button><button type="button" className={`button ${styles.dangerButton}`} disabled={busy} onClick={() => void remove(row)}>Xóa dòng</button></div></td></tr>}
        </Fragment>;
      })}
      {!rows.length && <tr><td colSpan={5} className={styles.emptyState}>{batch.total ? "Không có dòng nào thuộc trạng thái này trong 200 dòng hiển thị." : "Đợt nhập không còn dòng dữ liệu."}</td></tr>}
    </tbody></table></div>
    <footer className={styles.reviewFooter}><div><strong>{count("VALID")} giao dịch sẵn sàng nhập</strong><p>{editingId ? "Lưu hoặc hủy chỉnh sửa trước khi nhập vào ví." : reviewCount ? `${reviewCount} dòng cần kiểm tra sẽ được giữ lại để xử lý sau.` : "Các dòng đã nhập và dòng trùng sẽ không được nhập lại."}</p>{batch.total > batch.rows.length && <small>Hiển thị 200 dòng đầu; xác nhận nhập áp dụng cho mọi dòng hợp lệ trong đợt.</small>}</div><button type="button" className="button button-primary" disabled={busy || !count("VALID") || editingId !== null || deletingId !== null} onClick={() => void commit()}><CheckCheck size={18} />{busy ? "Đang xử lý…" : `Nhập ${count("VALID")} giao dịch vào ví`}</button></footer>
  </section>;
}
