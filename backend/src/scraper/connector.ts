export interface ScrapedBusiness {
  name: string;
  category?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  hasWebsite: boolean;
  websiteUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  scale: 'solo' | 'small' | 'medium' | 'large' | 'unknown';
  rating?: number | null;
  reviewCount: number;
  sourceRefId: string;
  rawPayload: any;
}

export interface ScrapeContext {
  query: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export abstract class BaseConnector {
  public readonly sourceName: string;

  constructor(sourceName: string) {
    this.sourceName = sourceName;
  }

  /**
   * Scrapes data from the underlying source using the provided context.
   */
  public abstract scrape(context: ScrapeContext): Promise<ScrapedBusiness[]>;

  /**
   * Abstract helper to normalize raw data into unified ScrapedBusiness interface.
   */
  protected abstract normalize(rawItem: any, details?: any): ScrapedBusiness;
}
