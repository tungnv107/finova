"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/csv-import";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronDown, CircleHelp, Clock3, ExternalLink, FileSpreadsheet, Landmark, Link2, LockKeyhole, RefreshCw, Search, ShieldCheck, UploadCloud, Wallet, Pause, Play, Unplug, MoreHorizontal } from "lucide-react";
import { ActionMenu, ContentTabs } from "@/components/ui/interaction-controls";
import styles from "./bank-sync.module.css";

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
const connectionStatusLabel = (status: string) => ({ ACTIVE: "Đang hoạt động", PAUSED: "Đã tạm dừng", PENDING: "Chờ xác minh", REVOKED: "Đã ngắt kết nối" })[status as "ACTIVE"] || status;
const sourceStatusLabel = (status: string) => ({ REVIEW_REQUIRED: "Chờ xác nhận", LINKED: "Đã liên kết", IGNORED: "Đã bỏ qua", STAGED: "Đang chờ xử lý", RESOLVING: "Đang xử lý" })[status as "STAGED"] || status;
const bookingStatusLabel = (status: string) => ({ BOOKED: "Đã hạch toán", PENDING: "Đang chờ", REVERSED: "Đã hoàn" })[status as "BOOKED"] || status;

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
  return <article className={`${styles.reviewCard} card card-pad`}>
    <div className={styles.reviewTop}><div className={styles.reviewAmount}><span className={item.direction === "IN" ? styles.incomeIcon : styles.expenseIcon}>{item.direction === "IN" ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}</span><div><strong className={item.direction === "IN" ? styles.incomeText : styles.expenseText}>{formatMoney(item.amount, item.direction)}</strong><p className={styles.muted}>{item.accountMasked} · {formatDate(item.occurredAt)} · {item.providerCode}</p></div></div>
      <span className={styles.statusWarning}>{bookingStatusLabel(item.bookingStatus)} · {item.reasonCode}</span></div>
    <p className={styles.reviewDescription}>{item.description || "Không có diễn giải"}</p>
    {item.beforeCutover && <p className={styles.inlineNotice} role="note"><AlertCircle size={16} /> Trước mốc chuyển đổi: chỉ liên kết giao dịch đã có hoặc bỏ qua để tránh ghi số dư hai lần.</p>}
    {!eligible && <p className={styles.inlineNotice} role="status"><AlertCircle size={16} /> Dòng này cần tra soát nguồn hoặc đợi trạng thái đã hạch toán trước khi ghi sổ.</p>}
    <div className="form-grid">
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
    <div className={styles.actionsEnd}><button className="button button-primary" type="button" disabled={busy || (selectedAction === "POST" && !options.length) || (selectedAction === "TRANSFER" && !otherWalletId) || (selectedAction === "LINK" && !transactionId)} onClick={resolve}><CheckCircle2 size={16} /> Xác nhận xử lý</button></div>
  </article>;
}

