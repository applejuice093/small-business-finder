import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { db } from './config/database.js';
import { OsmConnector } from './scraper/connectors/osm.js';
import { processOutreachQueue } from './outreach/worker.js';
import {
  parseSortOrder,
  parsePagination,
  parseLatitude,
  parseLongitude,
  parseFiniteNumber,
  isBusinessScale,
  isContactStatus,
  isUuid,
} from './lib/validation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const DEFAULT_SCRAPE_RADIUS_METERS = 5000;
const MAX_SCRAPE_RADIUS_METERS = 50000;

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
      limit,
      page,
      sort_by = 'opportunity_score',
      order,
    } = req.query;

    // `order` is interpolated into ORDER BY (it cannot be a bind parameter), so
    // it must be whitelisted to 'asc' | 'desc' to prevent SQL injection.
    const sortOrder = parseSortOrder(order);

    // Clamp pagination to positive integers (limit capped at MAX_PAGE_SIZE) so
    // ?limit=abc or ?page=-1 no longer produce NaN / negative OFFSET errors.
    const { limit: limitVal, page: pageVal, offset: offsetVal } = parsePagination(limit, page);

    let queryParts = ['SELECT id, name, category, address, location, has_website, website_url, scale, review_count, review_rating, opportunity_score, contact_status, confidence_score, created_at'];
    let countQueryParts = ['SELECT COUNT(*) FROM businesses'];
    const whereClauses: string[] = [];
    const queryParams: any[] = [];

    // Filter by has_website
    if (has_website !== undefined) {
      queryParams.push(has_website === 'true');
      whereClauses.push(`has_website = $${queryParams.length}`);
    }

    // Reject unknown enum values up front; otherwise PostgreSQL throws
    // "invalid input value for enum" and the client gets an opaque 500.
    if (scale && !isBusinessScale(scale)) {
      res.status(400).json({ error: `Invalid scale "${String(scale)}"` });
      return;
    }
    if (contact_status && !isContactStatus(contact_status)) {
      res.status(400).json({ error: `Invalid contact_status "${String(contact_status)}"` });
      return;
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

    // Reference point used for distance calculation / sorting (null if absent or invalid).
    const refLat = parseLatitude(ref_lat);
    const refLng = parseLongitude(ref_lng);
    const hasRefPoint = refLat !== null && refLng !== null;

    // Calculate distance if coordinates provided (PostgreSQL POINT type distance operator <->).
    // refLat/refLng are validated finite numbers, so interpolating them is safe.
    if (hasRefPoint) {
      // location <-> point(lng, lat) gives Euclidean distance in degrees.
      // 1 degree ~ 111 km, or ~ 111000 meters (an approximation that ignores
      // longitude shrinking towards the poles).
      const distanceCalc = `(location <-> point(${refLng}, ${refLat})) * 111.0`;

      queryParts[0] += `, ${distanceCalc} AS distance_km`;

      const radiusMeters = parseFiniteNumber(radius_meters);
      if (radiusMeters !== null && radiusMeters > 0) {
        whereClauses.push(`${distanceCalc} <= ${radiusMeters / 1000.0}`);
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
    if (sort_by === 'distance' && hasRefPoint) {
      // refLat/refLng are validated finite numbers, so interpolation is safe.
      orderBy += `(location <-> point(${refLng}, ${refLat})) ${sortOrder}`;
    } else if (sort_by === 'opportunity_score') {
      orderBy += `opportunity_score ${sortOrder}`;
    } else if (sort_by === 'review_count') {
      orderBy += `review_count ${sortOrder}`;
    } else {
      orderBy += `created_at ${sortOrder}`;
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
        page: pageVal,
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
  const { business_ids, action } = req.body ?? {};
  // `params` is optional for approve/reject; default to {} so destructuring
  // below cannot throw "Cannot destructure property of undefined".
  const params = req.body?.params ?? {};

  if (!business_ids || !Array.isArray(business_ids) || business_ids.length === 0) {
    res.status(400).json({ error: 'business_ids array is required' });
    return;
  }

  const invalidIds = business_ids.filter((id: unknown) => !isUuid(id));
  if (invalidIds.length > 0) {
    res.status(400).json({ error: `business_ids must be UUIDs (invalid: ${invalidIds.slice(0, 5).join(', ')})` });
    return;
  }

  try {
    if (action === 'update_status') {
      const { contact_status } = params;
      if (!isContactStatus(contact_status)) {
        res.status(400).json({ error: `params.contact_status must be a valid contact status` });
        return;
      }
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
      if (!isUuid(sequence_id)) {
        res.status(400).json({ error: 'params.sequence_id (UUID) is required for enroll_sequence' });
        return;
      }
      if (enrolled_by !== undefined && !isUuid(enrolled_by)) {
        res.status(400).json({ error: 'params.enrolled_by must be a UUID when provided' });
        return;
      }

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
  const { note, author_id } = req.body ?? {};

  if (!isUuid(id)) {
    res.status(400).json({ error: 'Lead id must be a UUID' });
    return;
  }
  if (typeof note !== 'string' || note.trim() === '') {
    res.status(400).json({ error: 'note content is required' });
    return;
  }
  if (author_id !== undefined && author_id !== null && !isUuid(author_id)) {
    res.status(400).json({ error: 'author_id must be a UUID when provided' });
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
      [id, authorId, note.trim()]
    );

    res.json({ success: true, message: 'Note added successfully' });
  } catch (error: any) {
    // 23503 = foreign_key_violation: the lead (or author) does not exist.
    if (error?.code === '23503') {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    console.error('API Error in POST /leads/:id/notes:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/v1/scrape
 * Manually trigger scraping for a location/query.
 */
app.post('/api/v1/scrape', async (req: Request, res: Response): Promise<void> => {
  const { query, latitude, longitude, radius_meters } = req.body ?? {};

  if (typeof query !== 'string' || query.trim() === '' || latitude === undefined || longitude === undefined) {
    res.status(400).json({ error: 'query, latitude, and longitude are required' });
    return;
  }

  const lat = parseLatitude(latitude);
  const lng = parseLongitude(longitude);
  if (lat === null || lng === null) {
    res.status(400).json({ error: 'latitude must be within [-90, 90] and longitude within [-180, 180]' });
    return;
  }

  // Default 5 km; cap at 50 km to keep Overpass queries (and email crawling) bounded.
  const radiusMeters = radius_meters === undefined || radius_meters === null || radius_meters === ''
    ? DEFAULT_SCRAPE_RADIUS_METERS
    : parseFiniteNumber(radius_meters);
  if (radiusMeters === null || radiusMeters <= 0 || radiusMeters > MAX_SCRAPE_RADIUS_METERS) {
    res.status(400).json({ error: `radius_meters must be a number between 1 and ${MAX_SCRAPE_RADIUS_METERS}` });
    return;
  }

  try {
    const connector = new OsmConnector();
    const scrapedLeads = await connector.scrape({
      query: query.trim(),
      latitude: lat,
      longitude: lng,
      radiusMeters,
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
      
      // Insert primary email contact if present
      if (lead.email) {
        try {
          await db.query(`
            INSERT INTO contacts (business_id, contact_type, value, is_primary)
            VALUES ($1, 'email', $2, true)
          `, [businessId, lead.email]);
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
 * GET /api/v1/outreach/sequences
 * Retrieve all sequences with steps and templates.
 */
app.get('/api/v1/outreach/sequences', async (req: Request, res: Response): Promise<void> => {
  try {
    const sequences = await db.query('SELECT id, name, description, created_at FROM outreach_sequences');
    const result = [];
    for (const seq of sequences.rows) {
      const steps = await db.query(`
        SELECT s.id, s.step_order, s.wait_days, t.name as template_name, t.channel, t.subject, t.body
        FROM outreach_sequence_steps s
        JOIN outreach_templates t ON s.template_id = t.id
        WHERE s.sequence_id = $1
        ORDER BY s.step_order ASC
      `, [seq.id]);
      result.push({
        ...seq,
        steps: steps.rows
      });
    }
    res.json(result);
  } catch (error: any) {
    console.error('API Error in GET /outreach/sequences:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

/**
 * GET /api/v1/outreach/templates
 * Retrieve all templates.
 */
app.get('/api/v1/outreach/templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const templates = await db.query('SELECT id, name, channel, subject, body, created_at FROM outreach_templates ORDER BY created_at DESC');
    res.json(templates.rows);
  } catch (error: any) {
    console.error('API Error in GET /outreach/templates:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

/**
 * GET /api/v1/outreach/enrollments
 * Retrieve all enrollments with business, sequence details and last message status.
 */
app.get('/api/v1/outreach/enrollments', async (req: Request, res: Response): Promise<void> => {
  try {
    const enrollments = await db.query(`
      SELECT 
        e.id, 
        e.current_step, 
        e.is_paused,
        e.enrolled_at, 
        e.completed_at,
        b.name as business_name, 
        b.category as business_category,
        s.name as sequence_name,
        (
          SELECT m.sent_at 
          FROM outreach_messages m 
          WHERE m.enrollment_id = e.id 
          ORDER BY m.sent_at DESC LIMIT 1
        ) as last_sent_at,
        (
          SELECT m.status 
          FROM outreach_messages m 
          WHERE m.enrollment_id = e.id 
          ORDER BY m.sent_at DESC LIMIT 1
        ) as last_status
      FROM outreach_enrollments e
      JOIN businesses b ON e.business_id = b.id
      JOIN outreach_sequences s ON e.sequence_id = s.id
      ORDER BY e.enrolled_at DESC
    `);
    res.json(enrollments.rows);
  } catch (error: any) {
    console.error('API Error in GET /outreach/enrollments:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

/**
 * POST /api/v1/outreach/enrollments/:id/toggle-pause
 * Toggle paused state for an enrollment.
 */
app.post('/api/v1/outreach/enrollments/:id/toggle-pause', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Enrollment id must be a UUID' });
    return;
  }
  try {
    const result = await db.query(
      'UPDATE outreach_enrollments SET is_paused = NOT is_paused WHERE id = $1 RETURNING is_paused',
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Enrollment not found' });
      return;
    }
    res.json({ success: true, is_paused: result.rows[0].is_paused });
  } catch (error: any) {
    console.error('API Error in POST /outreach/enrollments/:id/toggle-pause:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
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
