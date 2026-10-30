"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Sparkles } from "lucide-react";
import { Decimal, formatVnd } from "@/lib/money";
import type { getImport } from "@/server/imports";
import styles from "./financial-ai.module.css";

type Batch = Awaited<ReturnType<typeof getImport>> & { warnings?: string[] };
type Row = Batch["rows"][number];
type Wallet = { id: string; name: string };
type Category = Wallet & { kind: string };
async function responseData(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Không xử lý được yêu cầu.");
  return result.data;
}
const statusNames: Record<string, string> = { VALID: "Sẵn sàng nhập", INVALID: "Cần kiểm tra", DUPLICATE: "Trùng giao dịch", IMPORTED: "Đã nhập", FAILED: "Nhập thất bại" };

function ReviewRow({ row, batchId, categories, wallets, disabled, onSaved }: { row: Row; batchId: string; categories: Category[]; wallets: Wallet[]; disabled: boolean; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [kind, setKind] = useState(row.kind || "EXPENSE"), [amount, setAmount] = useState(row.amount || ""), [date, setDate] = useState(row.date || "");
  const [categoryId, setCategoryId] = useState(row.categoryId || ""), [destinationWalletId, setDestination] = useState(row.destinationWalletId || ""), [note, setNote] = useState(row.note || "");
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await responseData(await fetch(`/api/v1/imports/${batchId}/rows/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, amount, date, note, categoryId: categoryId || null, destinationWalletId: destinationWalletId || null, confirmed: true }) }));
      await onSaved(); setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Không lưu được dòng."); } finally { setBusy(false); }
  }
  return <article className={styles.reviewRow}>
    <div className={styles.rowHeading}><strong>#{row.rowNumber} · {row.date || "Chưa rõ ngày"}</strong><span className={row.status === "VALID" || row.status === "IMPORTED" ? styles.good : styles.warning}>{statusNames[row.status] || row.status}</span></div>
    <p>{row.kind === "INCOME" ? "Thu" : row.kind === "TRANSFER" ? "Chuyển ví" : "Chi"} · <strong>{row.amount ? formatVnd(row.amount) : "Chưa rõ số tiền"}</strong> · {categories.find(c => c.id === row.categoryId)?.name || "Chưa chọn danh mục"}</p>
    <p className={styles.note}>{row.note}</p>
    <small>{row.confidence != null && `Độ tin cậy đọc dữ liệu: ${Math.round(row.confidence * 100)}%. `}{row.categoryReason}</small>
    {row.sourceReference && <small className={styles.block}>Mã giao dịch: {row.sourceReference}</small>}
    {row.error && <p className={styles.warning}>{row.error}</p>}
    {row.confidence != null && ["VALID", "INVALID", "FAILED"].includes(row.status) && <button type="button" className="button button-outline" disabled={disabled || busy} onClick={() => setEditing(!editing)}>{editing ? "Đóng chỉnh sửa" : "Kiểm tra / sửa dòng"}</button>}
    {editing && <form onSubmit={save} className={styles.reviewForm}><fieldset disabled={disabled || busy}>
      <div className="form-grid">
        <div className="field"><label htmlFor={`ai-date-${row.id}`}>Ngày</label><input id={`ai-date-${row.id}`} type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor={`ai-amount-${row.id}`}>Số tiền VND</label><input id={`ai-amount-${row.id}`} required inputMode="numeric" pattern="[1-9][0-9]{0,15}" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <div className="field"><label htmlFor={`ai-kind-${row.id}`}>Loại</label><select id={`ai-kind-${row.id}`} value={kind} onChange={e => { setKind(e.target.value as typeof kind); setCategoryId(""); }}><option value="INCOME">Thu</option><option value="EXPENSE">Chi</option><option value="TRANSFER">Chuyển giữa ví của tôi</option></select></div>
        {kind === "TRANSFER" ? <div className="field"><label htmlFor={`ai-dest-${row.id}`}>Ví nhận</label><select id={`ai-dest-${row.id}`} value={destinationWalletId} required onChange={e => setDestination(e.target.value)}><option value="">Chọn ví</option>{wallets.filter(w => w.id !== row.walletId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div> : <div className="field"><label htmlFor={`ai-cat-${row.id}`}>Danh mục</label><select id={`ai-cat-${row.id}`} value={categoryId} required onChange={e => setCategoryId(e.target.value)}><option value="">Chọn danh mục</option>{categories.filter(c => c.kind === kind).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        <div className="field"><label htmlFor={`ai-note-${row.id}`}>Nội dung</label><textarea id={`ai-note-${row.id}`} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></div>
      </div><button className="button button-primary" type="submit">{busy ? "Đang lưu…" : "Xác nhận dữ liệu dòng này"}</button>
    </fieldset></form>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </article>;
}

export function AiStatementImporter({ wallets, categories, batches, available }: { wallets: Wallet[]; categories: Category[]; batches: { id: string; fileName: string }[]; available: boolean }) {
  const router = useRouter();
  const [walletId, setWallet] = useState(wallets[0]?.id || ""), [file, setFile] = useState<File | null>(null), [consent, setConsent] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [progress, setProgress] = useState("");
  async function load(id: string) { setBatch(await responseData(await fetch(`/api/v1/imports/${id}`))); }
  async function upload(event: React.FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setError(""); setProgress("AI đang đọc và phân loại giao dịch…"); setBatch(null);
    try {
      const form = new FormData(); form.append("file", file); form.append("walletId", walletId); form.append("consent", String(consent));
      setBatch(await responseData(await fetch("/api/v1/imports/ai", { method: "POST", body: form })));
      setProgress("Đã phân tích. Kiểm tra các dòng trước khi xác nhận nhập vào ví."); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Không đọc được sao kê."); setProgress(""); } finally { setBusy(false); }
  }
  async function commit() {
    if (!batch) return;
    setBusy(true); setError("");
    try {
      let remaining = 1, count = 0;
      while (remaining > 0) {
        const data = await responseData(await fetch("/api/v1/imports/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: batch.id }) }));
        count += data.imported; remaining = data.remaining; setBatch(data.batch);
        setProgress(`Đã nhập ${count} giao dịch trong lần này. Còn ${remaining} dòng hợp lệ.`);
      }
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối. Mở lại đợt nhập để tiếp tục."); } finally { setBusy(false); }
  }
  return <section className={`card card-pad ${styles.section}`}>
    <div className={styles.rowHeading}><div><span className={styles.eyebrow}><Sparkles size={16} /> TRỢ LÝ SAO KÊ</span><h2 className="section-title">Đưa sao kê, AI điền giao dịch</h2></div><FileUp size={28} /></div>
    <p className="section-subtitle">Ảnh PNG/JPG/WebP, PDF, Word DOC/DOCX, Excel XLS/XLSX hoặc CSV. Tối đa 5 MB và 200 giao dịch/lần. Word cần có văn bản; bản scan nên xuất PDF. XLSX/CSV dùng trang tính hiển thị đầu tiên, giá trị tĩnh.</p>
    {!available && <p role="status" className={styles.warning}>AI chưa được cấu hình trên máy chủ. Bạn vẫn có thể nhập CSV/XLSX bằng ánh xạ cột bên dưới.</p>}
    {!wallets.length && <p>Tạo ví trước tại <a className="text-link" href="/wallets">Ví & tài khoản</a>.</p>}
    <form onSubmit={upload}><fieldset disabled={busy || !available}>
      <div className="form-grid">
        <div className="field"><label htmlFor="ai-statement-file">Tệp sao kê</label><input id="ai-statement-file" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv" required onChange={e => { const value = e.target.files?.[0] ?? null; setFile(value); setError(value && value.size > 5 * 1024 * 1024 ? "Tệp vượt 5 MB." : ""); }} /></div>
        <div className="field"><label htmlFor="ai-statement-wallet">Nhập vào ví</label><select id="ai-statement-wallet" value={walletId} required onChange={e => setWallet(e.target.value)}>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      </div>
      <label className={styles.consent}><input type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)} /> Tôi đồng ý gửi sao kê, danh mục và một phần nội dung lịch sử đã che chuỗi số dài/email tới OpenAI để phân tích. Tệp gốc có thể chứa thông tin tài khoản.</label>
      <button type="submit" className="button button-primary" disabled={!walletId || !file || !consent || file.size > 5 * 1024 * 1024}>{busy ? "Đang phân tích…" : "Phân tích sao kê bằng AI"}</button>
    </fieldset></form>
    {error && <p role="alert" className="form-error">{error}</p>}{progress && <p role="status">{progress}</p>}
    {batches.length > 0 && <div className="field"><label htmlFor="ai-reopen">Mở đợt nhập để kiểm tra hoặc tiếp tục</label><select id="ai-reopen" disabled={busy} value={batch?.id ?? ""} onChange={async e => { if (!e.target.value) return; setBusy(true); setError(""); try { await load(e.target.value); } catch (e) { setError(e instanceof Error ? e.message : "Không mở được."); } finally { setBusy(false); } }}><option value="">Chọn đợt nhập</option>{batches.map(b => <option key={b.id} value={b.id}>{b.fileName}</option>)}</select></div>}
    {batch && <div className={styles.results}>
      <h3>{batch.fileName}</h3><p>{batch.total} dòng · {batch.counts.VALID || 0} sẵn sàng · {batch.counts.INVALID || 0} cần kiểm tra · {batch.counts.DUPLICATE || 0} trùng · {batch.counts.IMPORTED || 0} đã nhập · {batch.counts.FAILED || 0} thất bại</p>
      <p>Tổng tiền đọc được trong {batch.rows.length} dòng hiển thị: Thu {formatVnd(batch.rows.filter(r => r.kind === "INCOME").reduce((s, r) => s.plus(r.amount || "0"), new Decimal(0)).toFixed(0))} · Chi {formatVnd(batch.rows.filter(r => r.kind === "EXPENSE").reduce((s, r) => s.plus(r.amount || "0"), new Decimal(0)).toFixed(0))}. Chuyển giữa ví được tách riêng.</p>
      {batch.warnings?.map((w, i) => <p key={i} className={styles.warning}>{w}</p>)}
      <p className="section-subtitle">Đối chiếu số lượng và tổng tiền với sao kê gốc. Dòng cần kiểm tra sẽ được giữ lại; có thể sửa rồi nhập tiếp. Chuyển giữa tài khoản của bạn cần chọn loại chuyển ví để tránh tính thành thu chi.</p>
      <button type="button" className="button button-primary" disabled={busy || !batch.counts.VALID} onClick={commit}>Xác nhận tự động nhập {batch.counts.VALID || 0} giao dịch hợp lệ</button>
      <div className={styles.reviewList}>{batch.rows.map(row => <ReviewRow key={`${row.id}:${row.status}:${row.categoryId}:${row.amount}:${row.note}`} row={row} batchId={batch.id} wallets={wallets} categories={categories} disabled={busy} onSaved={() => load(batch.id)} />)}</div>
    </div>}
  </section>;
}
