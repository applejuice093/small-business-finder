import { BaseConnector, ScrapedBusiness, ScrapeContext } from '../connector.js';

export class GooglePlacesConnector extends BaseConnector {
  private apiKey: string;

  constructor(apiKey: string) {
    super('google_places');
    this.apiKey = apiKey;
  }

  /**
   * Scrapes businesses from Google Places.
   * In production, this would make HTTP requests to the Google Places API.
   * Here we mock the behavior with dummy responses to show functional code structure.
   */
  public async scrape(context: ScrapeContext): Promise<ScrapedBusiness[]> {
    console.log(`[GooglePlacesConnector] Scraped initiated with query: "${context.query}" at (${context.latitude}, ${context.longitude})`);

    // Mock response simulating a Nearby Search
    const mockNearbyResults = [
      {
        place_id: "ch_12345",
        name: "Greenside Landscaping",
        types: ["roofing_contractor", "home_goods_store", "point_of_interest", "establishment"],
        vicinity: "123 Maple St, Seattle, WA",
        geometry: {
          location: {
            lat: context.latitude + 0.005,
            lng: context.longitude - 0.003
          }
        },
        rating: 4.2,
        user_ratings_total: 18
      },
      {
        place_id: "ch_67890",
        name: "Downtown Bakery & Coffee",
        types: ["bakery", "cafe", "food", "point_of_interest", "establishment"],
        vicinity: "456 Oak Rd, Seattle, WA",
        geometry: {
          location: {
            lat: context.latitude - 0.002,
            lng: context.longitude + 0.004
          }
        },
        rating: 4.8,
        user_ratings_total: 240
      }
    ];

    // Simulating deep details lookup for each place
    const mockDetailsResults: Record<string, any> = {
      "ch_12345": {
        website: undefined, // Lacks website
        formatted_phone_number: "+1 206-555-0199"
      },
      "ch_67890": {
        website: "https://downtownbakery.com", // Has website
        formatted_phone_number: "+1 206-555-0244"
      }
    };

    return mockNearbyResults.map((nearbyItem) => {
      const details = mockDetailsResults[nearbyItem.place_id] || {};
      return this.normalize(nearbyItem, details);
    });
  }

  protected normalize(rawNearby: any, rawDetails: any): ScrapedBusiness {
    const websiteUrl = rawDetails.website || null;
    const phone = rawDetails.formatted_phone_number || null;
    const reviewsCount = rawNearby.user_ratings_total || 0;
    const rating = rawNearby.rating || null;

    // Opportunity assessment heuristics
    let inferredScale: 'solo' | 'small' | 'medium' | 'large' | 'unknown' = 'unknown';
    if (reviewsCount > 200) inferredScale = 'medium';
    else if (reviewsCount > 30) inferredScale = 'small';
    else if (reviewsCount > 0) inferredScale = 'solo';

    return {
      name: rawNearby.name,
      category: rawNearby.types?.[0] || 'Business',
      address: rawNearby.vicinity || null,
      latitude: rawNearby.geometry.location.lat,
      longitude: rawNearby.geometry.location.lng,
      hasWebsite: !!websiteUrl,
      websiteUrl: websiteUrl,
      phone: phone,
      scale: inferredScale,
      rating: rating,
      reviewCount: reviewsCount,
      sourceRefId: rawNearby.place_id,
      rawPayload: { nearby: rawNearby, details: rawDetails }
    };
  }
}
