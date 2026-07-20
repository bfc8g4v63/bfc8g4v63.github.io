"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.replace(`https://bfc8g4v63.github.io/${window.location.search}${window.location.hash}`);
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <p>
        正在前往好日子相聚…{" "}
        <a href="https://bfc8g4v63.github.io">立即開啟</a>
      </p>
    </main>
  );
}
