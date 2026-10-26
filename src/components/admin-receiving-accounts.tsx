"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { CatalogAudit } from "./admin-price-versions";

type Account = { id: string; bankCode: string; bankName: string; accountName: string; accountMasked: string;
  status: string; createdBy: string; approvedBy: string | null; createdAt: string };
type ProposedAccount = { bankCode: string; bankName: string; accountName: string; accountNumber: string };

export function maskedAccountNumber(value: string): string {
  return `••••${value.slice(-4)}`;
}

export function AdminReceivingAccounts({ accounts, actorId, canApprove, audits = [] }: {
  accounts: Account[]; actorId: string; canApprove: boolean; audits?: CatalogAudit[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<ProposedAccount | null>(null);
  async function submit(request: () => Promise<Response>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await request();
      const json = await result.json();
      if (!result.ok) throw new Error(json?.error?.message ?? "Không thể thực hiện yêu cầu.");
      setMessage("Thao tác đã được lưu vào nhật ký quản trị."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra."); }
    finally { setBusy(false); }
  }
  function propose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload: ProposedAccount = {
      bankCode: String(data.get("bankCode")), bankName: String(data.get("bankName")),
      accountName: String(data.get("accountName")), accountNumber: String(data.get("accountNumber")),
    };
    if (!preview) {
      setPreview(payload);
      return;
    }
    // Submit exactly the reviewed snapshot, even if browser autofill changes a
    // field without dispatching an input/change event after the preview.
    const confirmed = preview;
    void submit(async () => {
      const result = await fetch("/api/v1/admin/billing/receiving-accounts", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(confirmed) });
      if (result.ok) { form.reset(); setPreview(null); }
      return result;
    });
  }
  return <>
    <section className="card card-pad"><h3 className="section-title">Danh sách tài khoản nhận phí</h3>
      <div className="table-wrap" role="region" aria-label="Danh sách tài khoản nhận phí" tabIndex={0}><table><thead><tr><th>Ngân hàng</th><th>Chủ tài khoản</th><th>Số tài khoản</th><th>Trạng thái</th><th>Phê duyệt</th></tr></thead>
        <tbody>{accounts.map(account => <tr key={account.id}>
          <td><strong>{account.bankName}</strong><div className="section-subtitle">{account.bankCode}</div></td>
          <td>{account.accountName}</td><td>{account.accountMasked}</td><td><span className="admin-pill">{account.status}</span></td>
          <td>{canApprove && account.status === "PENDING_APPROVAL" && account.createdBy !== actorId ?
            <button type="button" className="button button-outline" disabled={busy} onClick={() => void submit(() => fetch(`/api/v1/admin/billing/receiving-accounts/${encodeURIComponent(account.id)}/approve`, { method: "POST" }))}>Duyệt</button> :
            <span className="section-subtitle">{account.approvedBy ? "Đã duyệt" : "—"}</span>}</td>
        </tr>)}</tbody></table>{accounts.length === 0 && <p className="section-subtitle">Chưa có tài khoản nhận phí. Mọi tài khoản mới phải qua bước phê duyệt độc lập.</p>}</div>
    </section>
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <h3 className="section-title">Đề xuất tài khoản nhận phí mới</h3>
      <p className="subtitle">Thông tin số tài khoản được mã hóa khi lưu. Người tạo đề xuất không thể tự duyệt; duyệt chỉ dành cho Super Admin khác.</p>
      <form className="admin-account-form" onSubmit={propose} onChange={() => setPreview(null)}>
        <div className="field"><label htmlFor="bank-code">Mã ngân hàng</label><input required id="bank-code" name="bankCode" placeholder="VCB" minLength={2} maxLength={16} pattern="[A-Z0-9_-]+" /></div>
        <div className="field"><label htmlFor="bank-name">Tên ngân hàng</label><input required id="bank-name" name="bankName" placeholder="Ngân hàng…" minLength={2} maxLength={100} /></div>
        <div className="field"><label htmlFor="account-holder">Tên người thụ hưởng</label><input required id="account-holder" name="accountName" minLength={3} maxLength={120} /></div>
        <div className="field"><label htmlFor="account-number">Số tài khoản</label><input required id="account-number" name="accountNumber" type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{8,20}" /></div>
        {preview && <div className="admin-change-preview" role="region" aria-label="Xem trước tài khoản nhận phí">
          <h4>Xác nhận đề xuất</h4>
          <p>{preview.bankName} ({preview.bankCode}) · {preview.accountName} · {maskedAccountNumber(preview.accountNumber)}</p>
          <p className="section-subtitle">Tài khoản mới sẽ ở trạng thái chờ duyệt. Người đề xuất không thể tự phê duyệt; Super Admin khác phải xác nhận trước khi dùng nhận tiền.</p>
          <button type="button" className="button button-outline" disabled={busy} onClick={() => setPreview(null)}>Sửa thông tin</button>
        </div>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Đang lưu…" : preview ? "Xác nhận gửi đề xuất" : "Xem trước đề xuất"}</button>
      </form>
      {message && <p role="status" className="section-subtitle">{message}</p>}
    </section>
    <section className="card card-pad" style={{ marginTop: 20 }} aria-label="Nhật ký tài khoản nhận phí">
      <h3 className="section-title">Nhật ký tài khoản nhận phí gần đây</h3>
      <div className="table-wrap" role="region" aria-label="Bảng nhật ký tài khoản nhận phí" tabIndex={0}><table><thead><tr><th>Thời điểm</th><th>Thao tác</th><th>Người thực hiện</th><th>Tài khoản</th></tr></thead>
        <tbody>{audits.map(audit => <tr key={audit.id}>
          <td>{new Date(audit.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td>
          <td>{audit.action}</td><td>{audit.actorId}</td>
          <td>{accounts.find(a => a.id === audit.resourceId)?.accountMasked ?? "Đã lưu nhật ký"}</td>
        </tr>)}</tbody></table></div>
      {!audits.length && <p className="section-subtitle">Chưa có thao tác nào được ghi nhận.</p>}
    </section>
  </>;
}
