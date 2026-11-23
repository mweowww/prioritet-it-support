import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { Pool } from 'pg';

let connectionString = process.env.DATABASE_URL;
const envFile = new URL('./.env', import.meta.url);
if (!connectionString && existsSync(envFile)) {
  connectionString = parseEnv(readFileSync(envFile, 'utf8')).DATABASE_URL;
}
if (!connectionString) {
  throw new Error('Подготовьте PostgreSQL по инструкции в README.md (DATABASE_URL в .env).');
}
export const db = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
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
    ALTER TABLE staff ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'teacher'
      CHECK (role IN ('teacher','technician'));
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignee_id integer REFERENCES staff(id);
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id integer NOT NULL REFERENCES tickets(id),
      author_id integer NOT NULL REFERENCES staff(id),
      internal boolean NOT NULL DEFAULT false,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON ticket_comments(ticket_id, id);
    COMMIT;
  `);
}
