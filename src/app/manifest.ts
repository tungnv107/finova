import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finova — Rõ tiền, vững tương lai",
    short_name: "Finova",
    description: "Quản lý tài chính cá nhân và phân tích thu chi",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#1E5EFF",
    icons: [
      { src: "/brand/icons/finova-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icons/finova-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
