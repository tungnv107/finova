"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Trash2, Pencil, RotateCcw, SlidersHorizontal } from "lucide-react";
import { formatVnd } from "@/lib/money";

type Wallet = { id: string; name: string; archived: boolean; balance: string };
type Category = { id: string; name: string; kind: string };
export type TransactionRow = { id: string; kind: string; amount: string; feeAmount: string; walletId: string; walletName: string; destinationWalletId: string | null; destinationWalletName?: string; categoryId: string | null; categoryName?: string; originalTransactionId: string | null; occurredAt: string; note: string | null; tags: string[]; version: number };

const labels = { INCOME: "Thu tiền", EXPENSE: "Chi tiền", TRANSFER: "Chuyển ví", REFUND: "Hoàn tiền" };

export function TransactionManager({ wallets, categories, rows, nextCursor, selectedTransaction, initialKind, initialWalletId, initialCategoryId, initialCategoryScope = "direct", initialIncludeRefunds = false, initialFeeOnly = false, initialSearch, initialSort = "desc", start, endExclusive }: { wallets: Wallet[]; categories: Category[]; rows: TransactionRow[]; nextCursor: string | null; selectedTransaction?: TransactionRow | null; initialKind?: string; initialWalletId?: string; initialCategoryId?: string; initialCategoryScope?: "direct" | "subtree"; initialIncludeRefunds?: boolean; initialFeeOnly?: boolean; initialSearch?: string; initialSort?: "asc" | "desc"; start: string; endExclusive: string }) {
  const router = useRouter();
  const activeWallets = wallets.filter(w => !w.archived);
  const [kind, setKind] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");
  const [walletId, setWalletId] = useState(activeWallets[0]?.id || "");
  const [destinationWalletId, setDestinationWalletId] = useState(activeWallets[1]?.id || "");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [feeAmount, setFeeAmount] = useState("0");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filterKind, setFilterKind] = useState(initialKind || "");
  const [filterWallet, setFilterWallet] = useState(initialWalletId || "");
  const [filterCategory, setFilterCategory] = useState(initialCategoryId || "");
  const [filterCategoryScope, setFilterCategoryScope] = useState(initialCategoryScope);
  const [filterIncludeRefunds, setFilterIncludeRefunds] = useState(initialIncludeRefunds);
  const [filterFeeOnly, setFilterFeeOnly] = useState(initialFeeOnly);
  const [filterSearch, setFilterSearch] = useState(initialSearch || "");
  const [filterSort, setFilterSort] = useState(initialSort);
  const [filterStart, setFilterStart] = useState(start);
  const [filterEnd, setFilterEnd] = useState(endExclusive);
  const [visibleRows, setVisibleRows] = useState(rows);
  const [cursor, setCursor] = useState(nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true); setMoreError("");
    try {
      const params = new URLSearchParams({ start, endExclusive, limit: "50", cursor });
      if (initialKind) params.set("kind", initialKind);
      if (initialWalletId) params.set("walletId", initialWalletId);
      if (initialCategoryId) params.set("categoryId", initialCategoryId);
      if (initialCategoryId && initialCategoryScope === "subtree") params.set("categoryScope", "subtree");
      if (initialKind === "EXPENSE" && initialIncludeRefunds) params.set("includeRefunds", "true");
      if (initialKind === "TRANSFER" && initialFeeOnly) params.set("feeOnly", "true");
      if (initialSearch) params.set("search", initialSearch);
      params.set("sort", initialSort);
      const response = await fetch(`/api/v1/transactions?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Không tải được trang giao dịch tiếp theo.");
      const page = result.data as { items: TransactionRow[]; nextCursor: string | null };
      setVisibleRows(previous => {
        const seen = new Set(previous.map(item => item.id));
        return [...previous, ...page.items.filter(item => !seen.has(item.id))];
      });
      setCursor(page.nextCursor);
    } catch (error) { setMoreError(error instanceof Error ? error.message : "Không tải được giao dịch."); }
    finally { setLoadingMore(false); }
  }

  function reset() { setOpen(false); setEditing(null); setAmount(""); setFeeAmount("0"); setNote(""); setTags(""); setCategoryId(""); setError(""); }
  function selectKind(next: "INCOME" | "EXPENSE" | "TRANSFER") { setKind(next); setCategoryId(""); setFeeAmount("0"); }
  function edit(row: TransactionRow) {
    if (row.kind === "REFUND") return;
    setEditing(row); setKind(row.kind as typeof kind); setWalletId(row.walletId); setDestinationWalletId(row.destinationWalletId || ""); setCategoryId(row.categoryId || ""); setAmount(row.amount); setFeeAmount(row.feeAmount ?? "0"); setNote(row.note || ""); setTags((row.tags ?? []).join(", "));
    const d = new Date(row.occurredAt); setOccurredAt(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); setOpen(true); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const parsedTags = kind === "TRANSFER" ? [] : tags.split(",").map(tag => tag.trim()).filter(Boolean);
    if (parsedTags.length > 10 || parsedTags.some(tag => tag.length > 30) ||
        new Set(parsedTags.map(tag => tag.toLocaleLowerCase("vi"))).size !== parsedTags.length) {
      setError("Tối đa 10 thẻ, mỗi thẻ không quá 30 ký tự và không được trùng nhau.");
      return;
    }
    setBusy(true);
    try {
      const url = editing ? `/api/v1/transactions/${editing.id}` : "/api/v1/transactions";
      const response = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ kind, walletId, destinationWalletId: kind === "TRANSFER" ? destinationWalletId : undefined, categoryId: kind === "TRANSFER" ? undefined : categoryId, amount, feeAmount: kind === "TRANSFER" ? (feeAmount || "0") : undefined, note, tags: parsedTags, occurredAt: new Date(occurredAt).toISOString(), ...(editing ? { version: editing.version } : {}) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "Không lưu được giao dịch.");
      reset(); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi kết nối."); }
    finally { setBusy(false); }
  }
  async function remove(row: TransactionRow) {
    if (!window.confirm(`Hủy giao dịch ${formatVnd(row.amount)}${row.kind === "TRANSFER" && row.feeAmount && row.feeAmount !== "0" ? ` kèm phí ${formatVnd(row.feeAmount)}` : ""}? Sổ cái sẽ được ghi bút toán đảo.`)) return;
    try {
      const response = await fetch(`/api/v1/transactions/${row.id}?version=${row.version}`, { method: "DELETE" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "Không hủy được giao dịch.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi kết nối."); }
  }
  async function refund(row: TransactionRow) {
    const amount = window.prompt(`Số tiền hoàn cho khoản chi ${formatVnd(row.amount)} (VND):`, row.amount);
    if (amount === null) return;
    try {
      const response = await fetch(`/api/v1/transactions/${row.id}/refunds`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ amount }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "Không hoàn được tiền.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi kết nối."); }
  }

  function applyFilter(e: React.FormEvent) {
    e.preventDefault(); const query = new URLSearchParams({ start: filterStart, endExclusive: filterEnd }); if (filterKind) query.set("kind", filterKind); if (filterWallet) query.set("walletId", filterWallet); if (filterCategory && filterKind !== "TRANSFER") { query.set("categoryId", filterCategory); if (filterCategoryScope === "subtree") query.set("categoryScope", "subtree"); } if (filterKind === "EXPENSE" && filterIncludeRefunds) query.set("includeRefunds", "true"); if (filterKind === "TRANSFER" && filterFeeOnly) query.set("feeOnly", "true"); if (filterSearch.trim()) query.set("search", filterSearch.trim()); query.set("sort", filterSort); router.push(`/transactions?${query.toString()}`);
  }
  const listQuery = new URLSearchParams({ start, endExclusive });
  if (initialKind) listQuery.set("kind", initialKind);
  if (initialWalletId) listQuery.set("walletId", initialWalletId);
  if (initialCategoryId) listQuery.set("categoryId", initialCategoryId);
  if (initialCategoryId && initialCategoryScope === "subtree") listQuery.set("categoryScope", "subtree");
  if (initialKind === "EXPENSE" && initialIncludeRefunds) listQuery.set("includeRefunds", "true");
  if (initialKind === "TRANSFER" && initialFeeOnly) listQuery.set("feeOnly", "true");
  if (initialSearch) listQuery.set("search", initialSearch);
  listQuery.set("sort", initialSort);
  const dayOf = (date: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
  return <>
    <div className="page-head"><div><h1 className="page-title">Giao dịch</h1><p className="subtitle">Thu, chi, chuyển ví và hoàn tiền. Mỗi khoản được hạch toán cân đối.</p></div><button className="button button-primary" disabled={!activeWallets.length} onClick={() => { reset(); setOpen(true); }}><Plus /> Thêm giao dịch</button></div>
    {!activeWallets.length && <div className="card card-pad" style={{ marginBottom: 20 }}>Bạn cần <a className="text-link" href="/wallets">tạo ví đầu tiên</a> trước khi ghi giao dịch.</div>}
    {open && <form onSubmit={submit} className="card card-pad" style={{ marginBottom: 22 }}><div className="section-header"><h2 className="section-title">{editing ? "Chỉnh sửa giao dịch" : "Ghi giao dịch mới"}</h2><button type="button" className="button button-outline" onClick={reset}>Đóng</button></div><div style={{ display: "flex", gap: 8, margin: "20px 0" }}>{(["EXPENSE", "INCOME", "TRANSFER"] as const).map(k => <button key={k} disabled={Boolean(editing)} type="button" className={`button ${kind === k ? "button-primary" : "button-outline"}`} onClick={() => selectKind(k)}>{labels[k]}</button>)}</div><div className="form-grid"><div className="field"><label htmlFor="amount">Số tiền (VND)</label><input id="amount" inputMode="numeric" pattern="[1-9][0-9]*" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="250000" /></div><div className="field"><label htmlFor="transaction-wallet">Ví nguồn</label><select id="transaction-wallet" value={walletId} required onChange={e => setWalletId(e.target.value)}>{activeWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>{kind === "TRANSFER" ? <><div className="field"><label htmlFor="transaction-dest">Ví nhận</label><select id="transaction-dest" value={destinationWalletId} required onChange={e => setDestinationWalletId(e.target.value)}><option value="">Chọn ví nhận</option>{activeWallets.filter(w => w.id !== walletId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div><div className="field"><label htmlFor="transaction-fee">Phí chuyển tiền (VND)</label><input id="transaction-fee" inputMode="numeric" pattern="(0|[1-9][0-9]*)" required value={feeAmount} onChange={e => setFeeAmount(e.target.value)} placeholder="0" /><small>Phí trừ thêm vào ví nguồn và ghi nhận là chi phí.</small></div></> : <div className="field"><label htmlFor="transaction-category">Danh mục</label><select id="transaction-category" value={categoryId} onChange={e => setCategoryId(e.target.value)} required><option value="">Chọn danh mục</option>{categories.filter(c => c.kind === kind).map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></div>}<div className="field"><label htmlFor="transaction-date">Thời điểm phát sinh</label><input id="transaction-date" type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} required /></div><div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="transaction-note">Ghi chú</label><textarea id="transaction-note" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Nội dung giao dịch (không bắt buộc)" /></div>{kind !== "TRANSFER" && <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="transaction-tags">Thẻ giao dịch</label><input id="transaction-tags" value={tags} onChange={e => setTags(e.target.value)} maxLength={319} placeholder="Ví dụ: ăn trưa, công việc" aria-describedby="transaction-tags-help" /><small id="transaction-tags-help">Phân tách bằng dấu phẩy; tối đa 10 thẻ, mỗi thẻ tối đa 30 ký tự, không trùng nhau.</small></div>}</div>{error && <div className="form-error" role="alert">{error}</div>}<div className="form-footer"><button type="submit" disabled={busy} className="button button-primary">{busy ? "Đang ghi sổ…" : editing ? "Lưu thay đổi" : "Ghi giao dịch"}</button></div></form>}
    {!open && error && <div role="alert" className="form-error">{error}</div>}
    {selectedTransaction && <section className="card card-pad" aria-label="Chi tiết giao dịch được chọn" style={{ marginBottom: 22, border: "2px solid #1E5EFF" }}>
      <div className="section-header"><div><h2 className="section-title">Giao dịch được chọn</h2><p className="section-subtitle">Có thể nằm ngoài bộ lọc hoặc trang danh sách hiện tại.</p></div><a className="text-link" href={`/transactions?${listQuery.toString()}`}>Đóng chi tiết →</a></div>
      <p><strong>{selectedTransaction.categoryName || labels[selectedTransaction.kind as keyof typeof labels]}</strong> · {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedTransaction.occurredAt))}</p>
      <p>{selectedTransaction.walletName}{selectedTransaction.destinationWalletName ? ` → ${selectedTransaction.destinationWalletName}` : ""} · <strong>{formatVnd(selectedTransaction.amount)}</strong></p>
    {selectedTransaction.kind === "TRANSFER" && selectedTransaction.feeAmount && selectedTransaction.feeAmount !== "0" && <p>Phí chuyển tiền: <strong>{formatVnd(selectedTransaction.feeAmount)}</strong> (trừ tại ví nguồn)</p>}
    {selectedTransaction.note && <p>{selectedTransaction.note}</p>}
    {Boolean(selectedTransaction.tags?.length) && <p aria-label="Thẻ giao dịch">Thẻ: {selectedTransaction.tags.map(tag => <span key={tag} className="badge" style={{ marginRight: 6 }}>{tag}</span>)}</p>}
      <div className="finance-actions"><button className="button button-outline" onClick={() => edit(selectedTransaction)} disabled={selectedTransaction.kind === "REFUND"}>Sửa giao dịch</button>{selectedTransaction.kind === "EXPENSE" && <button className="button button-outline" onClick={() => refund(selectedTransaction)}>Hoàn tiền</button>}</div>
    </section>}
    <div className="filter-toolbar transaction-filter-toolbar"><span className="section-subtitle">{visibleRows.length} giao dịch trong kỳ</span><button className="filter-chip" type="button" aria-expanded={filtersOpen} aria-controls="transaction-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={17} /> Lọc giao dịch</button></div>
    <form id="transaction-filters" className={`card filterbar ${filtersOpen ? "expanded-mobile" : "collapsed-mobile"}`} onSubmit={applyFilter}>
      <div className="field"><label htmlFor="filter-start">Từ ngày</label><input id="filter-start" type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} /></div>
      <div className="field"><label htmlFor="filter-end">Đến trước ngày</label><input id="filter-end" type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} /></div>
      <div className="field"><label htmlFor="filter-kind">Loại giao dịch</label><select id="filter-kind" value={filterKind} onChange={e => setFilterKind(e.target.value)}><option value="">Tất cả</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="field"><label htmlFor="filter-wallet">Ví</label><select id="filter-wallet" value={filterWallet} onChange={e => setFilterWallet(e.target.value)}><option value="">Tất cả ví</option>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      {filterKind !== "TRANSFER" && <div className="field"><label htmlFor="filter-category">Danh mục</label><select id="filter-category" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}><option value="">Tất cả danh mục</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      {filterKind !== "TRANSFER" && filterCategory && <div className="field"><label htmlFor="filter-category-scope">Phạm vi danh mục</label><select id="filter-category-scope" value={filterCategoryScope} onChange={e => setFilterCategoryScope(e.target.value as "direct" | "subtree")}><option value="direct">Chỉ danh mục được chọn</option><option value="subtree">Cả danh mục và danh mục con</option></select></div>}
      {filterKind === "EXPENSE" && <div className="field"><label htmlFor="filter-refunds">Hoàn tiền</label><select id="filter-refunds" value={filterIncludeRefunds ? "yes" : "no"} onChange={e => setFilterIncludeRefunds(e.target.value === "yes")}><option value="no">Chỉ các khoản chi</option><option value="yes">Bao gồm khoản hoàn tiền</option></select></div>}
      {filterKind === "TRANSFER" && <div className="field"><label htmlFor="filter-transfer-fees">Phí chuyển tiền</label><select id="filter-transfer-fees" value={filterFeeOnly ? "yes" : "no"} onChange={e => setFilterFeeOnly(e.target.value === "yes")}><option value="no">Tất cả chuyển ví</option><option value="yes">Chỉ chuyển ví có phí</option></select></div>}
      <div className="field"><label htmlFor="filter-search">Tìm theo ghi chú</label><input id="filter-search" maxLength={200} placeholder="Nhập từ khóa" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} /></div>
      <div className="field"><label htmlFor="filter-sort">Thứ tự thời gian</label><select id="filter-sort" value={filterSort} onChange={e => setFilterSort(e.target.value as "asc" | "desc")}><option value="desc">Mới nhất trước</option><option value="asc">Cũ nhất trước</option></select></div>
      <button className="button button-soft" type="submit">Áp dụng</button>
    </form>
    <section className="card transaction-history"><div className="card-pad section-header"><div><h2 className="section-title">Lịch sử giao dịch</h2><p className="section-subtitle">Đang hiển thị {visibleRows.length} giao dịch trong khoảng thời gian đã chọn</p></div></div>{!visibleRows.length ? <div className="empty" style={{ margin: "0 22px 22px" }}><ArrowLeftRight /><strong>Chưa có giao dịch trong kỳ</strong><p>Chọn khoảng thời gian khác hoặc ghi giao dịch mới.</p></div> : <>
      <div className="transaction-mobile-list">{visibleRows.map((row, index) => {
        const incoming = row.kind === "INCOME" || row.kind === "REFUND";
        const Icon = row.kind === "TRANSFER" ? ArrowLeftRight : incoming ? ArrowDownLeft : ArrowUpRight;
        return <Fragment key={row.id}>
          {(index === 0 || dayOf(row.occurredAt) !== dayOf(visibleRows[index - 1].occurredAt)) && <h3 className="transaction-day">{new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(row.occurredAt))}</h3>}
          <article className="transaction-item"><div className={`transaction-kind-icon ${incoming ? "incoming" : row.kind === "TRANSFER" ? "transfer" : "outgoing"}`}><Icon size={20} aria-hidden="true" /></div>
            <div className="transaction-item-body"><strong>{row.categoryName || labels[row.kind as keyof typeof labels]}</strong><small>{row.note || row.walletName}{row.destinationWalletName ? ` → ${row.destinationWalletName}` : ""}</small><small>{new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(new Date(row.occurredAt))}</small>{row.kind === "TRANSFER" && row.feeAmount !== "0" && <small>Phí chuyển: {formatVnd(row.feeAmount)}</small>}
              {Boolean(row.tags?.length) && <div className="transaction-tags">{row.tags.map(tag => <span className="badge" key={tag}>{tag}</span>)}</div>}
            </div><div className="transaction-item-end"><strong className={incoming ? "amount-income" : row.kind === "TRANSFER" ? "amount-transfer" : "amount-expense"}>{incoming ? "+" : row.kind === "TRANSFER" ? "↔ " : "−"}{formatVnd(row.amount)}</strong><div className="transaction-item-actions"><button type="button" title="Sửa giao dịch" aria-label={`Sửa ${row.categoryName || labels[row.kind as keyof typeof labels]}`} onClick={() => edit(row)} disabled={row.kind === "REFUND"}><Pencil size={16} /></button>{row.kind === "EXPENSE" && <button type="button" title="Hoàn tiền" aria-label="Hoàn tiền giao dịch" onClick={() => refund(row)}><RotateCcw size={16} /></button>}<button type="button" title="Hủy giao dịch" aria-label="Hủy giao dịch" onClick={() => remove(row)}><Trash2 size={16} /></button></div></div>
          </article>
        </Fragment>;
      })}</div>
      <div className="table-wrap transaction-desktop-table"><table><thead><tr><th>GIAO DỊCH</th><th>NGÀY</th><th>VÍ</th><th>SỐ TIỀN</th><th>THAO TÁC</th></tr></thead><tbody>{visibleRows.map((row, index) => <Fragment key={row.id}>{(index === 0 || dayOf(row.occurredAt) !== dayOf(visibleRows[index - 1].occurredAt)) && <tr className="transaction-date-row"><th colSpan={5} scope="rowgroup">Ngày {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(row.occurredAt))}</th></tr>}<tr><td><strong>{row.categoryName || labels[row.kind as keyof typeof labels]}</strong><div className="section-subtitle">{row.note || labels[row.kind as keyof typeof labels]}</div>{Boolean(row.tags?.length) && <div aria-label="Thẻ giao dịch">{row.tags.map(tag => <span className="badge" key={tag}>{tag}</span>)}</div>}{row.kind === "TRANSFER" && row.feeAmount !== "0" && <div>Phí chuyển: {formatVnd(row.feeAmount)} (ví nguồn)</div>}</td><td>{new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(row.occurredAt))}</td><td>{row.walletName}{row.destinationWalletName ? ` → ${row.destinationWalletName}` : ""}</td><td className={row.kind === "INCOME" || row.kind === "REFUND" ? "amount-income" : row.kind === "EXPENSE" ? "amount-expense" : "amount-transfer"}>{row.kind === "INCOME" || row.kind === "REFUND" ? "+" : row.kind === "EXPENSE" ? "−" : "↔ "}{formatVnd(row.amount)}</td><td><div className="transaction-item-actions"><button type="button" title="Sửa" aria-label="Sửa giao dịch" onClick={() => edit(row)} disabled={row.kind === "REFUND"}><Pencil size={16} /></button>{row.kind === "EXPENSE" && <button type="button" title="Hoàn tiền" aria-label="Hoàn tiền" onClick={() => refund(row)}><RotateCcw size={16} /></button>}<button type="button" title="Hủy" aria-label="Hủy giao dịch" onClick={() => remove(row)}><Trash2 size={16} /></button></div></td></tr></Fragment>)}</tbody></table></div>
    </>}{moreError && <p className="form-error" role="alert">{moreError}</p>}{cursor && <div className="form-footer"><button type="button" className="button button-outline" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Đang tải…" : "Xem thêm giao dịch"}</button></div>}</section>
  </>;
}
