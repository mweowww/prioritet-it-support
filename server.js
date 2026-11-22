import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Укажите в PORT целое число от 1 до 65535.');
}

const page = await readFile(new URL('./public/index.html', import.meta.url));
const server = createServer((request, response) => {
  if (request.url.split('?')[0] !== '/') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Страница не найдена');
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(page);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Служба ИТ-поддержки запущена на http://127.0.0.1:${port}`);
});
