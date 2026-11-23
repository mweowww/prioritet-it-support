import { createServer } from 'node:http';
import { createHandler } from './app.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT должен быть от 1 до 65535.');
createServer(await createHandler()).listen(port, '127.0.0.1', () => {
  console.log(`Служба ИТ-поддержки: http://127.0.0.1:${port}`);
});
