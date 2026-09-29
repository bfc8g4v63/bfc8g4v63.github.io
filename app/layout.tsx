import type { Metadata } from "next";
import { headers } from "next/headers";
import { RegisterSW } from "./RegisterSW";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3001";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "好日子｜相聚｜免註冊活動/聚會/座位管理與安排",
    description: "免註冊的活動、聚會與座位管理安排工具，建立活動後分享給家人，長輩一鍵就能回覆參加。",
    applicationName: "好日子相聚",
    manifest: "/manifest.webmanifest",
    themeColor: "#fffaf0",
    icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
    openGraph: { title: "好日子｜相聚｜免註冊活動/聚會/座位管理與安排", description: "建立、分享、參加、座位安排，一看就會。", type: "website", images: [{ url: image, width: 1735, height: 907 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}<RegisterSW /></body></html>;
}
