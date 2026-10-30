"use client";

import { useRef, useState } from "react";
import { ArrowRight, FileText, FileUp, LoaderCircle, ShieldCheck, Sparkles, UploadCloud, Wallet } from "lucide-react";
import { MAX_AI_STATEMENT_TEXT_LENGTH } from "@/lib/ai-statement-limits";
import { SegmentedControl } from "@/components/ui/interaction-controls";
import { importResponse, type ImportBatch, type ImportWallet } from "./import-review";
import styles from "./statement-import.module.css";

export function AiStatementImporter({ wallets, available, pdfOnlyDocuments = false, onPreview, disabled = false }: {
  wallets: ImportWallet[]; available: boolean; pdfOnlyDocuments?: boolean; onPreview: (batch: ImportBatch) => void; disabled?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [walletId, setWallet] = useState(wallets[0]?.id || "");
  const [file, setFile] = useState<File | null>(null), [consent, setConsent] = useState(false);
  const [inputMode, setInputMode] = useState<"file" | "text">("text"), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [dragging, setDragging] = useState(false);
  const locked = busy || disabled || !available;
  const textTooLong = text.length > MAX_AI_STATEMENT_TEXT_LENGTH;
  const validSource = inputMode === "text" ? Boolean(text.trim()) && !textTooLong : Boolean(file && file.size > 0 && file.size <= 5 * 1024 * 1024);

  function selectFile(value: File | null) {
    setFile(value);
    setError(value && value.size > 5 * 1024 * 1024 ? "Tệp vượt 5 MB. Hãy chia nhỏ sao kê." : value && !value.size ? "Tệp phải có dữ liệu." : "");
  }
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (locked || !walletId || !consent || !validSource) return;
    setBusy(true); setError("");
    try {
      const form = new FormData();
      if (inputMode === "text") form.append("text", text);
      else if (file) form.append("file", file);
      form.append("walletId", walletId); form.append("consent", String(consent));
      onPreview(await importResponse(await fetch("/api/v1/imports/ai", { method: "POST", body: form })));
    } catch (e) { setError(e instanceof Error ? e.message : "Không đọc được sao kê."); }
    finally { setBusy(false); }
  }

  return <section className={`card ${styles.uploadCard}`} aria-labelledby="statement-title">
    <header className={styles.uploadHeader}>
      <div className={styles.titleGroup}><span className={styles.sparkleIcon}><Sparkles size={23} aria-hidden="true" /></span><div>
        <span className={styles.eyebrow}>TRỢ LÝ SAO KÊ</span>
        <h2 id="statement-title">Thêm sao kê, để AI lo phần nhập liệu</h2>
        <p>Tự động đọc và phân loại. Bạn kiểm tra trước khi nhập vào ví.</p>
      </div></div>
      <span className={styles.limitBadge}>Tối đa 200 giao dịch / lần</span>
    </header>
    {!available && <p role="status" className={styles.notice}>AI chưa được cấu hình trên máy chủ. Bạn vẫn có thể nhập CSV/XLSX bằng ánh xạ cột bên dưới.</p>}
    {!wallets.length && <p>Tạo ví trước tại <a className="text-link" href="/wallets">Ví & tài khoản</a>.</p>}
    <form onSubmit={upload} aria-busy={busy}>
      <fieldset disabled={locked} className={styles.uploadFieldset}>
        <div className={styles.uploadGrid}>
          <div className={styles.sourcePanel}>
            <SegmentedControl label="Cách nhập sao kê" options={[{ value: "text", label: "Dán văn bản", icon: FileText }, { value: "file", label: "Tải tệp", icon: FileUp }]} value={inputMode} disabled={locked} onChange={mode => { setInputMode(mode); setError(""); }} />
            {inputMode === "file" ? <div>
              <div className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
                onDragOver={e => { e.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); if (!locked) selectFile(e.dataTransfer.files[0] ?? null); }}>
                <input ref={fileInput} id="ai-statement-file" className={styles.fileInput} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv" aria-label="Chọn tệp sao kê" aria-describedby="statement-formats" onChange={e => selectFile(e.target.files?.[0] ?? null)} />
                <UploadCloud size={30} strokeWidth={1.5} aria-hidden="true" />
                <strong>{file ? file.name : "Kéo thả sao kê vào đây"}</strong>
                <span>{file ? `${(file.size / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} KB · Nhấn để đổi tệp` : <>hoặc <b>chọn tệp từ thiết bị</b></>}</span>
                <small id="statement-formats">PDF, ảnh, Word, Excel, CSV · Tối đa 5 MB</small>
              </div>
              <details className={styles.fileHelp}><summary>Định dạng và lưu ý khi tải lên</summary><p>Ảnh PNG/JPG/WebP; Word DOC/DOCX cần có văn bản, bản scan nên xuất PDF. XLSX/CSV dùng trang tính hiển thị đầu tiên và giá trị tĩnh.</p>{pdfOnlyDocuments && <p>Với nhà cung cấp hiện tại, chuyển Word sang PDF và XLS sang XLSX/CSV trước khi tải lên. Khả năng đọc ảnh và PDF phụ thuộc model được cấu hình.</p>}</details>
            </div> : <div className={`field ${styles.textSource}`}>
              <label htmlFor="ai-statement-text">Nội dung sao kê</label>
              <textarea id="ai-statement-text" rows={6} required value={text} onChange={e => setText(e.target.value)} aria-describedby="ai-statement-text-help" aria-invalid={textTooLong} placeholder={"Dán nội dung gồm ngày, số tiền và mô tả giao dịch…\nVí dụ: 29/10/2026 | Chi 50.000 VND | Ăn trưa"} />
              <small id="ai-statement-text-help">{text.length.toLocaleString("vi-VN")} / 120.000 ký tự · Giữ đầy đủ ngày và đơn vị tiền tệ.</small>
              {textTooLong && <p role="alert" className="form-error">Văn bản vượt 120.000 ký tự. Hãy chia nhỏ sao kê.</p>}
            </div>}
          </div>
          <div className={styles.destinationPanel}>
            <div className="field"><label htmlFor="ai-statement-wallet"><Wallet size={16} aria-hidden="true" /> Nhập vào ví</label><select id="ai-statement-wallet" value={walletId} required onChange={e => setWallet(e.target.value)}>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <ol className={styles.steps}><li><span>1</span><div><strong>Thêm sao kê</strong><small>Tải tệp hoặc dán nội dung</small></div></li><li><span>2</span><div><strong>Kiểm tra giao dịch</strong><small>Chỉnh sửa và bỏ dòng không cần</small></div></li><li><span>3</span><div><strong>Xác nhận nhập vào ví</strong><small>Chỉ ghi nhận khi bạn đồng ý</small></div></li></ol>
          </div>
        </div>
        <div className={styles.uploadFooter}>
          <div className={styles.privacy}>
            <label className={styles.consent} htmlFor="ai-statement-consent"><input id="ai-statement-consent" type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)} /><span>Tôi đồng ý gửi dữ liệu sao kê cho AI phân tích.</span></label>
            <details className={styles.consentDetails}><summary><ShieldCheck size={14} aria-hidden="true" /> Dữ liệu nào được gửi?</summary><p>Tệp hoặc văn bản sao kê, danh mục và một phần lịch sử đã che chuỗi số dài/email được gửi tới nhà cung cấp AI do quản trị viên cấu hình. Sao kê gốc có thể chứa thông tin tài khoản.</p></details>
          </div>
          <button type="submit" className={`button button-primary ${styles.analyzeButton}`} disabled={!walletId || !validSource || !consent}>{busy ? <LoaderCircle className={styles.spinner} size={17} /> : <Sparkles size={17} />}{busy ? "Đang phân tích…" : "Phân tích sao kê"}{!busy && <ArrowRight size={17} />}</button>
        </div>
      </fieldset>
      {busy && <p role="status" className={styles.notice}>AI đang đọc và phân loại giao dịch. Vui lòng chờ…</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
  </section>;
}
