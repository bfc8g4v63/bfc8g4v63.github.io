import type { Metadata } from "next";
export const metadata: Metadata = { title: "우리", description: "一個安靜的小地方。", icons: { icon: [{url:"/uri-cats.svg",type:"image/svg+xml"}] }, robots: { index:false, follow:false } };
export const dynamic = "force-dynamic";
export default function UriLayout({children}:{children:React.ReactNode}) { return children; }
