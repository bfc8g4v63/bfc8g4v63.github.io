import type { Metadata } from "next";
export const metadata: Metadata = { title: "우리", description: "一個安靜的小地方。", applicationName: "우리", openGraph: { title: "우리", description: "一個安靜的小地方。", type: "website", images: [] }, twitter: { card: "summary", title: "우리", description: "一個安靜的小地方。", images: [] }, icons: { icon: [{url:"/uri-cats.svg",type:"image/svg+xml"}] }, robots: { index:false, follow:false } };
export const dynamic = "force-dynamic";
export default function UriLayout({children}:{children:React.ReactNode}) { return children; }
