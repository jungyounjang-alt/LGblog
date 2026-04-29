interface Props {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onChange: (page: number) => void;
}

function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push('…');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push('…');
  items.push(total);
  return items;
}

export function Pagination({ page, totalPages, totalItems, pageSize, onChange }: Props) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  function go(p: number) {
    const clamped = Math.max(1, Math.min(totalPages, p));
    if (clamped !== page) onChange(clamped);
  }

  const items = pageWindow(page, totalPages);

  return (
    <nav className="pagination" aria-label="pagination">
      <span className="page-summary muted small">
        {from.toLocaleString()}–{to.toLocaleString()} / {totalItems.toLocaleString()}
      </span>
      <div className="page-nav">
        <button
          type="button"
          className="page-btn"
          onClick={() => go(1)}
          disabled={page === 1}
          aria-label="첫 페이지"
        >
          «
        </button>
        <button
          type="button"
          className="page-btn"
          onClick={() => go(page - 1)}
          disabled={page === 1}
          aria-label="이전"
        >
          ‹
        </button>
        {items.map((it, i) =>
          it === '…' ? (
            <span key={`e${i}`} className="page-ellipsis">
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              className={'page-btn ' + (it === page ? 'active' : '')}
              onClick={() => go(it)}
            >
              {it}
            </button>
          ),
        )}
        <button
          type="button"
          className="page-btn"
          onClick={() => go(page + 1)}
          disabled={page === totalPages}
          aria-label="다음"
        >
          ›
        </button>
        <button
          type="button"
          className="page-btn"
          onClick={() => go(totalPages)}
          disabled={page === totalPages}
          aria-label="마지막 페이지"
        >
          »
        </button>
      </div>
    </nav>
  );
}
