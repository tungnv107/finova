"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/csv-import";

type WalletOption = { id: string; name: string; type: string };
type Review = { id: string; bankTransactionId: string; reasonCode: string; description: string; amount: string;
  direction: string; bookingStatus: string; occurredAt: Date; walletId: string | null; accountMasked: string;
  providerCode: string; beforeCutover: boolean };
type Source = { id: string; amount: string; direction: string; description: string; occurredAt: string; processingStatus: string;
  bookingStatus: string; accountMasked: string; providerCode: string; linkedIds: string[];
  bankReference: string | null; sourceVersion: string; receivedAt: string; rawEventId: string | null };
type Existing = { id: string; kind: string; amount: string; walletId: string; destinationWalletId: string | null;
  occurredAt: string; note: string | null };
type Connection = { id: string; providerCode: string; status: string; postingPolicy: string; lastSyncedAt: Date | null;
  cutoverAt: Date | null; consentExpiresAt: Date | null;
  accounts: { id: string; accountMasked: string; walletId: string | null; status: string }[] };
type Props = { wallets: WalletOption[]; categories: { id: string; name: string; kind: string }[]; defaultCutoverDay: string;
  connections: Connection[]; reviews: Review[]; sources: Source[]; transactions: Existing[]; sandboxEnabled: boolean; sepayEnabled: boolean };

const formatMoney = (value: string, direction: string) => `${direction === "IN" ? "+" : "−"}${Number(value).toLocaleString("vi-VN")} ₫`;
const formatDate = (value: string | Date) => new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

async function jsonRequest(path: string, method: string, body: unknown) {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Không thể xử lý yêu cầu.");
  return result.data;
}

