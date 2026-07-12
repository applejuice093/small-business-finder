import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Aniket%4012@localhost:5432/business_discovery_outreach',
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  pool,
};
