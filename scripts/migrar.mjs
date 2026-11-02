// Aplica supabase/migrations/*.sql en orden, una sola vez cada una. Uso: npm run db:migrar
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error('Falta SUPABASE_DB_URL en .env.local'); process.exit(1); }

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(`create table if not exists public._migraciones_avh (nombre text primary key, aplicada_en timestamptz not null default now());
                alter table public._migraciones_avh enable row level security;`);
const hechas = new Set((await db.query('select nombre from public._migraciones_avh')).rows.map(r => r.nombre));
const dir = new URL('../supabase/migrations/', import.meta.url);

for (const f of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
  if (hechas.has(f)) { console.log(`= ${f} (ya aplicada)`); continue; }
  const sql = await readFile(new URL(f, dir), 'utf8');
  try {
    await db.query('begin');
    await db.query(sql);
    await db.query('insert into public._migraciones_avh (nombre) values ($1)', [f]);
    await db.query('commit');
    console.log(`✓ ${f}`);
  } catch (e) {
    await db.query('rollback');
    console.error(`✗ ${f}: ${e.message}`);
    process.exitCode = 1;
    break;
  }
}
await db.end();
