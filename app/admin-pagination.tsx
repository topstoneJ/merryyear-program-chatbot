type PageItem = number | "ellipsis";

function pageItems(currentPage: number, totalPages: number): PageItem[] {
  const visible = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1].filter(page => page >= 1 && page <= totalPages));
  const pages = [...visible].sort((a, b) => a - b);
  const items: PageItem[] = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });
  return items;
}

export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;

export default function AdminPagination({ currentPage, totalPages, onChange }: { currentPage: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav className="admin-pagination" aria-label="페이지 이동">
    <button type="button" disabled={currentPage === 1} aria-label="이전 페이지" onClick={() => onChange(currentPage - 1)}>‹</button>
    {pageItems(currentPage, totalPages).map((item, index) => item === "ellipsis"
      ? <span aria-hidden="true" key={`ellipsis-${index}`}>…</span>
      : <button type="button" className={item === currentPage ? "active" : ""} aria-current={item === currentPage ? "page" : undefined} key={item} onClick={() => onChange(item)}>{item}</button>)}
    <button type="button" disabled={currentPage === totalPages} aria-label="다음 페이지" onClick={() => onChange(currentPage + 1)}>›</button>
  </nav>;
}
