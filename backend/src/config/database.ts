import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail fast with a clear message instead of silently falling back to
  // hardcoded credentials. Copy .env.example to backend/.env and fill it in.
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to backend/.env and set DATABASE_URL ' +
      '(e.g. postgresql://postgres:<password>@localhost:5432/business_discovery_outreach).'
  );
}

const pool = new pg.Pool({ connectionString });

// Log (rather than crash on) errors emitted by idle clients, e.g. when the
// database restarts underneath a long-running dev server.
pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle PostgreSQL client:', err);
});

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
  pool,
};