export function BankSyncManager({ wallets, categories, connections, reviews, sources, transactions, sandboxEnabled, sepayEnabled, defaultCutoverDay }: Props) {
  const [bankView, setBankView] = useState<"connect" | "upload" | "reviews" | "history">("connect");
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
  const activeConnections = connections.filter(c => c.status === "ACTIVE").length;
  const hasActiveSePay = sepayConnections.some(c => c.status === "ACTIVE");

  return <div className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroContent}>
        <span className={styles.heroEyebrow}><ShieldCheck size={15} /> KẾT NỐI NGÂN HÀNG AN TOÀN</span>
        <h1>Đồng bộ sao kê ngân hàng</h1>
        <p>Quản lý sao kê tập trung, đối soát giao dịch và cập nhật sổ thu chi với sự kiểm soát của bạn.</p>
        <div className={styles.heroPills}><span><CheckCircle2 size={15} /> Có bước xác nhận trước ghi sổ</span><span><LockKeyhole size={15} /> Không lưu mật khẩu ngân hàng</span></div>
      </div>
      <div className={styles.heroIllustration} aria-hidden="true"><div className={styles.heroRing}><Landmark size={52} strokeWidth={1.4} /><span className={styles.heroCheck}><CheckCircle2 size={22} /></span></div></div>
    </header>

    <div className={styles.summaryGrid} aria-label="Tổng quan đồng bộ sao kê">
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.iconBlue}`}><Link2 size={21} /></span><div><span className={styles.summaryLabel}>Nguồn đang hoạt động</span><strong>{activeConnections}</strong><small>{connections.length} nguồn đã thiết lập</small></div></div>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.iconAmber}`}><Clock3 size={21} /></span><div><span className={styles.summaryLabel}>Cần xác nhận</span><strong>{reviews.length}</strong><small>Giao dịch chờ kiểm tra</small></div></div>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.iconTeal}`}><FileSpreadsheet size={21} /></span><div><span className={styles.summaryLabel}>Dòng sao kê gần đây</span><strong>{sources.length}</strong><small>Tối đa 50 dòng mới nhất</small></div></div>
    </div>

    <div className={styles.supportNote} role="note"><ShieldCheck size={19} /><p><strong>Đồng bộ có kiểm soát.</strong> Sao kê nhập từ tệp hoặc SePay được đưa vào hàng chờ để đối soát trước khi ghi sổ. Dữ liệu từ ngân hàng có thể đến chậm; tuyệt đối không nhập mật khẩu hoặc OTP vào Finova.</p></div>

    {error && <div className={styles.errorNotice} role="alert"><AlertCircle size={19} /><span>{error}</span></div>}
    {message && <div className={styles.successNotice} role="status"><CheckCircle2 size={19} /><span>{message}</span></div>}

    <ContentTabs idBase="bank-view" label="Nhóm thông tin đồng bộ ngân hàng" value={bankView} onChange={setBankView} options={[
      { value: "connect", label: `Kết nối (${connections.length})` }, { value: "upload", label: "Nhập tệp" },
      { value: "reviews", label: `Cần đối soát (${reviews.length})` }, { value: "history", label: "Lịch sử" },
    ]} />

    {bankView === "upload" && <div id="bank-view-panel-upload" role="tabpanel" aria-labelledby="bank-view-tab-upload" tabIndex={0} className="v4-bank-section">
    <div className={`${styles.setupGrid} v4-bank-single`}>
      <section className={`${styles.panel} card`} aria-labelledby="bank-upload-heading">
        <div className={styles.panelHeader}><span className={`${styles.panelIcon} ${styles.iconBlue}`}><UploadCloud size={23} /></span><div><span className={styles.eyebrow}>NHẬP SAO KÊ</span><h2 id="bank-upload-heading">Tải tệp CSV / XLSX</h2><p>Nhập sao kê có sẵn từ ngân hàng của bạn.</p></div></div>
        <label htmlFor="bank-statement-file" className={styles.uploadZone}>
          <span className={styles.uploadZoneIcon}><FileSpreadsheet size={25} /></span>
          <span className={styles.uploadZoneText}><strong>{file ? file.name : "Chọn tệp sao kê để tải lên"}</strong><small>{file ? "Đã chọn tệp · Nhấn để thay đổi" : "Hỗ trợ định dạng CSV, XLSX · Tối đa 5 MB"}</small></span>
          <span className={styles.uploadZoneAction}>Chọn tệp</span>
          <input id="bank-statement-file" type="file" accept=".csv,.xlsx" onChange={e => void chooseFile(e.target.files?.[0])} />
        </label>
        <div className={styles.fields}>
          <div className="field"><label htmlFor="bank-statement-wallet">Ví nhận sao kê</label><select id="bank-statement-wallet" value={walletId} onChange={e => { setWalletId(e.target.value); setPreview(null); setSepayAccepted(false); }}>
            {!bankWallets.length && <option value="">Chưa có ví ngân hàng</option>}{bankWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div className="field"><label htmlFor="bank-cutover">Bắt đầu ghi nhận từ ngày</label><input id="bank-cutover" type="date" value={cutoverDay} onChange={e => { setCutoverDay(e.target.value); setPreview(null); }} /></div>
        </div>
        {headers.length > 0 && <div className={styles.mappingSection}><div className={styles.mappingTitle}><CheckCircle2 size={17} /><strong>Ánh xạ cột sao kê</strong></div><div className={styles.fields}>
          {column("bank-col-date", "Cột ngày", dateColumn, setDateColumn)}
          {column("bank-col-description", "Cột diễn giải", descriptionColumn, setDescriptionColumn)}
          {column("bank-col-in", "Cột tiền vào", inflowColumn, setInflowColumn, true)}
          {column("bank-col-out", "Cột tiền ra", outflowColumn, setOutflowColumn, true)}
          {column("bank-col-reference", "Cột tham chiếu", referenceColumn, setReferenceColumn, true)}
        </div></div>}
        <p className={styles.hint}><CircleHelp size={16} /> Giao dịch trước ngày bắt đầu chỉ dùng để đối chiếu, không cộng lại vào số dư ví.</p>
        <div className={styles.panelActions}><button type="button" className="button button-primary" disabled={busy || !file || !walletId || !dateColumn || !descriptionColumn || (!inflowColumn && !outflowColumn)} onClick={() => void upload("preview")}><FileSpreadsheet size={17} /> Xem trước sao kê</button></div>
        {preview && <div className={styles.previewPanel}><div className={styles.previewHeader}><strong>Kết quả kiểm tra tệp</strong><div className={styles.previewStats}><span>{preview.total} dòng</span><span className={styles.incomeText}>{preview.validCount} hợp lệ</span><span className={styles.expenseText}>{preview.invalidCount} cần sửa</span></div></div>
          <div className={styles.tableScroll}><table><thead><tr><th>Dòng</th><th>Ngày</th><th>Chiều</th><th>Số tiền</th><th>Kết quả</th></tr></thead><tbody>
            {preview.rows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.date || "—"}</td><td>{row.direction === "IN" ? "Tiền vào" : row.direction === "OUT" ? "Tiền ra" : "—"}</td><td>{row.amount ? Number(row.amount).toLocaleString("vi-VN") : "—"}</td><td>{row.error || "Hợp lệ"}</td></tr>)}
          </tbody></table></div><p className={styles.muted}>Hiển thị tối đa 100 dòng. Dòng lỗi sẽ không được đưa vào hàng chờ.</p>
          <div className={styles.panelActions}><button type="button" className="button button-primary" disabled={busy || !preview.validCount} onClick={() => void upload("commit")}><CheckCircle2 size={16} /> Xác nhận đưa vào hàng đợi</button></div></div>}
      </section>
    </div></div>}

    {bankView === "connect" && <div id="bank-view-panel-connect" role="tabpanel" aria-labelledby="bank-view-tab-connect" tabIndex={0} className="v4-bank-section">
    <div className={`${styles.setupGrid} v4-bank-single`}>
      {sepayEnabled ? <section className={`${styles.panel} card`} aria-labelledby="sepay-heading">
        <div className={styles.panelHeader}><span className={`${styles.panelIcon} ${styles.iconTeal}`}><Landmark size={23} /></span><div><span className={styles.eyebrow}>KẾT NỐI TỰ ĐỘNG</span><h2 id="sepay-heading">SePay Bank Hub</h2><p>Liên kết tài khoản và đồng bộ biến động số dư.</p></div>
          <span className={hasActiveSePay ? styles.statusSuccess : styles.statusNeutral}>{hasActiveSePay ? "Đang kết nối" : "Chưa kết nối"}</span></div>
        <div className={styles.step}><span className={styles.stepNumber}>1</span><div className={styles.stepContent}><h3>Liên kết ngân hàng</h3><p>Thực hiện xác minh trên trang bảo mật của SePay.</p>
          <div className={styles.actionRow}><button type="button" className="button button-outline" disabled={busy} onClick={() => void startSePay()}><Link2 size={16} /> Tạo liên kết SePay</button>
            {hostedLink && <a className="button button-primary" href={hostedLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Mở trang liên kết</a>}</div></div></div>
        <div className={styles.step}><span className={styles.stepNumber}>2</span><div className={styles.stepContent}><h3>Chọn tài khoản</h3><p>Tải tài khoản đã xác minh và gắn với ví trong Finova.</p>
          <div className={styles.fields}>
            <div className="field"><label htmlFor="sepay-connection">Phiên kết nối SePay</label><select id="sepay-connection" value={sepayConnectionId} onChange={e => { setSepayConnectionId(e.target.value); setSepayAccounts([]); setSepayAccountXid(""); setSepayAccepted(false); }}>
              <option value="">Chọn kết nối</option>{sepayConnections.map(c => <option key={c.id} value={c.id}>{c.id.slice(-8)} · {connectionStatusLabel(c.status)}</option>)}</select></div>
            <div className="field"><label htmlFor="sepay-account">Tài khoản đã xác minh</label><select id="sepay-account" value={sepayAccountXid} onChange={e => setSepayAccountXid(e.target.value)} disabled={!sepayAccounts.length}>
              <option value="">Chọn tài khoản</option>{sepayAccounts.map(a => <option key={a.xid} value={a.xid}>{a.bankCode} · {a.accountMasked}</option>)}</select></div>
          </div>
          <div className={styles.actionRow}><button type="button" className="button button-outline" disabled={busy || !sepayConnectionId} onClick={() => void loadSePayAccounts()}><RefreshCw size={16} /> Tải danh sách tài khoản</button></div>
        </div></div>
        <div className={`${styles.step} ${styles.stepLast}`}><span className={styles.stepNumber}>3</span><div className={styles.stepContent}><h3>Xác nhận đồng bộ</h3><div className={`${styles.walletField} field`}><label htmlFor="sepay-wallet"><Wallet size={16} /> Ví nhận giao dịch</label><select id="sepay-wallet" value={walletId} onChange={e => { setWalletId(e.target.value); setSepayAccepted(false); }}>
          {!bankWallets.length && <option value="">Chưa có ví ngân hàng</option>}{bankWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <label htmlFor="sepay-consent" className={styles.consent}><input id="sepay-consent" type="checkbox" checked={sepayAccepted} onChange={e => setSepayAccepted(e.target.checked)} /><span>Tôi đồng ý cho Finova đồng bộ lịch sử giao dịch tài khoản này để đối soát với ví đã chọn.</span></label>
          <button type="button" className="button button-primary" disabled={busy || !sepayConnectionId || !sepayAccountXid || !walletId || !sepayAccepted} onClick={() => void attachSePay()}><CheckCircle2 size={16} /> Gắn tài khoản với ví</button>
        </div></div>
        {hasActiveSePay && <div className={styles.syncHistory}><div className={styles.syncHistoryTitle}><RefreshCw size={18} /><div><h3>Đồng bộ lịch sử giao dịch</h3><p>Tải bổ sung giao dịch trong khoảng thời gian tối đa 31 ngày.</p></div></div>
          <div className={styles.fields}><div className="field"><label htmlFor="sepay-from">Từ ngày</label><input id="sepay-from" type="date" value={sepayFrom} onChange={e => setSepayFrom(e.target.value)} /></div>
            <div className="field"><label htmlFor="sepay-to">Đến ngày</label><input id="sepay-to" type="date" value={sepayTo} onChange={e => setSepayTo(e.target.value)} /></div></div>
          <div className={styles.actionRow}>{sepayConnections.filter(c => c.status === "ACTIVE").map(c => <button key={c.id} type="button" className="button button-outline" disabled={busy} onClick={() => void syncSePay(c.id)}><RefreshCw size={16} /> Đồng bộ kết nối {c.id.slice(-8)}</button>)}</div>
          <p className={styles.muted}>Đối chiếu các sai lệch tại SePay trước khi duyệt ghi sổ.</p></div>}
      </section> : <section className={`${styles.panel} card`}><div className={styles.panelHeader}><span className={`${styles.panelIcon} ${styles.iconTeal}`}><Landmark size={23} /></span><div><span className={styles.eyebrow}>KẾT NỐI TỰ ĐỘNG</span><h2>SePay Bank Hub</h2><p>Đang chờ cấu hình kết nối đối tác.</p></div></div><div className={styles.emptyCompact}><LockKeyhole size={26} /><strong>Chưa bật kết nối tự động</strong><p>Bạn vẫn có thể nhập sao kê CSV hoặc XLSX ở mục bên cạnh.</p></div></section>}
    </div>

    {sandboxEnabled && <section className={`${styles.sandbox} card`}><div><strong>Kiểm thử webhook nội bộ</strong><p>Chỉ dành cho môi trường phát triển; không sử dụng tài khoản ngân hàng thật.</p></div><button type="button" className="button button-outline" disabled={busy || !walletId} onClick={() => void startSandbox()}>Tạo kết nối thử nghiệm</button></section>}

    <section className={styles.recordsSection} aria-labelledby="connections-heading"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>QUẢN LÝ NGUỒN</span><h2 id="connections-heading">Nguồn và tài khoản <span>{connections.length}</span></h2><p>Kiểm tra trạng thái và quyền đồng bộ của từng nguồn sao kê.</p></div></div>
      {!connections.length ? <div className={styles.emptyState}><Link2 size={27} /><strong>Chưa có nguồn sao kê</strong><p>Hãy tải tệp hoặc liên kết ngân hàng để bắt đầu nhận giao dịch.</p></div> : <div className={styles.connectionList}>{connections.map(c => <article className={`${styles.connectionCard} card`} key={c.id}>
        <div className={styles.connectionMain}><span className={`${styles.connectionIcon} ${c.status === "REVOKED" ? styles.iconMuted : styles.iconBlue}`}><Landmark size={21} /></span><div className={styles.connectionDetails}><div className={styles.connectionTitle}><h3>{c.providerCode === "SANDBOX" ? "Nguồn mô phỏng" : c.providerCode === "SEPAY_BANKHUB" ? "SePay Bank Hub" : "Sao kê tải lên"}</h3><span className={c.status === "ACTIVE" ? styles.statusSuccess : c.status === "REVOKED" ? styles.statusRevoked : styles.statusNeutral}>{connectionStatusLabel(c.status)}</span></div>
          <p>{c.accounts.length ? c.accounts.map(a => `${a.accountMasked} · ${wallets.find(w => w.id === a.walletId)?.name || "Chưa gắn ví"}`).join(" · ") : "Chưa có tài khoản được gắn ví"}</p>
          <div className={styles.connectionMeta}><span>Chính sách: {c.postingPolicy === "REVIEW_FIRST" ? "Duyệt trước khi ghi sổ" : c.postingPolicy}</span><span>Mốc bắt đầu: {c.cutoverAt ? formatDate(c.cutoverAt) : "—"}</span><span>Đồng bộ gần nhất: {c.lastSyncedAt ? formatDate(c.lastSyncedAt) : "Chưa có"}</span></div>
        </div></div>
        {c.status !== "REVOKED" && <div className={styles.connectionActions}>
  <ActionMenu label={`Thao tác nguồn ${c.id.slice(-8)}`} icon={MoreHorizontal} prominent disabled={busy} items={[
    { label: c.status === "ACTIVE" ? "Tạm dừng" : "Tiếp tục", icon: c.status === "ACTIVE" ? Pause : Play,
      onSelect: () => void changeConnection(c.id, c.status === "ACTIVE" ? "PAUSE" : "RESUME") },
    ...(c.providerCode === "SEPAY_BANKHUB" ? [{ label: "Kiểm tra SePay", icon: RefreshCw, onSelect: () => void refreshSePay(c.id) }] : []),
    ...((c.providerCode === "SEPAY_BANKHUB" ? c.accounts.filter(a => a.status === "ACTIVE") : []).map(a => ({
      label: `Hủy trên SePay · ${a.accountMasked}`, icon: Unplug, danger: true, onSelect: () => void startSePayUnlink(c.id, a.id),
    }))),
    { label: c.providerCode === "SEPAY_BANKHUB" ? "Dừng đồng bộ Finova" : "Ngắt nguồn", icon: Unplug, danger: true,
      onSelect: () => void changeConnection(c.id, "REVOKE") },
  ]} />
  {unlinkLink && c.accounts.some(a => a.id === unlinkLink.accountId) && <a className="button button-primary" href={unlinkLink.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Xác nhận hủy trên SePay</a>}
</div>}
        {c.providerCode === "SEPAY_BANKHUB" && <p className={styles.connectionFootnote}>Ngắt tại Finova chỉ dừng tiếp nhận sao kê. Để thu hồi quyền phía ngân hàng, cần hoàn tất xác nhận hủy trên SePay.</p>}
      </article>)}</div>}
    </section></div>}

    {bankView === "reviews" && <div id="bank-view-panel-reviews" role="tabpanel" aria-labelledby="bank-view-tab-reviews" tabIndex={0} className="v4-bank-section">
    <section className={styles.recordsSection} aria-labelledby="reviews-heading"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>ĐỐI SOÁT GIAO DỊCH</span><h2 id="reviews-heading">Cần xác nhận <span>{reviews.length}</span></h2><p>Xem xét giao dịch ngân hàng trước khi đưa vào sổ thu chi.</p></div></div>
      {!reviews.length ? <div className={styles.emptyState}><CheckCircle2 size={28} /><strong>Không có giao dịch chờ xác nhận</strong><p>Những dòng sao kê đã nhập sẽ xuất hiện ở đây sau khi hệ thống xử lý.</p></div> : <div className={styles.reviewList}>{reviews.map(r => <ReviewCard key={r.id} item={r} wallets={wallets} categories={categories} transactions={transactions} />)}</div>}
    </section></div>}

    {bankView === "history" && <div id="bank-view-panel-history" role="tabpanel" aria-labelledby="bank-view-tab-history" tabIndex={0} className="v4-bank-section">
    <section className={`${styles.sourcePanel} card`} aria-labelledby="history-heading"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>NHẬT KÝ ĐỒNG BỘ</span><h2 id="history-heading">Lịch sử sao kê <span>{sources.length}</span></h2><p>Tra cứu tối đa 50 dòng gần nhất cùng thông tin nguồn gốc để đối chiếu.</p></div></div>
      {sources.length > 0 && <div className={styles.filters}><div className="field"><label htmlFor="bank-source-query">Tìm giao dịch</label><div className={styles.searchField}><Search size={17} /><input id="bank-source-query" value={sourceQuery} onChange={e => setSourceQuery(e.target.value)} placeholder="Diễn giải, tài khoản, mã tham chiếu..." /></div></div>
        <div className="field"><label htmlFor="bank-source-direction">Chiều tiền</label><select id="bank-source-direction" value={sourceDirection} onChange={e => setSourceDirection(e.target.value)}><option value="ALL">Tất cả</option><option value="IN">Tiền vào</option><option value="OUT">Tiền ra</option></select></div>
        <div className="field"><label htmlFor="bank-source-status">Trạng thái</label><select id="bank-source-status" value={sourceStatus} onChange={e => setSourceStatus(e.target.value)}><option value="ALL">Tất cả</option>{["REVIEW_REQUIRED", "LINKED", "IGNORED", "STAGED", "RESOLVING"].map(status => <option key={status} value={status}>{sourceStatusLabel(status)}</option>)}</select></div></div>}
      {!sources.length ? <div className={styles.emptyState}><FileSpreadsheet size={28} /><strong>Chưa có giao dịch từ sao kê</strong><p>Dữ liệu sẽ hiển thị sau khi bạn tải lên tệp hoặc đồng bộ ngân hàng.</p></div> : !visibleSources.length ? <div className={styles.emptyState}><Search size={26} /><strong>Không tìm thấy giao dịch</strong><p>Thử thay đổi từ khóa hoặc bộ lọc để xem các dòng khác.</p></div> :
        <div className={styles.tableScroll}><table className={styles.sourceTable}><thead><tr><th>Thời gian</th><th>Nguồn</th><th>Diễn giải</th><th>Số tiền</th><th>Trạng thái</th><th></th></tr></thead><tbody>
          {visibleSources.map(s => <Fragment key={s.id}><tr><td className={styles.dateCell}>{formatDate(s.occurredAt)}</td><td><strong>{s.providerCode === "SEPAY_BANKHUB" ? "SePay" : s.providerCode}</strong><small>{s.accountMasked}</small></td><td className={styles.descriptionCell}>{s.description || "Không có diễn giải"}</td>
            <td className={`${styles.amountCell} ${s.direction === "IN" ? styles.incomeText : styles.expenseText}`}>{formatMoney(s.amount, s.direction)}</td><td><span className={s.processingStatus === "LINKED" ? styles.statusSuccess : styles.statusNeutral}>{sourceStatusLabel(s.processingStatus)}</span><small>{bookingStatusLabel(s.bookingStatus)}{s.linkedIds.length > 0 && <> · <a href={`/transactions?transactionId=${s.linkedIds[0]}`}>Xem sổ cái</a></>}</small></td>
            <td><button type="button" className={styles.detailButton} aria-label={`${expandedSourceId === s.id ? "Thu gọn" : "Xem nguồn"} giao dịch ${s.id}`} aria-expanded={expandedSourceId === s.id} onClick={() => setExpandedSourceId(expandedSourceId === s.id ? null : s.id)}>Chi tiết <ChevronDown size={15} className={expandedSourceId === s.id ? styles.rotated : ""} /></button></td></tr>
            {expandedSourceId === s.id && <tr><td colSpan={6}><div className={styles.sourceDetails} role="region" aria-label={`Thông tin nguồn ${s.id}`}><p><strong>Mã nguồn:</strong> {s.id}</p><p><strong>Mã tham chiếu:</strong> {s.bankReference || "Không có"} · <strong>Phiên bản:</strong> {s.sourceVersion}</p><p><strong>Nhận lúc:</strong> {formatDate(s.receivedAt)} · <strong>Sự kiện gốc:</strong> {s.rawEventId || "Không có"}</p><p><strong>Giao dịch sổ cái:</strong> {s.linkedIds.length ? s.linkedIds.join(", ") : "Chưa liên kết"}</p></div></td></tr>}
          </Fragment>)}
        </tbody></table></div>}
    </section></div>}
  </div>;
}
