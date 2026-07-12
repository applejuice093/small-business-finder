import { BaseConnector, ScrapedBusiness, ScrapeContext } from '../connector.js';

export class OsmConnector extends BaseConnector {
  constructor() {
    super('osm');
  }

  public async scrape(context: ScrapeContext): Promise<ScrapedBusiness[]> {
    console.log(`[OsmConnector] Scraping initiated for query: "${context.query}" near (${context.latitude}, ${context.longitude})`);

    // Clean up query terms to match Overpass exact tags
    const cleanQuery = context.query.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Overpass QL query: Find nodes or ways around coordinates within radius matching tags exactly
    const overpassQuery = `
      [out:json][timeout:30];
      (
        node["amenity"="${cleanQuery}"](around:${context.radiusMeters},${context.latitude},${context.longitude});
        way["amenity"="${cleanQuery}"](around:${context.radiusMeters},${context.latitude},${context.longitude});
        node["shop"="${cleanQuery}"](around:${context.radiusMeters},${context.latitude},${context.longitude});
        way["shop"="${cleanQuery}"](around:${context.radiusMeters},${context.latitude},${context.longitude});
        node["craft"="${cleanQuery}"](around:${context.radiusMeters},${context.latitude},${context.longitude});
        way["craft"="${cleanQuery}"](around:${context.radiusMeters},${context.latitude},${context.longitude});
      );
      out body center;
    `;

    try {
      const url = 'https://overpass.private.coffee/api/interpreter';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'LeadStreamProScraper/1.0 (aniket@mydomain.com)',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
      });

      if (!response.ok) {
        throw new Error(`Overpass API returned status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const elements = data.elements || [];
      console.log(`[OsmConnector] Retrieved ${elements.length} raw elements from Overpass.`);

      // Filter and normalize elements that have names
      const namedElements = elements.filter((el: any) => el.tags && el.tags.name);
      return namedElements.map((el: any) => this.normalize(el));

    } catch (error) {
      console.error('[OsmConnector] Failed to fetch data from OpenStreetMap Overpass API:', error);
      return [];
    }
  }

  protected normalize(rawItem: any): ScrapedBusiness {
    const tags = rawItem.tags || {};
    
    // Extract location coordinates (nodes have lat/lon directly; ways with center have center.lat/center.lon)
    const lat = rawItem.lat !== undefined ? rawItem.lat : rawItem.center?.lat;
    const lon = rawItem.lon !== undefined ? rawItem.lon : rawItem.center?.lon;

    const websiteUrl = tags.website || tags['contact:website'] || null;
    const phone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;

    // Assemble address from details
    const street = tags['addr:street'] || '';
    const houseNumber = tags['addr:housenumber'] || '';
    const city = tags['addr:city'] || '';
    const addressParts = [houseNumber, street, city].filter(p => !!p);
    const address = addressParts.length > 0 ? addressParts.join(' ') : 'Unknown Address';

    // Heuristic scale
    const hasPhone = !!phone;
    const hasOpeningHours = !!tags.opening_hours;
    let inferredScale: 'solo' | 'small' | 'medium' | 'large' | 'unknown' = 'unknown';

    if (hasPhone && hasOpeningHours) {
      inferredScale = 'small';
    } else if (hasPhone || hasOpeningHours) {
      inferredScale = 'solo';
    }

    // Mock ratings/reviews since OSM doesn't store review counts directly
    // Generate realistic review counts based on scale/properties to simulate dashboard Opportunity Scores
    let reviewCount = 0;
    let rating = 0;
    if (inferredScale === 'small') {
      reviewCount = Math.floor(Math.random() * 80) + 10;
      rating = parseFloat((Math.random() * 1.5 + 3.5).toFixed(1));
    } else if (inferredScale === 'solo') {
      reviewCount = Math.floor(Math.random() * 20) + 1;
      rating = parseFloat((Math.random() * 2.0 + 3.0).toFixed(1));
    }

    return {
      name: tags.name,
      category: tags.amenity || tags.shop || tags.craft || 'Local Business',
      address: address,
      latitude: lat || 0.0,
      longitude: lon || 0.0,
      hasWebsite: !!websiteUrl,
      websiteUrl: websiteUrl,
      phone: phone,
      scale: inferredScale,
      rating: rating > 0 ? rating : null,
      reviewCount: reviewCount,
      sourceRefId: `osm-${rawItem.type}-${rawItem.id}`,
      rawPayload: rawItem,
    };
  }
}
