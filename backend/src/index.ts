import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { db } from './config/database.js';
import { OsmConnector } from './scraper/connectors/osm.js';
import { processOutreachQueue } from './outreach/worker.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Native CORS headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

/**
 * GET /api/v1/leads
 * Retrieves leads with filters, sorting, and dynamic Opportunity Score calculation.
 */
app.get('/api/v1/leads', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      has_website,
      scale,
      contact_status,
      category,
      ref_lat,
      ref_lng,
      radius_meters,
      limit = '20',
      page = '1',
      sort_by = 'opportunity_score',
      order = 'desc',
    } = req.query;

    const limitVal = parseInt(limit as string, 10);
    const offsetVal = (parseInt(page as string, 10) - 1) * limitVal;

    let queryParts = ['SELECT id, name, category, address, location, has_website, website_url, scale, review_count, review_rating, opportunity_score, contact_status, confidence_score, created_at'];
    let countQueryParts = ['SELECT COUNT(*) FROM businesses'];
    const whereClauses: string[] = [];
    const queryParams: any[] = [];

    // Filter by has_website
    if (has_website !== undefined) {
      queryParams.push(has_website === 'true');
      whereClauses.push(`has_website = $${queryParams.length}`);
    }

    // Filter by business scale
    if (scale) {
      queryParams.push(scale);
      whereClauses.push(`scale = $${queryParams.length}`);
    }

    // Filter by contact status
    if (contact_status) {
      queryParams.push(contact_status);
      whereClauses.push(`contact_status = $${queryParams.length}`);
    }

    // Filter by category (fuzzy search)
    if (category) {
      queryParams.push(`%${category}%`);
      whereClauses.push(`category ILIKE $${queryParams.length}`);
    }

    // Calculate distance if coordinates provided (PostgreSQL POINT type distance operator <->)
    if (ref_lat && ref_lng) {
      const latNum = parseFloat(ref_lat as string);
      const lngNum = parseFloat(ref_lng as string);
      if (!isNaN(latNum) && !isNaN(lngNum)) {
        // location <-> point(lng, lat) gives Euclidean distance in degrees.
        // 1 degree ~ 111 km, or ~ 111000 meters.
        const distanceCalc = `(location <-> point(${lngNum}, ${latNum})) * 111.0`;
        
        queryParts[0] += `, ${distanceCalc} AS distance_km`;
        
        if (radius_meters) {
          const radiusKm = parseFloat(radius_meters as string) / 1000.0;
          if (!isNaN(radiusKm)) {
            whereClauses.push(`${distanceCalc} <= ${radiusKm}`);
          }
        }
      }
    }

    queryParts.push('FROM businesses');

    // Append WHERE clauses to query strings
    if (whereClauses.length > 0) {
      const whereStr = ' WHERE ' + whereClauses.join(' AND ');
      queryParts.push(whereStr);
      countQueryParts.push(whereStr);
    }

    // Sorting
    let orderBy = 'ORDER BY ';
    if (sort_by === 'distance' && ref_lat && ref_lng) {
      const latNum = parseFloat(ref_lat as string);
      const lngNum = parseFloat(ref_lng as string);
      orderBy += `(location <-> point(${lngNum}, ${latNum})) ${order}`;
    } else if (sort_by === 'opportunity_score') {
      orderBy += `opportunity_score ${order}`;
    } else if (sort_by === 'review_count') {
      orderBy += `review_count ${order}`;
    } else {
      orderBy += `created_at ${order}`;
    }
    queryParts.push(orderBy);

    // Pagination
    queryParams.push(limitVal);
    queryParts.push(`LIMIT $${queryParams.length}`);
    queryParams.push(offsetVal);
    queryParts.push(`OFFSET $${queryParams.length}`);

    const finalQuery = queryParts.join(' ');
    const finalCountQuery = countQueryParts.join(' ');

    const dataResult = await db.query(finalQuery, queryParams);
    const countResult = await db.query(finalCountQuery, queryParams.slice(0, -2)); // omit limit & offset params

    const totalLeads = parseInt(countResult.rows[0].count, 10);

    res.json({
      data: dataResult.rows,
      pagination: {
        total: totalLeads,
        page: parseInt(page as string, 10),
        limit: limitVal,
        pages: Math.ceil(totalLeads / limitVal),
      },
    });
  } catch (error) {
    console.error('API Error in GET /leads:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/v1/leads/bulk-action
 * Perform actions (enrollment, tagging, status update) on multiple leads.
 */
app.post('/api/v1/leads/bulk-action', async (req: Request, res: Response): Promise<void> => {
  const { business_ids, action, params } = req.body;

  if (!business_ids || !Array.isArray(business_ids) || business_ids.length === 0) {
    res.status(400).json({ error: 'business_ids array is required' });
    return;
  }

  try {
    if (action === 'update_status') {
      const { contact_status } = params;
      await db.query(
        'UPDATE businesses SET contact_status = $1 WHERE id = ANY($2)',
        [contact_status, business_ids]
      );
      res.json({ success: true, message: `Updated contact status to "${contact_status}" for ${business_ids.length} leads` });
    } else if (action === 'approve') {
      await db.query(
        "UPDATE businesses SET approval_status = 'approved' WHERE id = ANY($1)",
        [business_ids]
      );
      res.json({ success: true, message: `Approved ${business_ids.length} leads for outreach` });
    } else if (action === 'reject') {
      await db.query(
        "UPDATE businesses SET approval_status = 'rejected' WHERE id = ANY($1)",
        [business_ids]
      );
      res.json({ success: true, message: `Rejected ${business_ids.length} leads` });
    } else if (action === 'enroll_sequence') {
      const { sequence_id, enrolled_by } = params;

      // First retrieve/create default user if no uuid was provided
      let userId = enrolled_by;
      if (!userId) {
        const userQuery = await db.query("SELECT id FROM users LIMIT 1");
        if (userQuery.rows.length > 0) {
          userId = userQuery.rows[0].id;
        } else {
          // Create dummy operator
          const newUser = await db.query(
            "INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id",
            ['operator@example.com', 'Dashboard Operator', 'operator']
          );
          userId = newUser.rows[0].id;
        }
      }

      // Bulk enroll approved businesses (enforcement trigger prevents enrolling unapproved ones)
      let enrolledCount = 0;
      let errors: string[] = [];

      for (const bizId of business_ids) {
        try {
          await db.query(
            'INSERT INTO outreach_enrollments (business_id, sequence_id, enrolled_by) VALUES ($1, $2, $3)',
            [bizId, sequence_id, userId]
          );
          enrolledCount++;
        } catch (e: any) {
          errors.push(`Lead ${bizId}: ${e.message}`);
        }
      }

      res.json({
        success: true,
        message: `Successfully enrolled ${enrolledCount} of ${business_ids.length} leads in sequence`,
        errors: errors.length > 0 ? errors : undefined
      });
    } else {
      res.status(400).json({ error: `Unsupported action "${action}"` });
    }
  } catch (error: any) {
    console.error('API Error in POST /leads/bulk-action:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

/**
 * POST /api/v1/leads/:id/notes
 * Add manual annotation note.
 */
app.post('/api/v1/leads/:id/notes', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { note, author_id } = req.body;

  if (!note) {
    res.status(400).json({ error: 'note content is required' });
    return;
  }

  try {
    let authorId = author_id;
    if (!authorId) {
      const userQuery = await db.query("SELECT id FROM users LIMIT 1");
      authorId = userQuery.rows[0]?.id || null;
    }

    await db.query(
      'INSERT INTO business_notes (business_id, author_id, note) VALUES ($1, $2, $3)',
      [id, authorId, note]
    );

    res.json({ success: true, message: 'Note added successfully' });
  } catch (error) {
    console.error('API Error in POST /leads/:id/notes:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/v1/scrape
 * Manually trigger scraping for a location/query.
 */
app.post('/api/v1/scrape', async (req: Request, res: Response): Promise<void> => {
  const { query, latitude, longitude, radius_meters } = req.body;

  if (!query || latitude === undefined || longitude === undefined) {
    res.status(400).json({ error: 'query, latitude, and longitude are required' });
    return;
  }

  try {
    const connector = new OsmConnector();
    const scrapedLeads = await connector.scrape({
      query,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radiusMeters: parseFloat(radius_meters || '5000')
    });

    let savedCount = 0;
    for (const lead of scrapedLeads) {
      // Deduplicate: check if this business from OSM has already been scraped
      const existingSource = await db.query(
        'SELECT business_id FROM business_sources WHERE source_name = $1 AND source_ref_id = $2',
        ['osm', lead.sourceRefId]
      );

      if (existingSource.rows.length > 0) {
        // Already exists, skip insertion to prevent duplicates
        continue;
      }

      // 1. Calculate Opportunity Score
      // Formula: weighted sum (no website: 50pts, social presence: 20pts, scale/rating/reviews: 30pts)
      let oppScore = 0;
      if (!lead.hasWebsite) oppScore += 50;
      
      const rating = lead.rating || 0;
      if (lead.reviewCount > 50 && rating > 4.0) {
        oppScore += 30; // Active but invisible
      } else if (lead.reviewCount > 10) {
        oppScore += 15;
      }

      // 2. Insert or update in database (deduplicating using sourceRefId)
      // Since schema.sql has UNIQUE (business_id, source_name, source_ref_id) in business_sources,
      // we check for existing sources. If duplicate of is configured, we link it.
      
      // Basic insert logic:
      const bizInsert = await db.query(`
        INSERT INTO businesses (name, category, address, location, has_website, website_url, scale, review_count, review_rating, opportunity_score)
        VALUES ($1, $2, $3, point($4, $5), $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        lead.name,
        lead.category,
        lead.address,
        lead.longitude, // location Point (x=lng, y=lat)
        lead.latitude,
        lead.hasWebsite,
        lead.websiteUrl,
        lead.scale,
        lead.reviewCount,
        lead.rating,
        oppScore
      ]);

      const businessId = bizInsert.rows[0].id;

      // Log source metadata
      await db.query(`
        INSERT INTO business_sources (business_id, source_name, source_ref_id, raw_payload)
        VALUES ($1, $2, $3, $4)
      `, [businessId, connector.sourceName, lead.sourceRefId, JSON.stringify(lead.rawPayload)]);

      // Insert primary phone contact if present
      if (lead.phone) {
        try {
          await db.query(`
            INSERT INTO contacts (business_id, contact_type, value, is_primary)
            VALUES ($1, 'phone', $2, true)
          `, [businessId, lead.phone]);
        } catch (contactError) {
          // Ignore unique contact value violation if duplicate
        }
      }

      savedCount++;
    }

    res.json({ success: true, message: `Scrape finished. Saved ${savedCount} leads.` });
  } catch (error) {
    console.error('API Error in POST /scrape:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/v1/outreach/process
 * Manually trigger sequence queue check run.
 */
app.post('/api/v1/outreach/process', async (req: Request, res: Response): Promise<void> => {
  try {
    await processOutreachQueue();
    res.json({ success: true, message: 'Outreach queue processing complete' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Worker failed to run' });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] API running at http://localhost:${PORT}`);
});
