/**
 * Small, dependency-free helpers for validating and normalising request input.
 *
 * Express hands query-string values to handlers as `string | string[] | ParsedQs`,
 * so every helper accepts `unknown` and returns a safe, typed value.
 */

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/**
 * Normalises a user-supplied sort direction. Anything other than "asc"/"desc"
 * (case-insensitive) falls back to the default. The result is safe to splice
 * into an ORDER BY clause because it can only ever be one of two literals.
 */
export function parseSortOrder(value: unknown, fallback: SortOrder = 'desc'): SortOrder {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return (SORT_ORDERS as readonly string[]).includes(normalized) ? (normalized as SortOrder) : fallback;
}

export interface Pagination {
  limit: number;
  page: number;
  offset: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Parses `limit` and `page` query params into safe positive integers.
 * Invalid or missing values fall back to defaults; `limit` is capped at
 * MAX_PAGE_SIZE so a single request cannot pull the whole table.
 */
export function parsePagination(limit: unknown, page: unknown): Pagination {
  const parsedLimit = toPositiveInt(limit) ?? DEFAULT_PAGE_SIZE;
  const safeLimit = Math.min(parsedLimit, MAX_PAGE_SIZE);
  const safePage = toPositiveInt(page) ?? 1;
  return { limit: safeLimit, page: safePage, offset: (safePage - 1) * safeLimit };
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  const parsed = Number.parseInt(str, 10);
  return parsed >= 1 ? parsed : null;
}

/**
 * Parses a finite number from a string or number. Returns null for empty
 * strings, NaN, Infinity, arrays, objects, etc.
 */
export function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLatitude(value: unknown): number | null {
  const n = parseFiniteNumber(value);
  return n !== null && n >= -90 && n <= 90 ? n : null;
}

export function parseLongitude(value: unknown): number | null {
  const n = parseFiniteNumber(value);
  return n !== null && n >= -180 && n <= 180 ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the value is a canonical UUID string (any version). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Mirrors the `contact_status` enum in schema.sql. */
export const CONTACT_STATUSES = [
  'not_contacted',
  'in_sequence',
  'replied',
  'converted',
  'rejected',
  'unsubscribed',
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export function isContactStatus(value: unknown): value is ContactStatus {
  return typeof value === 'string' && (CONTACT_STATUSES as readonly string[]).includes(value);
}

/** Mirrors the `business_scale` enum in schema.sql. */
export const BUSINESS_SCALES = ['solo', 'small', 'medium', 'large', 'unknown'] as const;
export type BusinessScale = (typeof BUSINESS_SCALES)[number];

export function isBusinessScale(value: unknown): value is BusinessScale {
  return typeof value === 'string' && (BUSINESS_SCALES as readonly string[]).includes(value);
}
