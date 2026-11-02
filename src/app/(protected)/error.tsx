"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return <section className="card card-pad" role="alert">
    <h1 className="page-title">Chưa tải được dữ liệu</h1>
    <p className="subtitle">Vui lòng thử tải lại. Nếu bạn vừa lưu một thay đổi, hãy kiểm tra lịch sử trước khi nhập lại.</p>
    <div className="record-actions"><button type="button" className="button button-primary" onClick={retry}><RefreshCw size={17} aria-hidden="true" /> Thử tải lại</button><Link className="text-link" href="/dashboard">Về tổng quan</Link></div>
  </section>;
}
