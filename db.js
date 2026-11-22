import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('Подготовьте PostgreSQL по инструкции в README.md (DATABASE_URL в .env).');
}
export const db = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
export async function initialize() {
  await db.query(`
    BEGIN;
    SELECT pg_advisory_xact_lock(681714);
    CREATE TABLE IF NOT EXISTS staff (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      login text NOT NULL UNIQUE,
      salt text NOT NULL,
      password_hash text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash text PRIMARY KEY,
      staff_id integer NOT NULL REFERENCES staff(id),
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      staff_id integer NOT NULL REFERENCES staff(id),
      form_id uuid NOT NULL,
      subject text NOT NULL, category text NOT NULL,
      department text NOT NULL, location text NOT NULL,
      priority text NOT NULL, description text NOT NULL,
      status text NOT NULL DEFAULT 'Новая',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (staff_id, form_id)
    );
    CREATE INDEX IF NOT EXISTS tickets_staff_id_idx ON tickets(staff_id, id DESC);
    COMMIT;
  `);
}
