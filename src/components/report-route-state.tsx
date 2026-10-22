"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

export function ReportLoading() {
  return <section aria-busy="true" aria-label="Đang tải báo cáo" role="status">
    <div className="page-head"><div><h1 className="page-title">Đang tải số liệu tài chính…</h1>
      <p className="subtitle">Đang tổng hợp các bút toán theo bộ lọc đã chọn.</p></div></div>
    <div className="kpi-grid" aria-hidden="true">{Array.from({ length: 4 }, (_, index) =>
      <div key={index} className="card card-pad report-placeholder"><div className="report-placeholder-line" /><div className="report-placeholder-line short" /></div>
    )}</div>
    <div className="card card-pad report-placeholder" aria-hidden="true"><div className="report-placeholder-line" /><div className="report-placeholder-chart" /></div>
  </section>;
}

export function ReportError({ retry }: { error: unknown; retry: () => void }) {
  return <section className="card card-pad report-error" role="alert" aria-labelledby="report-error-title">
    <span className="report-error-icon" aria-hidden="true"><AlertCircle size={26} /></span>
    <h1 id="report-error-title" className="page-title">Không thể tải báo cáo</h1>
    <p className="subtitle">Đã xảy ra lỗi khi lấy dữ liệu. Hãy thử tải lại; nếu phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.</p>
    <div className="finance-actions"><button type="button" className="button button-primary" onClick={() => retry()}>Thử lại</button>
      <Link className="button button-outline" href="/login">Đăng nhập</Link></div>
  </section>;
}
