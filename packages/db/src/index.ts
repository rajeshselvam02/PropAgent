import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:@localhost:5432/propagent_dev',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export default {
  query: (text: string, params?: any[]) => pool.query(text, params),
  getClient: async () => {
    const client = await pool.connect();
    return client;
  },
  pool,
};
