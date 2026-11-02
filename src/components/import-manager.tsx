"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/csv-import";
import { AiStatementImporter } from "./ai-statement-importer";
import { ImportReview, type ImportBatch } from "./import-review";
import { ArrowRight, ChevronDown, FileClock, FileSpreadsheet, History, Info, Sparkles, UploadCloud } from "lucide-react";
import styles from "./finance-pages.module.css";

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
  const [source, setSource] = useState<"ai" | "file">(aiAvailable ? "ai" : "file");
  const [aiBusy, setAiBusy] = useState(false);

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
    setBusy(true);
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
    finally { setBusy(false); }
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
  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>TỪ SAO KÊ ĐẾN SỔ THU CHI</span><h1>Nhập sao kê thông minh</h1><p>Thêm dữ liệu, kiểm tra giao dịch và chủ động xác nhận trước khi nhập vào ví.</p></div><a className="button button-outline" href="#import-history"><History size={16} />Lịch sử nhập</a></header>
    <ol className={styles.steps} aria-label="Các bước nhập sao kê">{["Chọn nguồn dữ liệu", "Kiểm tra giao dịch", "Nhập vào ví"].map((label, index) => <li key={label} aria-current={(preview?.status === "COMPLETE" ? 2 : preview ? 1 : 0) === index ? "step" : undefined}><span>{index + 1}</span><div><strong>{label}</strong><small>{["Tệp hoặc nội dung sao kê", "Đối chiếu và chỉnh sửa", "Chỉ ghi khi bạn xác nhận"][index]}</small></div></li>)}</ol>
    {error && <p role="alert" className="form-error">{error}</p>}
    {preview && <ImportReview key={preview.id} batch={preview} wallets={wallets} categories={categories} onChange={setPreview} onLockedChange={setReviewLocked} />}

    <div className={styles.sourceChoices} role="group" aria-label="Chọn cách nhập sao kê"><button type="button" aria-pressed={source === "ai"} aria-controls="import-ai-source" disabled={busy || aiBusy || reviewLocked} onClick={() => setSource("ai")}><Sparkles size={24} /><span><strong>AI đọc sao kê</strong><small>PDF, ảnh, tài liệu hoặc văn bản</small></span></button><button type="button" aria-pressed={source === "file"} aria-controls="import-file-source" disabled={busy || aiBusy || reviewLocked} onClick={() => setSource("file")}><FileSpreadsheet size={24} /><span><strong>CSV / Excel</strong><small>Tự chọn cột, kiểm soát dữ liệu</small></span></button></div>
    <div id="import-ai-source" hidden={source !== "ai"} className={styles.uploadWrap}><AiStatementImporter wallets={wallets} available={aiAvailable} pdfOnlyDocuments={pdfOnlyDocuments} onPreview={showPreview} disabled={busy || reviewLocked} onBusyChange={setAiBusy} /></div>
    <form id="import-file-source" hidden={source !== "file"} onSubmit={previewFile} className={`${styles.panel} ${styles.csvForm}`} aria-label="Nhập tệp CSV hoặc Excel">
      <h2>Nhập dữ liệu từ bảng tính</h2><p>Chọn tệp và ví nhận giao dịch. Bạn sẽ kiểm tra các cột trước khi xem trước dữ liệu.</p>
      {!wallets.length && <p><a className="text-link" href="/wallets">Tạo ví</a> trước khi nhập sao kê.</p>}
      <fieldset className={styles.fields} disabled={busy || reviewLocked || aiBusy}><div className={styles.csvSource}>
        <div className={styles.filePicker}><UploadCloud size={30} strokeWidth={1.5} /><strong>{file?.name || "Chọn tệp CSV hoặc Excel"}</strong><span>CSV UTF-8 · XLSX · Tối đa 5 MB</span><input id="file-csv" aria-label="Tệp CSV hoặc XLSX" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={e => onFile(e.target.files?.[0])} /></div>
        <div className="field"><label htmlFor="import-wallet">Ví nguồn</label><select id="import-wallet" value={walletId} onChange={e => setWalletId(e.target.value)} required>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      </div>{headers.length > 0 && <div className={styles.mapping}><h3>Ghép cột và phân loại giao dịch</h3><div className="form-grid">
        {column("col-date", dateColumn, setDateColumn)}{column("col-amount", amountColumn, setAmountColumn)}{column("col-kind", kindColumn, setKindColumn, true)}{column("col-note", noteColumn, setNoteColumn, true)}
        <div className="field"><label htmlFor="default-kind">Loại dùng khi không có cột loại</label><select id="default-kind" value={defaultKind} onChange={e => setDefaultKind(e.target.value as typeof defaultKind)}><option value="EXPENSE">Chi</option><option value="INCOME">Thu</option><option value="TRANSFER">Chuyển ví</option></select></div>
        <div className="field"><label htmlFor="income-category">Danh mục thu</label><select id="income-category" value={incomeCategoryId} onChange={e => setIncomeCategoryId(e.target.value)}><option value="">Chọn danh mục</option>{categories.filter(c => c.kind === "INCOME").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="expense-category">Danh mục chi</label><select id="expense-category" value={expenseCategoryId} onChange={e => setExpenseCategoryId(e.target.value)}><option value="">Chọn danh mục</option>{categories.filter(c => c.kind === "EXPENSE").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="dest-wallet">Ví nhận (nếu chuyển)</label><select id="dest-wallet" value={destinationWalletId} onChange={e => setDestinationWalletId(e.target.value)}><option value="">Chọn ví nhận</option>{wallets.filter(w => w.id !== walletId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      </div></div>}<div className="form-footer"><button className="button button-primary" disabled={busy || reviewLocked || aiBusy || !headers.length || !walletId} type="submit">{busy ? "Đang xử lý…" : "Xem trước dữ liệu"}<ArrowRight size={16} /></button></div></fieldset>
      <details className={styles.details} style={{ marginTop: 20 }}><summary>Định dạng dữ liệu được hỗ trợ<ChevronDown size={15} /></summary><p>CSV UTF-8 hoặc XLSX (trang tính hiển thị đầu tiên), tối đa 5 MB và 10.000 dòng. Ngày YYYY-MM-DD hoặc DD/MM/YYYY, số tiền VND nguyên dương, loại INCOME / EXPENSE / TRANSFER (hoặc THU / CHI / CHUYỂN). XLSX phải có giá trị tĩnh, không chứa công thức.</p></details>
    </form>
    <section className={styles.panel} id="import-history"><div className={styles.panelHead}><div><h2>Các đợt nhập gần đây</h2><p>Tiếp tục kiểm tra sao kê hoặc xem lại dữ liệu đã xử lý.</p></div><History size={20} className={styles.muted} /></div>{!batches.length ? <div className={styles.empty}><span className={styles.emptyIcon}><FileClock size={29} /></span><h3>Chưa có sao kê nào được nhập</h3><p>Các đợt nhập được lưu tại đây để bạn tiếp tục bất cứ lúc nào.</p></div> : batches.map(b => <article className={styles.historyRow} key={b.id}><div className={styles.recordIdentity}><span className={styles.rowIcon}><FileSpreadsheet size={20} /></span><div><h3>{b.fileName}</h3><p>Đợt nhập sao kê</p></div></div><time dateTime={new Date(b.createdAt).toISOString()}>{new Date(b.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</time><span className={`${styles.badge} ${b.status === "COMPLETE" ? styles.income : styles.warning}`}>{b.status === "COMPLETE" ? "Đã xử lý" : "Xem trước"}</span><button type="button" className="button button-outline" disabled={busy || aiBusy || reviewLocked} onClick={() => loadBatch(b.id)}>Mở<ArrowRight size={15} /></button></article>)}</section>
    <p className={styles.footnote}><Info size={14} />Bước xem trước chưa ghi giao dịch vào ví. Chỉ các dòng hợp lệ được nhập khi bạn xác nhận.</p>
  </div>;
}
