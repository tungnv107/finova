"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Price = { id: string; productCode: string; version: number; priceVnd: number; lifecycle: string;
  publishedAt: string | null; effectiveFrom: string; effectiveTo: string | null };
export type CatalogAudit = { id: string; action: string; actorId: string; createdAt: string;
  resourceId: string };
const money = (value: number) => `${new Intl.NumberFormat("vi-VN").format(value)} VNĐ`;

export function AdminPriceVersions({ prices, audits = [] }: { prices: Price[]; audits?: CatalogAudit[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingPublish, setPendingPublish] = useState<Price | null>(null);
  const currentlyPublished = pendingPublish && prices.find(price =>
    price.productCode === pendingPublish.productCode && price.lifecycle === "PUBLISHED");

  async function act(path: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Không lưu được thay đổi.");
      setMessage("Đã lưu thay đổi và nhật ký quản trị.");
      setPendingPublish(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally { setBusy(false); }
  }

  function newDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void act("/api/v1/admin/billing/prices", "POST", {
      productCode: String(data.get("productCode")), priceVnd: Number(data.get("priceVnd")),
    });
  }

  function changeDraft(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    void act(`/api/v1/admin/billing/prices/${encodeURIComponent(id)}`, "PATCH",
      { priceVnd: Number(new FormData(event.currentTarget).get("priceVnd")) });
  }

  return <>
    <section className="card card-pad">
      <h3 className="section-title">Phiên bản giá Premium</h3>
      <p className="subtitle">Mọi phiên bản đã công bố đều được giữ nguyên. Đơn hàng đã tạo giữ mức giá đã chốt; phiên bản mới chỉ áp dụng cho đơn mới.</p>
      <div className="table-wrap" style={{ marginTop: 16 }} role="region" aria-label="Danh sách phiên bản giá Premium" tabIndex={0}>
        <table><thead><tr><th>Sản phẩm</th><th>Phiên bản</th><th>Giá bán</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{prices.map(price => <tr key={price.id}>
            <td>{price.productCode === "PREMIUM_MONTHLY" ? "Premium tháng" : "Premium năm"}</td>
            <td>v{price.version}</td><td>{money(price.priceVnd)}</td>
            <td><span className="admin-pill">{price.lifecycle === "PUBLISHED" ? "Đang công bố" :
              price.lifecycle === "ARCHIVED" ? "Đã ngừng" : "Bản nháp"}</span></td>
            <td>{price.lifecycle === "DRAFT" ? <div className="admin-shortcuts">
              <form onSubmit={event => changeDraft(event, price.id)}>
                <label className="sr-only" htmlFor={`price-${price.id}`}>Sửa giá v{price.version} (VNĐ)</label>
                <input id={`price-${price.id}`} name="priceVnd" aria-label={`Sửa giá v${price.version} (VNĐ)`}
                  type="number" min="1" step="1" defaultValue={price.priceVnd} required disabled={busy} />
                <button className="button button-outline" type="submit" disabled={busy}>Lưu nháp</button>
              </form>
              <button className="button button-primary" type="button" disabled={busy}
                onClick={() => setPendingPublish(price)}>Xem trước công bố</button>
              <button className="button button-outline" type="button" disabled={busy}
                onClick={() => { if (window.confirm("Xóa bản nháp này?"))
                  void act(`/api/v1/admin/billing/prices/${encodeURIComponent(price.id)}`, "DELETE"); }}>Xóa nháp</button>
            </div> : price.lifecycle === "PUBLISHED" ?
              <button className="button button-outline" type="button" disabled={busy}
                onClick={() => { if (window.confirm("Ngừng mở bán mức giá này?"))
                  void act(`/api/v1/admin/billing/prices/${encodeURIComponent(price.id)}/unpublish`, "POST"); }}>Ngừng công bố</button>
              : <span className="section-subtitle">Chỉ đọc</span>}</td>
          </tr>)}</tbody></table>
        {prices.length === 0 && <p className="section-subtitle">Chưa có bảng giá Premium.</p>}
      </div>
    </section>
    {pendingPublish && <section className="card card-pad admin-change-preview" aria-label="Xem trước thay đổi bảng giá" style={{ marginTop: 20 }}>
      <h3 className="section-title">Xác nhận công bố phiên bản v{pendingPublish.version}</h3>
      <p className="subtitle">{pendingPublish.productCode === "PREMIUM_MONTHLY" ? "Premium tháng" : "Premium năm"}: từ <strong>{currentlyPublished ? money(currentlyPublished.priceVnd) : "chưa mở bán"}</strong> sang <strong>{money(pendingPublish.priceVnd)}</strong>.</p>
      <p className="section-subtitle">Sau khi xác nhận, giá này áp dụng cho đơn mới và giá cũ ngừng mở bán. Các đơn đã tạo vẫn giữ nguyên số tiền đã chốt; phiên bản đã công bố không thể sửa.</p>
      <div className="admin-shortcuts">
        <button className="button button-primary" type="button" disabled={busy}
          onClick={() => void act(`/api/v1/admin/billing/prices/${encodeURIComponent(pendingPublish.id)}/publish`, "POST")}>Xác nhận công bố</button>
        <button className="button button-outline" type="button" disabled={busy} onClick={() => setPendingPublish(null)}>Hủy</button>
      </div>
    </section>}
    <section className="card card-pad" style={{ marginTop: 20 }}>
      <h3 className="section-title">Tạo phiên bản nháp</h3>
      <form className="admin-account-form" onSubmit={newDraft}>
        <div className="field"><label htmlFor="price-product">Sản phẩm</label><select id="price-product" name="productCode" required disabled={busy}>
          <option value="PREMIUM_MONTHLY">Premium tháng</option><option value="PREMIUM_YEARLY">Premium năm</option></select></div>
        <div className="field"><label htmlFor="price-value">Giá bán (VNĐ)</label>
          <input id="price-value" name="priceVnd" type="number" min="1" step="1" defaultValue="29000" required disabled={busy} /></div>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Tạo bản nháp"}</button>
      </form>
      <p className="section-subtitle">Thu phí production chỉ được kích hoạt sau kiểm thử provider, phê duyệt chính sách giá, thuế và pháp lý.</p>
    </section>
    <section className="card card-pad" style={{ marginTop: 20 }} aria-label="Nhật ký bảng giá">
      <h3 className="section-title">Nhật ký thay đổi bảng giá gần đây</h3>
      <div className="table-wrap" role="region" aria-label="Bảng nhật ký thay đổi giá" tabIndex={0}><table><thead><tr><th>Thời điểm</th><th>Thao tác</th><th>Người thực hiện</th><th>Phiên bản</th></tr></thead>
        <tbody>{audits.map(audit => <tr key={audit.id}>
          <td>{new Date(audit.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td>
          <td>{audit.action}</td><td>{audit.actorId}</td><td>{prices.find(p => p.id === audit.resourceId)?.version ?? "—"}</td>
        </tr>)}</tbody></table></div>
      {!audits.length && <p className="section-subtitle">Chưa có thao tác nào được ghi nhận.</p>}
    </section>
    <p role="status" aria-live="polite" className="section-subtitle">{message}</p>
  </>;
}
