export function publicWebsiteUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!/^https?:$/.test(url.protocol) || url.username || url.password
    || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host.includes(":") || /^127\.|^10\.|^0\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("공개 웹사이트 주소를 입력해 주세요.");
  }
  return url;
}

export async function fetchWebsite(value: string) {
  let url = publicWebsiteUrl(value);
  const signal = AbortSignal.timeout(20_000);
  for (let count = 0; count < 6; count++) {
    const response = await fetch(url.toString(), { redirect: "manual", signal, headers: { "User-Agent": "ProgramGuideKnowledgeBot/1.0" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new Error("웹사이트 이동 주소가 없습니다.");
      url = publicWebsiteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error("웹사이트를 불러오지 못했습니다."); }
    const reader = response.body?.getReader();
    if (!reader) return "";
    const decoder = new TextDecoder(); let text = ""; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 5 * 1024 * 1024) throw new Error("웹사이트 응답이 너무 큽니다.");
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text + decoder.decode();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  throw new Error("웹사이트 이동 횟수가 너무 많습니다.");
}
