import { KNOWN_FIELD_MAP, type ActiveFilter } from "@/components/DynamicFieldFilters";

/**
 * Applies dynamic field filters to a Supabase query builder server-side.
 * - Known columns (area, congregation, etc.) → filter directly on the column.
 * - Unknown keys → filter on `custom_fields->>field_key` JSONB path.
 * - Multi-select (values[]) → uses `.in(...)`.
 * - Free-text (value) → uses `.ilike(%...%)`.
 */
export function applyDynamicFiltersToQuery(query: any, filters: ActiveFilter[]) {
  for (const f of filters) {
    const column = KNOWN_FIELD_MAP[f.fieldKey];
    const path = column ?? `custom_fields->>${f.fieldKey}`;
    if (f.values && f.values.length > 0) {
      query = query.in(path, f.values);
    } else if (f.value) {
      const escaped = f.value.replace(/[%,]/g, "");
      query = query.ilike(path, `%${escaped}%`);
    }
  }
  return query;
}
