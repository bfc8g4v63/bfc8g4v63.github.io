import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "好日子｜家庭相聚活動管理",
    short_name: "好日子",
    description: "讓家人朋友輕鬆相聚的活動管理系統",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf0",
    theme_color: "#fffaf0",
    lang: "zh-Hant",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
