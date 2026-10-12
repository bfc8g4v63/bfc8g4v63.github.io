import type { Metadata } from "next";
import { MemoryCapsuleApp } from "./MemoryCapsuleApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "水金呼吸・回憶膠囊",
  description: "陳水金家族的私密照片與回憶。",
};

export default function MemoryCapsulePage() {
  return <MemoryCapsuleApp />;
}
