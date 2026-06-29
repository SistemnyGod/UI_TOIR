export type PageSizeOption = 25 | 50 | 100 | 200;

export function PaginationBar({
  page,
  pageSize,
  pageSizeOptions = [25, 50, 100, 200],
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: PageSizeOption;
  pageSizeOptions?: PageSizeOption[];
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSizeOption) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const first = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const last = total === 0 ? 0 : Math.min(total, safePage * pageSize);

  return (
    <div className="pagination-bar">
      <span>
        Показано {first}-{last} из {total}
      </span>
      <label>
        На странице
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSizeOption)}>
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <div className="pagination-bar-actions">
        <button disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} type="button">
          Назад
        </button>
        <strong>
          {safePage} / {pageCount}
        </strong>
        <button disabled={safePage >= pageCount} onClick={() => onPageChange(safePage + 1)} type="button">
          Вперед
        </button>
      </div>
    </div>
  );
}
