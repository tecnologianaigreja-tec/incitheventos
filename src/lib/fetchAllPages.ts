/**
 * Fetches all rows by paging through a Supabase query builder.
 * Used by export/print/issue-all flows so they aren't capped by the 1000-row limit.
 *
 * The `buildQuery` factory must return a fresh query each call (already with filters applied,
 * but WITHOUT range/limit). The function appends `.range(from, to)`.
 *
 * Hard cap: 50 pages × 1000 rows = 50 000 rows máximo por chamada.
 * Acima disso a exportação deve ser feita server-side.
 */
const MAX_PAGES = 50;

export async function fetchAllPages<T>(
  buildQuery: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
