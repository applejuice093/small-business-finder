-- ============================================================
-- Business Discovery & Outreach System — PostgreSQL Schema
-- ============================================================
-- Key design principle: outreach NEVER auto-fires on discovery.
-- Every business must pass through approval_status = 'approved'
-- (set manually by you in the dashboard) before it can enter
-- the outreach_queue. See section 5 for the enforcement trigger.
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS postgis;      -- Disabled: PostGIS is not available on this server
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- for fuzzy name matching / dedup

-- ============================================================
-- 1. CORE LOOKUP / ENUM TYPES
-- ============================================================

CREATE TYPE business_scale AS ENUM ('solo', 'small', 'medium', 'large', 'unknown');

CREATE TYPE approval_status AS ENUM ('undecided', 'approved', 'rejected', 'on_hold');
-- undecided = default on scrape. Nothing happens until you change this.

CREATE TYPE outreach_channel AS ENUM ('email', 'whatsapp', 'sms');

CREATE TYPE message_status AS ENUM (
  'queued', 'sent', 'delivered', 'opened', 'replied',
  'bounced', 'failed', 'opted_out'
);

CREATE TYPE contact_status AS ENUM (
  'not_contacted', 'in_sequence', 'replied', 'converted', 'rejected', 'unsubscribed'
);

-- ============================================================
-- 2. USERS (internal team using the dashboard)
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'operator', -- operator, admin
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. BUSINESSES (core discovered entity)
-- ============================================================

CREATE TABLE businesses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  category            TEXT,
  description         TEXT,

  -- location
  address             TEXT,
  city                TEXT,
  region              TEXT,
  country             TEXT,
  location            POINT,                     -- lat/long via native POINT type
  location_source     TEXT,                      -- e.g. 'google_places'

  -- web presence
  has_website         BOOLEAN NOT NULL DEFAULT false,
  website_url         TEXT,
  instagram_url       TEXT,
  facebook_url        TEXT,
  linkedin_url        TEXT,

  -- signals for scale/opportunity scoring
  scale               business_scale NOT NULL DEFAULT 'unknown',
  employee_estimate   INT,
  review_count        INT DEFAULT 0,
  review_rating        NUMERIC(2,1),
  is_chain            BOOLEAN DEFAULT false,

  -- computed opportunity score (recalculated by app or trigger)
  opportunity_score   NUMERIC(5,2) DEFAULT 0,

  -- workflow / approval gate  <-- THE IMPORTANT PART
  approval_status     approval_status NOT NULL DEFAULT 'undecided',
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  decision_notes      TEXT,

  contact_status      contact_status NOT NULL DEFAULT 'not_contacted',

  -- data quality / provenance
  confidence_score    NUMERIC(3,2) DEFAULT 0.5,  -- 0..1, how trustworthy the scraped data is
  duplicate_of        UUID REFERENCES businesses(id), -- set if merged into another record

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_businesses_location ON businesses USING GIST (location);
CREATE INDEX idx_businesses_has_website ON businesses (has_website);
CREATE INDEX idx_businesses_approval_status ON businesses (approval_status);
CREATE INDEX idx_businesses_contact_status ON businesses (contact_status);
CREATE INDEX idx_businesses_scale ON businesses (scale);
CREATE INDEX idx_businesses_opportunity_score ON businesses (opportunity_score DESC);
CREATE INDEX idx_businesses_name_trgm ON businesses USING GIN (name gin_trgm_ops);

-- ============================================================
-- 4. SOURCES (which platform(s) each business was found on)
-- ============================================================

CREATE TABLE business_sources (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_name   TEXT NOT NULL,          -- 'google_places','osm','yelp','justdial','instagram', etc.
  source_ref_id TEXT,                    -- external ID at that source
  raw_payload   JSONB,                   -- full raw scrape for audit/debug
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, source_name, source_ref_id)
);

CREATE INDEX idx_business_sources_business_id ON business_sources (business_id);

-- ============================================================
-- 5. CONTACTS (email / phone / whatsapp per business)
-- ============================================================

CREATE TABLE contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_type  TEXT NOT NULL,      -- 'email', 'phone', 'whatsapp'
  value         TEXT NOT NULL,
  is_verified   BOOLEAN DEFAULT false,
  is_primary    BOOLEAN DEFAULT false,
  opted_out     BOOLEAN DEFAULT false,   -- compliance: never message again
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_business_id ON contacts (business_id);
CREATE UNIQUE INDEX idx_contacts_unique_value ON contacts (contact_type, value);

