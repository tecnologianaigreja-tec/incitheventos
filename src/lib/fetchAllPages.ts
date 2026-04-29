/**
 * Fetches all rows by paging through a Supabase query builder.
 * Used by export/print/issue-all flows so they aren't capped by the 1000-row limit.
 *
 * The `buildQuery` factory must return a fresh query each call (already with filters applied,
 * but WITHOUT range/limit). The function appends `.range(from, to)`.
 */
export async function fetchAllPages<T>(
  buildQuery: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // safety cap
  for (let i = 0; i < 1000; i++) {
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
