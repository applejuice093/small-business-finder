/**
 * Base URL of the LeadStream backend API (no trailing slash).
 *
 * Override at build/dev time with VITE_API_BASE_URL, e.g.
 *   VITE_API_BASE_URL=https://api.example.com pnpm dev
 */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
).replace(/\/+$/, '');

/** Builds an absolute API URL from a path such as "/api/v1/leads". */
export const apiUrl = (path: string): string => `${API_BASE_URL}${path}`;
