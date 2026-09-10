type Source = { type: "pdf" | "website" | "text"; isRandom?: boolean; title: string; url: string | null; fileName: string | null };
export function sourceKind(source: Source) { return source.type === "text" && source.isRandom ? "random" : source.type; }
export function filterSources<T extends Source>(sources: T[], kind: "all" | "pdf" | "website" | "text" | "random", query: string) {
  const term = query.trim().toLowerCase();
  return sources.filter(source => (kind === "all" || sourceKind(source) === kind) && (!term || [source.title, source.url, source.fileName].some(value => value?.toLowerCase().includes(term))));
}
