import { randomBytes, scryptSync } from 'node:crypto';
import { db, initialize } from '../db.js';

const login = (process.argv[2] || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(login) || login.length > 254) {
  console.error('Укажите рабочую почту нового исполнителя после команды.');
  process.exitCode = 1;
} else {
  try {
    await initialize();
    const salt = randomBytes(16).toString('hex');
    const password = randomBytes(18).toString('base64url');
    const hash = scryptSync(password, salt, 64).toString('hex');
    const result = await db.query(`INSERT INTO staff(login,salt,password_hash,role)
      VALUES ($1,$2,$3,'technician') ON CONFLICT(login) DO NOTHING`, [login,salt,hash]);
    if (result.rowCount) console.log('Логин:', login, '\nПароль:', password);
    else { console.error('Этот логин уже занят. Выберите другой.'); process.exitCode = 1; }
  } finally {
    await db.end();
  }
}
