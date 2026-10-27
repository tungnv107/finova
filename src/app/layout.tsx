import type { Metadata } from "next";
import "./globals.css";
import "../styles/finova-v3.css";
import "../styles/finova-refined.css";
import "../styles/finova-v4-controls.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Finova | Rõ tiền, vững tương lai",
  description: "Quản lý ví, thu chi và xem báo cáo tài chính cá nhân trực quan.",
  icons: { icon: "/brand/icons/finova-app-icon-48.png", apple: "/brand/icons/finova-app-icon-180.png" },
  applicationName: "Finova",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions may add attributes to <body> before React hydrates it.
  return <html lang="vi" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `try{var mq=matchMedia('(prefers-color-scheme: dark)');var syncFinovaTheme=function(){var t=localStorage.getItem('finova-theme');var d=t==='light'||t==='dark'?t:(mq.matches?'dark':'light');document.documentElement.dataset.theme=d;document.documentElement.style.colorScheme=d;};syncFinovaTheme();mq.addEventListener('change',syncFinovaTheme);window.addEventListener('storage',syncFinovaTheme);window.addEventListener('finova-theme-changed',syncFinovaTheme);}catch(e){}` }} /></head><body suppressHydrationWarning>{children}<PwaRegister /></body></html>;
}
