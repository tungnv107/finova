"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/csv-import";

type ImportPreview = { id: string; fileName: string; status: string; counts: Record<string, number>; total: number; rows: { rowNumber: number; date: string | null; kind: string | null; amount: string | null; note: string | null; status: string; error: string | null }[] };
type Props = { wallets: { id: string; name: string }[]; categories: { id: string; name: string; kind: string }[]; batches: { id: string; fileName: string; status: string; createdAt: Date }[] };

export function ImportManager({ wallets, categories, batches }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dateColumn, setDateColumn] = useState("date"), [amountColumn, setAmountColumn] = useState("amount"), [kindColumn, setKindColumn] = useState(""), [noteColumn, setNoteColumn] = useState("");
  const [defaultKind, setDefaultKind] = useState<"EXPENSE" | "INCOME" | "TRANSFER">("EXPENSE");
  const [walletId, setWalletId] = useState(wallets[0]?.id || "");
  const [incomeCategoryId, setIncomeCategoryId] = useState(""), [expenseCategoryId, setExpenseCategoryId] = useState(""), [destinationWalletId, setDestinationWalletId] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [progress, setProgress] = useState("");
  const [batchId, setBatchId] = useState("");

  async function onFile(selected?: File) {
    setFile(selected || null); setPreview(null); setError(""); setHeaders([]);
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) { setError("Tệp vượt 5 MB."); return; }
    try {
      let h: string[];
      if (selected.name.toLowerCase().endsWith(".xlsx")) {
        const form = new FormData(); form.append("file", selected);
        const response = await fetch("/api/v1/imports/columns", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Không đọc được các cột XLSX.");
        h = result.data.columns;
      } else if (selected.name.toLowerCase().endsWith(".csv")) {
        h = parseCsv(await selected.text())[0].map(v => v.trim());
      } else throw new Error("Chỉ hỗ trợ CSV UTF-8 hoặc XLSX.");
      setHeaders(h);
      const match = (names: string[]) => h.find(x => names.includes(x.toLowerCase())) || "";
      setDateColumn(match(["date", "ngay", "ngày", "occurredat"]));
      setAmountColumn(match(["amount", "sotien", "số tiền", "money"]));
      setNoteColumn(match(["note", "ghi chú", "ghichu", "description"]));
      setKindColumn(match(["kind", "loai", "loại", "type"]));
    } catch (e) { setError(e instanceof Error ? e.message : "Không đọc được CSV."); }
  }
  async function previewFile(e: React.FormEvent) {
    e.preventDefault(); if (!file) return;
    setBusy(true); setError(""); setProgress("");
    try {
      const form = new FormData(); form.append("file", file);
      form.append("options", JSON.stringify({ dateColumn, amountColumn, ...(kindColumn ? { kindColumn } : {}), ...(noteColumn ? { noteColumn } : {}), defaultKind, walletId,
        ...(incomeCategoryId ? { incomeCategoryId } : {}), ...(expenseCategoryId ? { expenseCategoryId } : {}), ...(destinationWalletId ? { destinationWalletId } : {}) }));
      const r = await fetch("/api/v1/imports/preview", { method: "POST", body: form });
      const json = await r.json(); if (!r.ok) throw new Error(json.error?.message || "Không thể xem trước.");
      setPreview(json.data); setBatchId(json.data.id); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  async function loadBatch(id: string) {
    setBusy(true); setError("");
    try { const r = await fetch(`/api/v1/imports/${id}`); const json = await r.json(); if (!r.ok) throw new Error(json.error?.message || "Không tải được."); setPreview(json.data); setBatchId(id); }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview || !batchId) return;
    setBusy(true); setError("");
    try {
      let remaining = 1, done = 0;
      while (remaining > 0) {
        const r = await fetch("/api/v1/imports/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }) });
        const json = await r.json(); if (!r.ok) throw new Error(json.error?.message || "Ghi sổ thất bại.");
        done += json.data.imported; remaining = json.data.remaining; setPreview(json.data.batch);
        setProgress(`Đã ghi sổ ${done} dòng trong lần thực hiện này. Còn ${remaining} dòng hợp lệ cần xử lý.`);
      }
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối; có thể tiếp tục đợt nhập."); }
    finally { setBusy(false); }
  }
  async function retryFailed() {
    if (!batchId) return;
    setBusy(true); setError(""); setProgress("");
    try {
      const r = await fetch(`/api/v1/imports/${batchId}/retry`, { method: "POST" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || "Không thể thử lại dòng thất bại.");
      setPreview(json.data.batch);
      setProgress(`Đã đưa ${json.data.retried} dòng thất bại vào hàng chờ. Kiểm tra và xác nhận ghi sổ lại.`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  const column = (id: string, value: string, setter: (s: string) => void, optional = false) => <div className="field"><label htmlFor={id}>{id === "col-date" ? "Cột ngày" : id === "col-amount" ? "Cột số tiền" : id === "col-kind" ? "Cột loại giao dịch" : "Cột ghi chú"}</label><select id={id} value={value} onChange={e => setter(e.target.value)} required={!optional}><option value="">{optional ? "Không dùng" : "Chọn cột"}</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}</select></div>;
  return <>
    <div className="page-head feature-page-head"><div><h2 className="section-title">Nhập CSV / XLSX bằng ánh xạ cột</h2><p className="subtitle">Xem trước và kiểm tra từng dòng trước khi ghi vào sổ cái. Không ghi dữ liệu ở bước xem trước.</p></div></div>
    <form onSubmit={previewFile} className="card card-pad" style={{ marginBottom: 22 }}>
      <h2 className="section-title">Chọn file và ánh xạ cột</h2><p className="section-subtitle">CSV UTF-8 hoặc XLSX (trang tính hiển thị đầu tiên), tối đa 5 MB và 10.000 dòng. Ngày YYYY-MM-DD hoặc DD/MM/YYYY, số tiền VND nguyên dương, loại INCOME / EXPENSE / TRANSFER (hoặc THU / CHI / CHUYỂN). XLSX phải có giá trị tĩnh, không chứa công thức.</p>
      <div className="form-grid" style={{ marginTop: 20 }}>
        <div className="field"><label htmlFor="file-csv">Tệp CSV hoặc XLSX</label><input id="file-csv" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={e => onFile(e.target.files?.[0])} /></div>
        <div className="field"><label htmlFor="import-wallet">Ví nguồn</label><select id="import-wallet" value={walletId} onChange={e => setWalletId(e.target.value)} required>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        {headers.length > 0 && <>{column("col-date", dateColumn, setDateColumn)}{column("col-amount", amountColumn, setAmountColumn)}{column("col-kind", kindColumn, setKindColumn, true)}{column("col-note", noteColumn, setNoteColumn, true)}</>}
        <div className="field"><label htmlFor="default-kind">Loại dùng khi không có cột loại</label><select id="default-kind" value={defaultKind} onChange={e => setDefaultKind(e.target.value as typeof defaultKind)}><option value="EXPENSE">Chi</option><option value="INCOME">Thu</option><option value="TRANSFER">Chuyển ví</option></select></div>
        <div className="field"><label htmlFor="income-category">Danh mục thu</label><select id="income-category" value={incomeCategoryId} onChange={e => setIncomeCategoryId(e.target.value)}><option value="">Chọn danh mục</option>{categories.filter(c => c.kind === "INCOME").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="expense-category">Danh mục chi</label><select id="expense-category" value={expenseCategoryId} onChange={e => setExpenseCategoryId(e.target.value)}><option value="">Chọn danh mục</option>{categories.filter(c => c.kind === "EXPENSE").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="dest-wallet">Ví nhận (nếu chuyển)</label><select id="dest-wallet" value={destinationWalletId} onChange={e => setDestinationWalletId(e.target.value)}><option value="">Chọn ví nhận</option>{wallets.filter(w => w.id !== walletId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      </div><div className="form-footer"><button className="button button-primary" disabled={busy || !headers.length || !walletId} type="submit">Xem trước dữ liệu</button></div>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}{progress && <p role="status">{progress}</p>}
    {preview && <section className="card card-pad" style={{ marginBottom: 22 }}><div className="section-header"><h2 className="section-title">Kết quả xem trước: {preview.fileName}</h2><a className="text-link" href={`/api/v1/imports/${preview.id}/errors.csv`}>Tải báo cáo dòng lỗi/trùng</a></div>
      <p>Tổng {preview.total} dòng: hợp lệ {preview.counts.VALID || 0}, đã nhập {preview.counts.IMPORTED || 0}, trùng {preview.counts.DUPLICATE || 0}, lỗi {preview.counts.INVALID || 0}, ghi thất bại {preview.counts.FAILED || 0}.</p>
      <div className="import-actions">
        {(preview.counts.VALID || 0) > 0 && <button type="button" className="button button-primary" disabled={busy} onClick={commit}>{busy ? "Đang ghi sổ…" : "Xác nhận nhập các dòng hợp lệ"}</button>}
        {(preview.counts.FAILED || 0) > 0 && <button type="button" className="button button-outline" disabled={busy} onClick={retryFailed}>Thử lại các dòng ghi thất bại</button>}
      </div>
      <div className="table-wrap import-desktop-table" style={{ marginTop: 14 }}><table><thead><tr><th>Dòng</th><th>Ngày</th><th>Loại</th><th>Số tiền</th><th>Kết quả</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.date || "—"}</td><td>{row.kind || "—"}</td><td>{row.amount || "—"}</td><td>{row.error || row.status}</td></tr>)}</tbody></table></div>
      <div className="import-mobile-list" aria-label="Các dòng xem trước">
        {preview.rows.map(row => <article className="import-mobile-card" key={row.rowNumber}>
          <div className="import-mobile-card-head"><strong>Dòng {row.rowNumber}</strong><span className={`import-status ${row.status === "VALID" || row.status === "IMPORTED" ? "is-success" : row.status === "DUPLICATE" ? "is-warning" : "is-error"}`}>{row.status}</span></div>
          <div className="import-mobile-details"><span>Ngày</span><strong>{row.date || "—"}</strong><span>Loại</span><strong>{row.kind || "—"}</strong><span>Số tiền</span><strong>{row.amount || "—"}</strong></div>
          {row.error && <p className="import-row-error">{row.error}</p>}
          {row.note && <p className="section-subtitle">{row.note}</p>}
        </article>)}
      </div>
      <p className="section-subtitle">Hiển thị 200 dòng đầu; kết quả tổng hợp áp dụng cho toàn tệp.</p>
    </section>}
    <section className="card card-pad"><h2 className="section-title">Các đợt nhập gần đây</h2>{!batches.length ? <p>Chưa có đợt nhập.</p> : <>
      <div className="table-wrap import-desktop-table"><table><thead><tr><th>Tệp</th><th>Ngày</th><th>Trạng thái</th><th>Xem</th></tr></thead><tbody>{batches.map(b => <tr key={b.id}><td>{b.fileName}</td><td>{new Date(b.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td><td>{b.status === "COMPLETE" ? "Đã xử lý" : "Xem trước"}</td><td><button type="button" className="button button-outline" disabled={busy} onClick={() => loadBatch(b.id)}>Mở</button></td></tr>)}</tbody></table></div>
      <div className="import-mobile-list">{batches.map(b => <article className="import-mobile-card" key={b.id}>
        <div className="import-mobile-card-head"><strong>{b.fileName}</strong><span className="import-status">{b.status === "COMPLETE" ? "Đã xử lý" : "Xem trước"}</span></div>
        <p className="section-subtitle">{new Date(b.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
        <button type="button" className="button button-outline" disabled={busy} onClick={() => loadBatch(b.id)}>Mở đợt nhập</button>
      </article>)}</div>
    </>}</section>
  </>;
}
