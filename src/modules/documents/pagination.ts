export interface PaginationParams {
  /** 1-indexado. */
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function normalizePagination(pagination: Partial<PaginationParams>): PaginationParams {
  const page = Math.max(1, Math.floor(pagination.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(pagination.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  return { page, pageSize };
}
