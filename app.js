import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db, initialize } from './db.js';
import { authPage, dashboard, ticketPage, categories, priorities } from './views.js';

import { showQueue, ticketWorkflow, queueRevision } from './workflow.js';

const deriveKey = promisify(scrypt);
const css = await readFile(new URL('./public/style.css', import.meta.url));
const queueScript = await readFile(new URL('./public/queue.js', import.meta.url));
const digest = input => createHash('sha256').update(input).digest('hex');

function normalizeLogin(raw) {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(raw) && raw.length <= 254) return raw.toLowerCase();
  const phone = raw.replace(/[\s()-]/g, '').replace(/^8(?=\d{10}$)/, '+7');
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : '';
}

async function fields(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) return null;
    chunks.push(chunk);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
}

async function handle(req, res) {
  const endpoint = new URL(req.url, 'http://localhost');
  const path = endpoint.pathname;
  function send(status, content, type = 'text/html; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type });
    res.end(content);
  }
  function redirect(to) {
    res.writeHead(303, { Location: to });
    res.end();
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  const port = req.socket.localPort;
  const host = req.headers.host;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) return send(403, 'Адрес недоступен');
  const post = req.method === 'POST';
  if (post && req.headers.origin !== `http://${host}`) return send(403, 'Обновите страницу и повторите отправку.');
  if (!post && !['GET', 'HEAD'].includes(req.method)) return send(405, 'Метод недоступен');
  if (!post && path === '/style.css') return send(200, css, 'text/css; charset=utf-8');
  if (!post && path === '/queue.js') return send(200,queueScript,'text/javascript; charset=utf-8');
  const key = /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const user = key && (await db.query('SELECT s.id, s.login, s.role FROM staff s JOIN sessions x ON x.staff_id=s.id WHERE x.token_hash=$1 AND x.expires_at>now()', [digest(key)])).rows[0];

  if (!post && path === '/queue/revision') {
    if (user?.role !== 'technician') return send(403,'Недостаточно прав');
    return send(200, await queueRevision(),'text/plain; charset=utf-8');
  }
  if (!post && path === '/') {
    if (!user) return send(200, authPage(false));
    if (user.role === 'technician') return send(200, await showQueue(user,endpoint.searchParams));
    const tickets = await db.query('SELECT * FROM tickets WHERE staff_id=$1 ORDER BY id DESC', [user.id]);
    return send(200, dashboard(user, tickets.rows, endpoint.searchParams.get('created')));
  }
  const ticket = /^\/tickets\/([1-9]\d{0,9})$/.exec(path);
  if (ticket && Number(ticket[1]) <= 2147483647) {
    if (!user) return redirect('/');
    const form = post ? await fields(req) : null;
    if (post && !form) return send(400,'Не удалось прочитать форму.');
    return ticketWorkflow({id:ticket[1],user,post,form,send,redirect});
  }
  if (user?.role === 'technician' && ['/tickets','/tickets/new'].includes(path)) return redirect('/');
  if (!post && path === '/register') return user ? redirect('/') : send(200, authPage(true));
  if (!post && path === '/tickets/new') return user ? send(200, ticketPage(user)) : redirect('/');
  if (!post || !['/register','/login','/logout','/tickets'].includes(path)) return send(404, 'Страница не найдена');
  const form = await fields(req);
  if (!form) return send(400, 'Не удалось прочитать форму.');
  if (path === '/logout') {
    if (key) await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(key)]);
    res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    return redirect('/');
  }
  if (path === '/tickets') {
    if (!user) return redirect('/');
    const limits = { subject:150, department:100, location:100, description:4000 };
    const invalid = Object.entries(limits).some(([field, max]) => !form[field]?.trim() || form[field].length > max);
    if (invalid || !categories.includes(form.category) || !priorities.includes(form.priority) || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(form.form_id || '')) {
      return send(422, ticketPage(user, form, 'Проверьте поля заявки и выберите категорию и приоритет.'));
    }
    const values = [user.id, form.form_id, form.subject.trim(), form.category, form.department.trim(), form.location.trim(), form.priority, form.description.trim()];
    const result = await db.query(`INSERT INTO tickets (staff_id,form_id,subject,category,department,location,priority,description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (staff_id,form_id) DO UPDATE SET form_id=excluded.form_id RETURNING id`, values);
    return redirect('/?created=' + result.rows[0].id);
  }
  if (user) return redirect('/');
  const register = path === '/register';
  const rawLogin = form.login?.trim() || '';
  const login = normalizeLogin(rawLogin);
  const password = form.password || '';
  if (!login || !password || password.length > 128 || (register && password.length < 10)) {
    return send(422, authPage(register, 'Введите рабочую почту или телефон с кодом страны и пароль' + (register ? ' длиной от 10 до 128 символов.' : '.'), rawLogin));
  }
  let id;
  if (register) {
    const salt = randomBytes(16).toString('hex');
    const hash = await deriveKey(password, salt, 64);
    const result = await db.query('INSERT INTO staff(login,salt,password_hash) VALUES($1,$2,$3) ON CONFLICT(login) DO NOTHING RETURNING id', [login,salt,hash.toString('hex')]);
    if (!result.rowCount) return send(409, authPage(true, 'Этот аккаунт уже зарегистрирован. Перейдите ко входу.', rawLogin));
    id = result.rows[0].id;
  } else {
    const record = (await db.query('SELECT * FROM staff WHERE login=$1',[login])).rows[0];
    const hash = await deriveKey(password, record?.salt || 'local-fallback', 64);
    if (!record || !timingSafeEqual(hash, Buffer.from(record.password_hash, 'hex'))) return send(401, authPage(false, 'Проверьте логин и пароль.', rawLogin));
    id = record.id;
  }
  const token = randomBytes(32).toString('hex');
  await db.query("INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[digest(token),id]);
  res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);
  redirect('/');
}

export async function createHandler() {
  await initialize();
  return (req, res) => {
    handle(req, res).catch(error => {
      console.error('Ошибка обработки запроса', error.code || error.name);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Не удалось обработать запрос. Повторите попытку.');
    });
  };
}
