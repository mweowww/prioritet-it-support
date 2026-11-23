let handler;

module.exports = {
  host: '127.0.0.1',
  cors: false,
  open: '/',
  navigate: false,
  middleware: [async (req, res) => {
    try {
      handler ??= import('./app.js').then(app => app.createHandler());
      const serve = await handler;
      serve(req, res);
    } catch (error) {
      handler = undefined;
      console.error('Кабинет не запущен:', error.code || error.name);
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Проверьте службу PostgreSQL и настройки подключения в .env.');
    }
  }]
};