function ReviewCard({ item, wallets, categories, transactions }: { item: Review; wallets: WalletOption[];
  categories: Props["categories"]; transactions: Existing[] }) {
  const router = useRouter();
  const [action, setAction] = useState("POST"), [categoryId, setCategoryId] = useState(""), [otherWalletId, setOtherWalletId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const kind = item.direction === "IN" ? "INCOME" : "EXPENSE";
  const matching = transactions.filter(t => t.amount === item.amount &&
    ((t.kind === kind && t.walletId === item.walletId) || (t.kind === "TRANSFER" &&
      (item.direction === "IN" ? t.destinationWalletId === item.walletId : t.walletId === item.walletId))) &&
    Math.abs(new Date(t.occurredAt).getTime() - new Date(item.occurredAt).getTime()) <= 72 * 3600 * 1000);
  const eligible = item.bookingStatus === "BOOKED" && item.reasonCode !== "SOURCE_CONFLICT" && item.reasonCode !== "REVERSAL_REQUIRED";
  const selectedAction = !eligible || (item.beforeCutover && (action === "POST" || action === "TRANSFER")) ? "IGNORE" : action;
  const options = categories.filter(c => c.kind === kind);
  async function resolve() {
    if (!window.confirm("Xác nhận xử lý dòng sao kê này? Ghi sổ sẽ ảnh hưởng số dư và báo cáo.")) return;
    setBusy(true); setError("");
    try {
      const payload = selectedAction === "POST" ? { action: selectedAction, categoryId: categoryId || options[0]?.id } :
        selectedAction === "TRANSFER" ? { action: selectedAction, otherWalletId } : selectedAction === "LINK" ? { action: selectedAction, transactionId } : { action: selectedAction };
      await jsonRequest(`/api/v1/bank-sync/reviews/${item.id}/resolve`, "POST", payload);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lỗi ghi nhận."); }
    finally { setBusy(false); }
  }
  return <article className="card card-pad" style={{ marginBottom: 12 }}>
    <div className="section-header"><div><strong>{formatMoney(item.amount, item.direction)}</strong><p className="section-subtitle">{item.accountMasked} · {formatDate(item.occurredAt)} · {item.providerCode}</p></div>
      <span className="badge">{item.bookingStatus} / {item.reasonCode}</span></div>
    <p>{item.description || "Không có diễn giải"}</p>
    {item.beforeCutover && <p className="section-subtitle" role="note">Trước mốc chuyển đổi: chỉ nên liên kết giao dịch đã có hoặc bỏ qua để tránh ghi số dư hai lần.</p>}
    {!eligible && <p className="section-subtitle" role="status">Dòng này cần tra soát nguồn hoặc đợi trạng thái BOOKED; chưa thể ghi sổ.</p>}
    <div className="form-grid" style={{ marginTop: 12 }}>
      <div className="field"><label htmlFor={`action-${item.id}`}>Cách xử lý</label><select id={`action-${item.id}`} value={selectedAction} onChange={e => setAction(e.target.value)}>
        {eligible && !item.beforeCutover && <option value="POST">Ghi thu/chi vào sổ cái</option>}
        {eligible && !item.beforeCutover && <option value="TRANSFER">Chuyển tiền giữa các ví</option>}
        {eligible && <option value="LINK">Liên kết giao dịch đã ghi</option>}
        <option value="IGNORE">Bỏ qua (không ghi sổ)</option></select></div>
      {selectedAction === "POST" && eligible && !item.beforeCutover && <div className="field"><label htmlFor={`cat-${item.id}`}>Danh mục</label><select id={`cat-${item.id}`} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
        {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      {selectedAction === "TRANSFER" && eligible && !item.beforeCutover && <div className="field"><label htmlFor={`wallet-${item.id}`}>Ví còn lại</label><select id={`wallet-${item.id}`} value={otherWalletId} onChange={e => setOtherWalletId(e.target.value)}>
        <option value="">Chọn ví</option>{wallets.filter(w => w.id !== item.walletId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}
      {selectedAction === "LINK" && eligible && <div className="field"><label htmlFor={`tx-${item.id}`}>Giao dịch trùng đã có</label><select id={`tx-${item.id}`} value={transactionId} onChange={e => setTransactionId(e.target.value)}>
        <option value="">Chọn giao dịch</option>{matching.map(t => <option key={t.id} value={t.id}>{formatMoney(t.amount, item.direction)} · {t.note || t.kind} · {formatDate(t.occurredAt)}</option>)}</select></div>}
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-footer"><button className="button button-primary" type="button" disabled={busy || (selectedAction === "POST" && !options.length) || (selectedAction === "TRANSFER" && !otherWalletId) || (selectedAction === "LINK" && !transactionId)} onClick={resolve}>Xác nhận xử lý</button></div>
  </article>;
}

export function BankSyncManager({ wallets, categories, connections, reviews, sources, transactions, sandboxEnabled, sepayEnabled, defaultCutoverDay }: Props) {
  const router = useRouter();
  const bankWallets = wallets.filter(w => w.type === "BANK");
  const [file, setFile] = useState<File | null>(null), [headers, setHeaders] = useState<string[]>([]);
  const [walletId, setWalletId] = useState(bankWallets[0]?.id || "");
  const [dateColumn, setDateColumn] = useState(""), [inflowColumn, setInflowColumn] = useState(""), [outflowColumn, setOutflowColumn] = useState("");
  const [descriptionColumn, setDescriptionColumn] = useState(""), [referenceColumn, setReferenceColumn] = useState("");
  const [cutoverDay, setCutoverDay] = useState(defaultCutoverDay);
  const [preview, setPreview] = useState<{ fileHash: string; previewToken: string; validCount: number; invalidCount: number; total: number;
    rows: { rowNumber: number; date: string | null; amount: string | null; direction: string | null; error: string | null }[] } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [sourceQuery, setSourceQuery] = useState(""), [sourceDirection, setSourceDirection] = useState("ALL");
  const [sourceStatus, setSourceStatus] = useState("ALL"), [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const sepayConnections = connections.filter(c => c.providerCode === "SEPAY_BANKHUB" && c.status !== "REVOKED");
  const [sepayConnectionId, setSepayConnectionId] = useState(sepayConnections[0]?.id ?? "");
  const [sepayAccounts, setSepayAccounts] = useState<{ xid: string; bankCode: string; accountMasked: string }[]>([]);
  const [sepayAccountXid, setSepayAccountXid] = useState("");
  const [sepayAccepted, setSepayAccepted] = useState(false);
  const [sepayFrom, setSepayFrom] = useState(defaultCutoverDay), [sepayTo, setSepayTo] = useState(defaultCutoverDay);
  const [hostedLink, setHostedLink] = useState("");
  const [unlinkLink, setUnlinkLink] = useState<{ accountId: string; url: string } | null>(null);
  const visibleSources = sources.filter(s =>
    (sourceDirection === "ALL" || s.direction === sourceDirection) &&
    (sourceStatus === "ALL" || s.processingStatus === sourceStatus) &&
    [s.description, s.accountMasked, s.providerCode, s.bankReference || ""].some(value => value.toLocaleLowerCase("vi-VN").includes(sourceQuery.trim().toLocaleLowerCase("vi-VN"))));
  const mapping = { walletId, dateColumn, ...(inflowColumn ? { inflowColumn } : {}), ...(outflowColumn ? { outflowColumn } : {}),
    descriptionColumn, ...(referenceColumn ? { referenceColumn } : {}), cutoverDay };

  function column(id: string, label: string, value: string, set: (v: string) => void, optional = false) {
    return <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e => { set(e.target.value); setPreview(null); }}>
      <option value="">{optional ? "Không có" : "Chọn cột"}</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}</select></div>;
  }
  async function chooseFile(selected?: File) {
    setFile(selected || null); setHeaders([]); setPreview(null); setError(""); setMessage("");
    if (!selected) return;
    try {
      let columns: string[];
      if (selected.name.toLowerCase().endsWith(".csv")) columns = parseCsv(await selected.text())[0].map(x => x.trim());
      else {
        const body = new FormData(); body.append("file", selected);
        const result = await fetch("/api/v1/imports/columns", { method: "POST", body });
        const response = await result.json(); if (!result.ok) throw new Error(response.error?.message || "Lỗi đọc XLSX.");
        columns = response.data.columns;
      }
      setHeaders(columns);
      const choose = (terms: string[]) => columns.find(h => terms.includes(h.toLowerCase())) || "";
      setDateColumn(choose(["date", "ngày", "ngay", "transaction date"]));
      setInflowColumn(choose(["credit", "thu", "tiền vào", "ghi có"]));
      setOutflowColumn(choose(["debit", "chi", "tiền ra", "ghi nợ"]));
      setDescriptionColumn(choose(["description", "diễn giải", "nội dung", "note"]));
      setReferenceColumn(choose(["reference", "mã giao dịch", "transaction id"]));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không đọc được tệp."); }
  }
  async function upload(mode: "preview" | "commit") {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.append("file", file); form.append("mapping", JSON.stringify(mapping));
      if (mode === "commit" && preview) { form.append("fileHash", preview.fileHash); form.append("previewToken", preview.previewToken); }
      const response = await fetch(`/api/v1/bank-sync/imports/${mode}`, { method: "POST", body: form });
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Không xử lý được tệp.");
      if (mode === "preview") setPreview(result.data);
      else { setMessage(`Đã đưa ${result.data.staged} dòng vào hàng chờ, ${result.data.duplicate} dòng trùng, ${result.data.invalid} dòng lỗi. Chờ worker xử lý trước khi xác nhận.`); setPreview(null); router.refresh(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không xử lý được tệp."); }
    finally { setBusy(false); }
  }
  async function changeConnection(id: string, action: string) {
    if (action === "REVOKE" && !window.confirm("Thu hồi quyền đồng bộ tại Finova và giải phóng ví? Giao dịch cũ được giữ lại. Nếu là SePay, cần hủy thêm trên trang SePay để thu hồi quyền phía ngân hàng.")) return;
    setBusy(true); setError("");
    try { await jsonRequest(`/api/v1/bank-sync/connections/${id}`, "PATCH", { action }); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không cập nhật được kết nối."); }
    finally { setBusy(false); }
  }
  async function startSandbox() {
    setBusy(true); setError("");
    try {
      const created = await jsonRequest("/api/v1/bank-sync/connections", "POST", { mode: "SANDBOX", walletId });
      setMessage(`Đã tạo kết nối thử nghiệm: ${created.id}. Mã tài khoản giả lập: ${created.accountRef}. Không kết nối với ngân hàng thật.`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tạo được nguồn thử nghiệm."); }
    finally { setBusy(false); }
  }
  async function startSePay() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await jsonRequest("/api/v1/bank-sync/sepay/link", "POST", {});
      setSepayConnectionId(result.connectionId); setHostedLink(result.hostedLinkUrl);
      setMessage("Mở Hosted Link của SePay để liên kết ngân hàng, sau đó quay lại và tải danh sách tài khoản.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tạo được phiên liên kết SePay."); }
    finally { setBusy(false); }
  }
  async function loadSePayAccounts() {
    if (!sepayConnectionId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/bank-sync/sepay/accounts?connectionId=${encodeURIComponent(sepayConnectionId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Không tải được tài khoản SePay.");
      setSepayAccounts(result.data); setSepayAccountXid(result.data[0]?.xid || "");
      if (!result.data.length) setMessage("Chưa có tài khoản được liên kết. Hãy hoàn tất Hosted Link trước.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được tài khoản SePay."); }
    finally { setBusy(false); }
  }
  async function attachSePay() {
    setBusy(true); setError(""); setMessage("");
    try {
      await jsonRequest("/api/v1/bank-sync/sepay/accounts", "POST", { connectionId: sepayConnectionId,
        accountXid: sepayAccountXid, walletId, acceptedConsent: sepayAccepted });
      setMessage("Đã gắn tài khoản ngân hàng với ví. Có thể đồng bộ sao kê và duyệt giao dịch.");
      setSepayAccounts([]); setSepayAccepted(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không liên kết được tài khoản."); }
    finally { setBusy(false); }
  }
  async function syncSePay(id: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await jsonRequest(`/api/v1/bank-sync/connections/${id}/sync`, "POST", { from: sepayFrom, to: sepayTo });
      setMessage(`SePay: ${result.accepted} giao dịch mới đã được xếp hàng, ${result.duplicates} sự kiện đã có. Chạy worker rồi duyệt trước khi ghi sổ.`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không đồng bộ được sao kê."); }
    finally { setBusy(false); }
  }
  async function startSePayUnlink(connectionId: string, accountId: string) {
    setBusy(true); setError(""); setMessage(""); setUnlinkLink(null);
    try {
      const result = await jsonRequest("/api/v1/bank-sync/sepay/unlink", "POST", { connectionId, accountId });
      setUnlinkLink({ accountId, url: result.hostedLinkUrl });
      setMessage("Mở trang SePay để xác nhận hủy liên kết, sau đó quay lại bấm 'Kiểm tra trạng thái SePay'.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tạo được liên kết hủy SePay."); }
    finally { setBusy(false); }
  }
  async function refreshSePay(connectionId: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await jsonRequest("/api/v1/bank-sync/sepay/refresh", "POST", { connectionId });
      setUnlinkLink(null);
      setMessage(`Đã xác minh trạng thái qua SePay: ${result.deactivated} tài khoản được ngắt, ${result.active} tài khoản đang hoạt động.`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không kiểm tra được trạng thái SePay."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-head feature-page-head"><div><h1 className="page-title">Đồng bộ sao kê ngân hàng</h1>
      <p className="subtitle">Nhập sao kê có kiểm soát, xem xét giao dịch và ghi sổ từ nguồn có thể truy vết.</p></div></div>
    <div className="card card-pad" role="status" style={{ marginBottom: 20 }}><h2 className="section-title">Tình trạng hỗ trợ</h2>
      <p>Hỗ trợ <strong>nhập tệp CSV/XLSX</strong>{sandboxEnabled ? " và mô phỏng nội bộ" : ""}{sepayEnabled ? ". SePay Bank Hub đã được bật theo cấu hình đối tác; cần hoàn tất Hosted Link và xác minh tài khoản trước khi đồng bộ." : ". Kết nối SePay Bank Hub đang chờ cấu hình đối tác."} Mọi giao dịch đều cần người dùng xác nhận trước khi ghi sổ.</p>
      <p className="section-subtitle">Sao kê có thể chậm hoặc thiếu dòng. Không nhập OTP/mật khẩu ngân hàng vào Finova.</p></div>
    <section className="card card-pad" style={{ marginBottom: 20 }}><h2 className="section-title">Tải sao kê CSV/XLSX</h2>
      <p className="section-subtitle">Chọn ví ngân hàng, ánh xạ cột ngày, tiền vào/ra và diễn giải. Xem trước không ghi sổ; xác nhận sẽ đưa các dòng hợp lệ vào hàng đợi để kiểm tra thủ công.</p>
      <div className="form-grid" style={{ marginTop: 18 }}>
        <div className="field"><label htmlFor="bank-statement-file">Tệp sao kê (tối đa 5 MB)</label><input id="bank-statement-file" type="file" accept=".csv,.xlsx" onChange={e => void chooseFile(e.target.files?.[0])} /></div>
        <div className="field"><label htmlFor="bank-statement-wallet">Ví ngân hàng</label><select id="bank-statement-wallet" value={walletId} onChange={e => { setWalletId(e.target.value); setPreview(null); }}>
          {bankWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        {headers.length > 0 && <>{column("bank-col-date", "Cột ngày", dateColumn, setDateColumn)}
          {column("bank-col-in", "Cột tiền vào", inflowColumn, setInflowColumn, true)}
          {column("bank-col-out", "Cột tiền ra", outflowColumn, setOutflowColumn, true)}
          {column("bank-col-description", "Cột diễn giải", descriptionColumn, setDescriptionColumn)}
          {column("bank-col-reference", "Cột tham chiếu", referenceColumn, setReferenceColumn, true)}</>}
        <div className="field"><label htmlFor="bank-cutover">Mốc bắt đầu ghi nhận biến động mới</label><input id="bank-cutover" type="date" value={cutoverDay} onChange={e => { setCutoverDay(e.target.value); setPreview(null); }} /></div>
      </div>
      <p className="section-subtitle">Dòng trước mốc này chỉ dùng để đối chiếu; không ghi thêm vào số dư ví. Chọn mốc cẩn thận nếu ví đã có số dư đầu kỳ hoặc giao dịch thủ công.</p>
      <div className="form-footer"><button type="button" className="button button-primary" disabled={busy || !file || !walletId || !dateColumn || !descriptionColumn || (!inflowColumn && !outflowColumn)} onClick={() => void upload("preview")}>Xem trước</button></div>
      {preview && <div style={{ marginTop: 16 }}><p role="status">Tổng {preview.total} dòng · Hợp lệ {preview.validCount} · Cần sửa {preview.invalidCount}</p>
        <div className="table-wrap"><table><thead><tr><th>Dòng</th><th>Ngày</th><th>Chiều</th><th>Số tiền</th><th>Kết quả</th></tr></thead><tbody>
          {preview.rows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.date || "—"}</td><td>{row.direction || "—"}</td><td>{row.amount ? Number(row.amount).toLocaleString("vi-VN") : "—"}</td><td>{row.error || "Hợp lệ"}</td></tr>)}
        </tbody></table></div><p className="section-subtitle">Hiển thị tối đa 100 dòng đầu. Không tự động ghi nhận các dòng lỗi.</p>
        <button type="button" className="button button-primary" disabled={busy || !preview.validCount} onClick={() => void upload("commit")}>Xác nhận đưa vào hàng đợi</button></div>}
    </section>
    {sandboxEnabled && <section className="card card-pad" style={{ marginBottom: 20 }}><h2 className="section-title">Thử nghiệm webhook nội bộ</h2><p className="section-subtitle">Chỉ dành cho môi trường phát triển; không liên kết ngân hàng thật.</p>
      <button type="button" className="button button-outline" disabled={busy || !walletId} onClick={() => void startSandbox()}>Tạo kết nối sandbox cho ví đang chọn</button></section>}
    {sepayEnabled && <section className="card card-pad" style={{ marginBottom: 20 }} aria-label="SePay Bank Hub">
      <h2 className="section-title">Đồng bộ tự động qua SePay Bank Hub</h2>
      <p className="section-subtitle">Liên kết ngân hàng trên trang SePay. Finova chỉ nhận sao kê khi tài khoản đã được gắn với ví và bạn đồng ý đồng bộ. Không nhập mật khẩu hoặc OTP ngân hàng vào Finova.</p>
      <div className="form-footer"><button type="button" className="button button-outline" disabled={busy} onClick={() => void startSePay()}>Tạo Hosted Link SePay</button>
        {hostedLink && <a className="button button-primary" href={hostedLink} target="_blank" rel="noopener noreferrer">Mở trang liên kết SePay</a>}</div>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label htmlFor="sepay-connection">Kết nối SePay</label><select id="sepay-connection" value={sepayConnectionId} onChange={e => { setSepayConnectionId(e.target.value); setSepayAccounts([]); }}>
          <option value="">Chọn kết nối</option>{sepayConnections.map(c => <option key={c.id} value={c.id}>{c.id.slice(-8)} · {c.status}</option>)}</select></div>
        <div className="field"><label htmlFor="sepay-account">Tài khoản đã liên kết</label><select id="sepay-account" value={sepayAccountXid} onChange={e => setSepayAccountXid(e.target.value)}>
          <option value="">Chọn tài khoản</option>{sepayAccounts.map(a => <option key={a.xid} value={a.xid}>{a.bankCode} · {a.accountMasked}</option>)}</select></div>
      </div>
      <button className="button button-outline" type="button" disabled={busy || !sepayConnectionId} onClick={() => void loadSePayAccounts()}>Tải tài khoản từ SePay</button>
      <div className="field" style={{ marginTop: 14 }}><label htmlFor="sepay-consent"><input id="sepay-consent" type="checkbox" checked={sepayAccepted} onChange={e => setSepayAccepted(e.target.checked)} /> Tôi đồng ý cho Finova đồng bộ lịch sử giao dịch tài khoản này để đối soát với ví đã chọn.</label></div>
      <button type="button" className="button button-primary" disabled={busy || !sepayConnectionId || !sepayAccountXid || !walletId || !sepayAccepted} onClick={() => void attachSePay()}>Gắn tài khoản với ví đã chọn</button>
      {sepayConnections.some(c => c.status === "ACTIVE") && <div style={{ marginTop: 20 }}><h3>Đồng bộ lịch sử giao dịch</h3>
        <div className="form-grid"><div className="field"><label htmlFor="sepay-from">Từ ngày</label><input id="sepay-from" type="date" value={sepayFrom} onChange={e => setSepayFrom(e.target.value)} /></div>
          <div className="field"><label htmlFor="sepay-to">Đến ngày</label><input id="sepay-to" type="date" value={sepayTo} onChange={e => setSepayTo(e.target.value)} /></div></div>
        {sepayConnections.filter(c => c.status === "ACTIVE").map(c => <button key={c.id} type="button" className="button button-outline" disabled={busy} onClick={() => void syncSePay(c.id)}>Đồng bộ tài khoản {c.id.slice(-8)}</button>)}
        <p className="section-subtitle">Tối đa 31 ngày/lần. Trường hợp sai lệch, hãy đối soát giao dịch tại SePay trước khi duyệt ghi sổ.</p></div>}
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section style={{ marginBottom: 22 }}><h2 className="section-title">Nguồn và tài khoản ({connections.length})</h2>
      {!connections.length ? <div className="card card-pad"><p>Chưa có nguồn sao kê. Tải tệp để bắt đầu.</p></div> : connections.map(c => <article className="card card-pad" key={c.id} style={{ marginTop: 10 }}>
        <div className="section-header"><div><strong>{c.providerCode === "SANDBOX" ? "Nguồn mô phỏng" : c.providerCode === "SEPAY_BANKHUB" ? "SePay Bank Hub" : "Sao kê tải lên"}</strong><p className="section-subtitle">{c.accounts.map(a => `${a.accountMasked} · ${wallets.find(w => w.id === a.walletId)?.name || "Chưa gắn ví"}`).join(", ")}</p></div>
          <span className="badge">{c.status}</span></div>
        <p className="section-subtitle">Chính sách: {c.postingPolicy} · Mốc cutover: {c.cutoverAt ? formatDate(c.cutoverAt) : "—"} · Đồng bộ gần nhất: {c.lastSyncedAt ? formatDate(c.lastSyncedAt) : "—"}</p>
        {c.status !== "REVOKED" && <div className="import-actions">
          <button className="button button-outline" type="button" disabled={busy} onClick={() => void changeConnection(c.id, c.status === "ACTIVE" ? "PAUSE" : "RESUME")}>{c.status === "ACTIVE" ? "Tạm dừng" : "Tiếp tục"}</button>
          <button className="button button-outline" type="button" disabled={busy} onClick={() => void changeConnection(c.id, "REVOKE")}>{c.providerCode === "SEPAY_BANKHUB" ? "Dừng đồng bộ Finova" : "Ngắt nguồn"}</button></div>}
        {c.providerCode === "SEPAY_BANKHUB" && c.status !== "REVOKED" && <div style={{ marginTop: 12 }}>
          <p className="section-subtitle">Muốn hủy tại ngân hàng, mở luồng xác nhận SePay của từng tài khoản. Sau khi hoàn tất, kiểm tra trạng thái để Finova ngừng nhận sao kê của tài khoản đã hủy.</p>
          <div className="import-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => void refreshSePay(c.id)}>Kiểm tra trạng thái SePay</button>
            {c.accounts.filter(a => a.status === "ACTIVE").map(a => <Fragment key={a.id}>
              <button type="button" className="button button-outline" disabled={busy} onClick={() => void startSePayUnlink(c.id, a.id)}>Hủy trên SePay · {a.accountMasked}</button>
              {unlinkLink?.accountId === a.id && <a className="button button-primary" href={unlinkLink.url} target="_blank" rel="noopener noreferrer">Mở trang xác nhận hủy</a>}
            </Fragment>)}</div></div>}
        {c.providerCode === "SEPAY_BANKHUB" && <p className="section-subtitle">Thu hồi quyền tại Finova dừng đồng bộ và giải phóng liên kết ví, nhưng không tự hủy quyền tại SePay.</p>}
      </article>)}</section>
    <section style={{ marginBottom: 22 }}><h2 className="section-title">Cần xác nhận ({reviews.length})</h2>
      {!reviews.length ? <div className="card card-pad"><p>Chưa có giao dịch cần xác nhận. Worker sẽ chuyển các dòng đã nhập thành mục xem xét.</p></div> : reviews.map(r => <ReviewCard key={r.id} item={r} wallets={wallets} categories={categories} transactions={transactions} />)}</section>
    <section className="card card-pad"><h2 className="section-title">Lịch sử nguồn ({sources.length} gần nhất)</h2>
      <p className="section-subtitle">Bộ lọc áp dụng cho tối đa 50 dòng gần nhất. Các thông tin gốc từ ngân hàng/tệp được giữ nguyên để tra soát.</p>
      {sources.length > 0 && <div className="form-grid" style={{ marginTop: 12, marginBottom: 16 }}>
        <div className="field"><label htmlFor="bank-source-query">Tìm nguồn / diễn giải / mã tham chiếu</label><input id="bank-source-query" value={sourceQuery} onChange={e => setSourceQuery(e.target.value)} placeholder="Nhập từ khóa" /></div>
        <div className="field"><label htmlFor="bank-source-direction">Chiều tiền</label><select id="bank-source-direction" value={sourceDirection} onChange={e => setSourceDirection(e.target.value)}>
          <option value="ALL">Tất cả</option><option value="IN">Tiền vào</option><option value="OUT">Tiền ra</option></select></div>
        <div className="field"><label htmlFor="bank-source-status">Trạng thái xử lý</label><select id="bank-source-status" value={sourceStatus} onChange={e => setSourceStatus(e.target.value)}>
          <option value="ALL">Tất cả</option>{["REVIEW_REQUIRED", "LINKED", "IGNORED", "STAGED", "RESOLVING"].map(status => <option key={status} value={status}>{status}</option>)}</select></div>
      </div>}
      {!sources.length ? <p>Chưa có giao dịch từ sao kê.</p> : !visibleSources.length ? <p>Không có dòng phù hợp trong 50 dòng gần nhất.</p> :
        <div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Nguồn</th><th>Diễn giải</th><th>Số tiền</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>
          {visibleSources.map(s => <Fragment key={s.id}><tr><td>{formatDate(s.occurredAt)}</td><td>{s.providerCode} · {s.accountMasked}</td><td>{s.description}</td>
            <td>{formatMoney(s.amount, s.direction)}</td><td>{s.processingStatus} · {s.bookingStatus}{s.linkedIds.length > 0 && <> · <a href={`/transactions?transactionId=${s.linkedIds[0]}`}>Xem sổ cái</a></>}</td>
            <td><button type="button" className="button button-outline" aria-expanded={expandedSourceId === s.id} onClick={() => setExpandedSourceId(expandedSourceId === s.id ? null : s.id)}>{expandedSourceId === s.id ? "Thu gọn" : "Xem nguồn"}</button></td></tr>
            {expandedSourceId === s.id && <tr><td colSpan={6}><div className="section-subtitle" role="region" aria-label={`Thông tin nguồn ${s.id}`}>
              <p>Mã nguồn: {s.id} · Mã tham chiếu: {s.bankReference || "Không có"} · Phiên bản: {s.sourceVersion}</p>
              <p>Nhận lúc: {formatDate(s.receivedAt)} · Sự kiện gốc: {s.rawEventId || "Không có"}</p>
              <p>Giao dịch sổ cái: {s.linkedIds.length ? s.linkedIds.join(", ") : "Chưa liên kết"}</p>
            </div></td></tr>}
          </Fragment>)}
        </tbody></table></div>}</section>
  </>;
}
