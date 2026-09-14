// Separate explicitly labelled citation paragraphs so server-added contact
// details and next steps can never appear after the citation footer.
export function separateCitations(text: string) {
  const body: string[] = [], citations: string[] = [];
  let inCitation = false;
  for (const line of text.trim().split("\n")) {
    const label = line.trim().replace(/^[#◆•*\-\s]+/, "").replace(/\*\*/g, "");
    if (/^(?:출처|참고\s*자료|근거\s*자료)(?:\s*[:：]|\s*$)/.test(label)) inCitation = true;
    else if (!line.trim() || /^(?:◆|#{1,6})\s/.test(line.trim()) || /^(?:다음\s*행동|추가\s*질문|요약|문의처|담당자\s*문의|이메일|전화번호)\s*[:：]/.test(label)) inCitation = false;
    (inCitation ? citations : body).push(line);
  }
  return { body: body.join("\n").trim(), citations: citations.join("\n").trim() };
}
