import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface EventForDefault {
  id: string;
  status?: string;
  start_date?: string;
  created_at?: string;
}

/**
 * Returns the default event id for admin views.
 * Priority:
 *  1) most recent published event (by start_date desc)
 *  2) most recent event of any other status (by created_at desc)
 */
export function getDefaultEventId<T extends EventForDefault>(events: T[] | null | undefined): string | undefined {
  if (!events || events.length === 0) return undefined;
  const published = events
    .filter((e) => e.status === "published")
    .sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
  if (published.length > 0) return published[0].id;
  const sorted = [...events].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return sorted[0].id;
}
