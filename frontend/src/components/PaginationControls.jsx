const ADJACENT_PAGE_COUNT = 1;

/** Builds a compact page range with stable first/last-page access. */
export function getVisiblePages(currentPage, totalPages) {
  if (totalPages <= 1) return [1];

  const firstAdjacentPage = Math.max(2, currentPage - ADJACENT_PAGE_COUNT);
  const lastAdjacentPage = Math.min(totalPages - 1, currentPage + ADJACENT_PAGE_COUNT);
  const pages = [1];

  if (firstAdjacentPage > 2) pages.push('previous-gap');
  for (let page = firstAdjacentPage; page <= lastAdjacentPage; page += 1) pages.push(page);
  if (lastAdjacentPage < totalPages - 1) pages.push('next-gap');
  pages.push(totalPages);

  return pages;
}

/** Shared pagination footer for every application data table. */
export default function PaginationControls({
  pagination,
  limit,
  onLimitChange,
  onPageChange,
  itemLabel = 'résultat(s)',
  showPageSummary = true,
  disabled = false,
}) {
  if (!pagination) return null;

  const pages = getVisiblePages(pagination.page, pagination.totalPages);
  const pageButton = (page) => {
    const isCurrent = page === pagination.page;

    return (
      <li
        className={`page-item ${isCurrent ? 'active' : disabled ? 'disabled' : ''}`.trim()}
        key={page}
      >
        {isCurrent ? (
          <span aria-current="page" className="page-link">
            <span className="visually-hidden">Page actuelle, </span>
            {page}
          </span>
        ) : (
          <button
            aria-label={`Aller à la page ${page}`}
            className="page-link"
            type="button"
            disabled={disabled}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="pagination-controls mt-2 text-body-secondary small">
      <span className="pagination-summary">
        {pagination.total} {itemLabel}
        {showPageSummary && (
          <>
            , page {pagination.page} sur {pagination.totalPages}
          </>
        )}
      </span>
      <nav aria-label="Navigation entre les pages" className="pagination-direct-access">
        <ul className="pagination osteopilot-pagination mb-0">
          <li
            className={`page-item pagination-direction ${disabled || pagination.page <= 1 ? 'disabled' : ''}`}
          >
            <button
              className="page-link"
              type="button"
              disabled={disabled || pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              Précédent
            </button>
          </li>
          {pages.map((page) =>
            typeof page === 'number' ? (
              pageButton(page)
            ) : (
              <li aria-hidden="true" className="page-item disabled" key={page}>
                <span className="page-link pagination-gap">…</span>
              </li>
            ),
          )}
          <li
            className={`page-item pagination-direction ${disabled || pagination.page >= pagination.totalPages ? 'disabled' : ''}`}
          >
            <button
              className="page-link"
              type="button"
              disabled={disabled || pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Suivant
            </button>
          </li>
        </ul>
      </nav>
      <label className="pagination-page-size">
        Par page{' '}
        <select
          aria-label="Nombre d’éléments par page"
          className="form-select form-select-sm d-inline-block ms-1 w-auto"
          value={limit}
          disabled={disabled}
          onChange={(event) => onLimitChange(Number(event.target.value))}
        >
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="25">25</option>
        </select>
      </label>
    </div>
  );
}
