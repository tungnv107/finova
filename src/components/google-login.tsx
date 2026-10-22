"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.77 7.18l7.73 6C44.41 38.03 46.98 31.87 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.3 14.3 0 0 1 9.75 24c0-1.6.27-3.15.76-4.59l-7.98-6.2A23.8 23.8 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.9-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;
}

export function GoogleLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <><button type="button" className="google-btn" disabled={!configured || busy} onClick={async () => {
    setBusy(true); setError("");
    try { const result = await authClient.signIn.social({ provider: "google", callbackURL: "/onboarding" }); if (result.error) { setError("Không thể đăng nhập lúc này. Vui lòng thử lại."); setBusy(false); } }
    catch { setError("Không thể kết nối với Google. Vui lòng thử lại."); setBusy(false); }
  }}><GoogleMark /> {busy ? "Đang kết nối với Google…" : "Tiếp tục với Google"}</button>
    {!configured && <div className="form-error">Quản trị viên chưa cấu hình Google OAuth. Xem hướng dẫn thiết lập trong tài liệu triển khai.</div>}
    {error && <div role="alert" className="form-error">{error}</div>}
  </>;
}