-- ============================================================
-- 6. TAGS & NOTES (manual annotation)
-- ============================================================

CREATE TABLE tags (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label   TEXT UNIQUE NOT NULL
);

CREATE TABLE business_tags (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (business_id, tag_id)
);

CREATE TABLE business_notes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  author_id     UUID REFERENCES users(id),
  note          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. OUTREACH TEMPLATES & SEQUENCES
-- ============================================================

CREATE TABLE outreach_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  channel       outreach_channel NOT NULL,
  subject       TEXT,                 -- used for email only
  body          TEXT NOT NULL,        -- supports {{business_name}}, {{category}}, {{city}} etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outreach_sequences (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outreach_sequence_steps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id     UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  step_order      INT NOT NULL,
  wait_days       INT NOT NULL DEFAULT 0,     -- delay after previous step (or enrollment)
  template_id     UUID NOT NULL REFERENCES outreach_templates(id),
  send_condition  TEXT DEFAULT 'no_reply',    -- 'always','no_reply','no_open'
  UNIQUE (sequence_id, step_order)
);

-- ============================================================
-- 8. OUTREACH QUEUE  <-- the manual approval gate lives here too
-- ============================================================
-- A business only enters this table once YOU approve it and
-- assign a sequence. Nothing in the outreach worker should ever
-- read from `businesses` directly to decide who to message.

CREATE TABLE outreach_enrollments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sequence_id       UUID NOT NULL REFERENCES outreach_sequences(id),
  enrolled_by       UUID NOT NULL REFERENCES users(id),   -- who approved/enrolled it
  current_step      INT NOT NULL DEFAULT 0,
  is_paused         BOOLEAN NOT NULL DEFAULT false,       -- manual kill switch per business
  enrolled_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_outreach_enrollments_business_id ON outreach_enrollments (business_id);

-- Enforcement trigger: block enrollment unless business is approved
CREATE OR REPLACE FUNCTION enforce_approval_before_enrollment()
RETURNS TRIGGER AS $$
DECLARE
  status approval_status;
BEGIN
  SELECT approval_status INTO status FROM businesses WHERE id = NEW.business_id;
  IF status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Business % is not approved (status=%). Approve it manually before enrolling in outreach.',
      NEW.business_id, status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_approval
BEFORE INSERT ON outreach_enrollments
FOR EACH ROW EXECUTE FUNCTION enforce_approval_before_enrollment();

-- ============================================================
-- 9. OUTREACH MESSAGES (actual send/receive log)
-- ============================================================

CREATE TABLE outreach_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id   UUID NOT NULL REFERENCES outreach_enrollments(id) ON DELETE CASCADE,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id),
  channel         outreach_channel NOT NULL,
  template_id     UUID REFERENCES outreach_templates(id),
  rendered_body   TEXT,               -- final message after variable substitution
  status          message_status NOT NULL DEFAULT 'queued',
  provider_msg_id TEXT,               -- Gmail message id / Twilio SID etc.
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  error_detail    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outreach_messages_business_id ON outreach_messages (business_id);
CREATE INDEX idx_outreach_messages_status ON outreach_messages (status);

-- ============================================================
-- 10. AUDIT LOG (who changed approval_status/tags/etc, and when)
-- ============================================================

CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID REFERENCES users(id),
  entity_table  TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  action        TEXT NOT NULL,        -- 'approved','rejected','tagged','enrolled', etc.
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 11. updated_at auto-touch trigger for businesses
-- ============================================================

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_businesses_updated_at
BEFORE UPDATE ON businesses
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- 12. Example: distance query (businesses within X km, no website,
--     sorted by distance, only approved-eligible i.e. undecided/approved)
-- ============================================================
-- SELECT id, name, has_website,
--        ST_Distance(location, ST_MakePoint(:lng, :lat)::geography) / 1000 AS distance_km
-- FROM businesses
-- WHERE has_website = false
--   AND approval_status != 'rejected'
--   AND ST_DWithin(location, ST_MakePoint(:lng, :lat)::geography, :radius_meters)
-- ORDER BY distance_km ASC;
