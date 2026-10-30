"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/csv-import";
import { AiStatementImporter } from "./ai-statement-importer";
import { ImportReview, type ImportBatch } from "./import-review";

type Props = { wallets: { id: string; name: string }[]; categories: { id: string; name: string; kind: string }[]; batches: { id: string; fileName: string; status: string; createdAt: Date }[]; initialPreview?: ImportBatch | null; initialError?: string; aiAvailable: boolean; pdfOnlyDocuments?: boolean };

export function ImportManager({ wallets, categories, batches, initialPreview = null, initialError = "", aiAvailable, pdfOnlyDocuments }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dateColumn, setDateColumn] = useState("date"), [amountColumn, setAmountColumn] = useState("amount"), [kindColumn, setKindColumn] = useState(""), [noteColumn, setNoteColumn] = useState("");
  const [defaultKind, setDefaultKind] = useState<"EXPENSE" | "INCOME" | "TRANSFER">("EXPENSE");
  const [walletId, setWalletId] = useState(wallets[0]?.id || "");
  const [incomeCategoryId, setIncomeCategoryId] = useState(""), [expenseCategoryId, setExpenseCategoryId] = useState(""), [destinationWalletId, setDestinationWalletId] = useState("");
  const [preview, setPreview] = useState<ImportBatch | null>(initialPreview);
  const [busy, setBusy] = useState(false), [error, setError] = useState(initialError);
  const [reviewLocked, setReviewLocked] = useState(false);

  function showPreview(batch: ImportBatch) {
    setPreview(batch); setError(""); setReviewLocked(false);
    const url = new URL(window.location.href);
    url.searchParams.set("batch", batch.id);
    window.history.replaceState(null, "", url.pathname + url.search);
    router.refresh();
    requestAnimationFrame(() => document.getElementById("import-review")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function onFile(selected?: File) {
    setFile(selected || null); setError(""); setHeaders([]);
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
    setBusy(true); setError(""); 
    try {
      const form = new FormData(); form.append("file", file);
      form.append("options", JSON.stringify({ dateColumn, amountColumn, ...(kindColumn ? { kindColumn } : {}), ...(noteColumn ? { noteColumn } : {}), defaultKind, walletId,
        ...(incomeCategoryId ? { incomeCategoryId } : {}), ...(expenseCategoryId ? { expenseCategoryId } : {}), ...(destinationWalletId ? { destinationWalletId } : {}) }));
      const r = await fetch("/api/v1/imports/preview", { method: "POST", body: form });
      const json = await r.json(); if (!r.ok) throw new Error(json.error?.message || "Không thể xem trước.");
      showPreview(json.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  async function loadBatch(id: string) {
    setBusy(true); setError("");
    try { const r = await fetch(`/api/v1/imports/${id}`); const json = await r.json(); if (!r.ok) throw new Error(json.error?.message || "Không tải được."); showPreview(json.data); }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  const column = (id: string, value: string, setter: (s: string) => void, optional = false) => <div className="field"><label htmlFor={id}>{id === "col-date" ? "Cột ngày" : id === "col-amount" ? "Cột số tiền" : id === "col-kind" ? "Cột loại giao dịch" : "Cột ghi chú"}</label><select id={id} value={value} onChange={e => setter(e.target.value)} required={!optional}><option value="">{optional ? "Không dùng" : "Chọn cột"}</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}</select></div>;
  return <>
    <AiStatementImporter wallets={wallets} available={aiAvailable} pdfOnlyDocuments={pdfOnlyDocuments} onPreview={showPreview} disabled={busy || reviewLocked} />
    {error && <p role="alert" className="form-error">{error}</p>}
    {preview && <ImportReview key={preview.id} batch={preview} wallets={wallets} categories={categories} onChange={setPreview} onLockedChange={setReviewLocked} />}

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
      </div><div className="form-footer"><button className="button button-primary" disabled={busy || reviewLocked || !headers.length || !walletId} type="submit">Xem trước dữ liệu</button></div>
    </form>
    <section className="card card-pad"><h2 className="section-title">Các đợt nhập gần đây</h2>{!batches.length ? <p>Chưa có đợt nhập.</p> : <>
      <div className="table-wrap import-desktop-table"><table><thead><tr><th>Tệp</th><th>Ngày</th><th>Trạng thái</th><th>Xem</th></tr></thead><tbody>{batches.map(b => <tr key={b.id}><td>{b.fileName}</td><td>{new Date(b.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td><td>{b.status === "COMPLETE" ? "Đã xử lý" : "Xem trước"}</td><td><button type="button" className="button button-outline" disabled={busy || reviewLocked} onClick={() => loadBatch(b.id)}>Mở</button></td></tr>)}</tbody></table></div>
      <div className="import-mobile-list">{batches.map(b => <article className="import-mobile-card" key={b.id}>
        <div className="import-mobile-card-head"><strong>{b.fileName}</strong><span className="import-status">{b.status === "COMPLETE" ? "Đã xử lý" : "Xem trước"}</span></div>
        <p className="section-subtitle">{new Date(b.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
        <button type="button" className="button button-outline" disabled={busy || reviewLocked} onClick={() => loadBatch(b.id)}>Mở đợt nhập</button>
      </article>)}</div>
    </>}</section>
  </>;
}
