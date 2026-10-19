import type { ScrapedBusiness } from '../scraper/connector.js';

/**
 * Opportunity Score (0-80 today) used to rank leads in the dashboard.
 *
 * - +50 when the business has no website (the core opportunity).
 * - +30 when it is clearly active but invisible online (>50 reviews and a
 *   rating above 4.0), otherwise +15 for moderate activity (>10 reviews).
 *
 * The remaining 20 points of the documented 100-point scale are reserved for
 * a future "social presence" signal that no connector provides yet.
 */
export function calculateOpportunityScore(
  lead: Pick<ScrapedBusiness, 'hasWebsite' | 'reviewCount' | 'rating'>
): number {
  let score = 0;
  if (!lead.hasWebsite) score += 50;

  const rating = lead.rating ?? 0;
  if (lead.reviewCount > 50 && rating > 4.0) {
    score += 30; // Active but invisible
  } else if (lead.reviewCount > 10) {
    score += 15;
  }
  return score;
}
