import Link from "next/link";

export default function ForbiddenPage() {
  return <section className="card card-pad" role="alert" style={{ maxWidth: 680, margin: "60px auto" }}>
    <h1 className="page-title">Không có quyền truy cập</h1>
    <p className="subtitle">Tài khoản hiện tại không được phép mở khu vực này.</p>
    <Link className="button button-primary" href="/dashboard">Về tổng quan cá nhân</Link>
  </section>;
}
