import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../config/database.js';

async function initializeDatabase() {
  const sqlPath = path.join(process.cwd(), 'src/database/init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  await pool.query("insert into users (id, phone, name, role, kyc_status) values ('demo-admin', '0000000000', 'Demo Administrator', 'ADMIN', 'APPROVED') on conflict (phone) do update set name = excluded.name, role = excluded.role, kyc_status = excluded.kyc_status");
  console.log('Supabase database initialized successfully');
}

initializeDatabase()
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
