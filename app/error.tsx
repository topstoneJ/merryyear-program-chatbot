"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page_render_failed", { kind: error.name, digest: error.digest });
  }, [error]);
  return <main role="alert">
    <p>화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
    <button type="button" onClick={reset}>다시 시도</button>
  </main>;
}
