import { randomBytes } from 'node:crypto';
import { readFile, appendFile } from 'node:fs/promises';
import { Client } from 'pg';

const envFile = new URL('../.env', import.meta.url);
const existing = await readFile(envFile, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
if (/^DATABASE_URL=.+/m.test(existing)) {
  throw new Error('Подключение уже задано в .env.');
}

const admin = new Client({ host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres' });
const password = randomBytes(32).toString('hex');
await admin.connect();
try {
  const { rows } = await admin.query("SELECT EXISTS (SELECT FROM pg_roles WHERE rolname='prioritet_app') OR EXISTS (SELECT FROM pg_database WHERE datname='prioritet_support') AS occupied");
  if (rows[0].occupied) throw new Error('База или роль уже существует. Укажите действующее подключение в .env.');
  await admin.query(`CREATE ROLE prioritet_app LOGIN PASSWORD '${password}'`);
  try {
    await admin.query('CREATE DATABASE prioritet_support OWNER prioritet_app');
  } catch (error) {
    await admin.query('DROP ROLE prioritet_app');
    throw error;
  }
  await appendFile(envFile, `\nDATABASE_URL=postgresql://prioritet_app:${password}@127.0.0.1:5432/prioritet_support\n`);
  console.log('База и роль созданы. Настройки сохранены в локальном файле .env.');
} finally {
  await admin.end();
}
