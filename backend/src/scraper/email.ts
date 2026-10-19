const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** File extensions that show up in "name@2x.png"-style asset names. */
const ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.css', '.js'];

/** Placeholder / framework domains that are never a real business contact. */
const IGNORED_DOMAINS = ['example.com', 'example.org', 'w3.org', 'sentry.io', 'wixpress.com', 'domain.com'];

/**
 * Finds the first plausible contact email address in an HTML document.
 *
 * Retina asset names (logo@2x.png), placeholder domains and common
 * error-tracking addresses are skipped. Returns the address lower-cased, or
 * null when nothing usable is found.
 */
export function extractContactEmail(html: string): string | null {
  const matches = html.match(EMAIL_RE);
  if (!matches) return null;

  for (const raw of matches) {
    const email = raw.toLowerCase().replace(/\.+$/, '');
    if (ASSET_EXTENSIONS.some((ext) => email.endsWith(ext))) continue;
    const domain = email.split('@')[1] ?? '';
    if (IGNORED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) continue;
    return email;
  }
  return null;
}

/** Ensures a scraped website value has a protocol so it can be fetched. */
export function normalizeWebsiteUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}
