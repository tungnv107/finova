"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="card card-pad"><h1 className="page-title">Chưa tải được phân tích</h1><p>Vui lòng thử lại.</p><button type="button" className="button button-primary" onClick={reset}>Tải lại</button></section>; }
