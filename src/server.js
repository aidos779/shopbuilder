const app = require('./app');
const startWorkers = require('./workers');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`ShopBuilder API running on http://${HOST}:${PORT}`);
  console.log(`Swagger docs:   http://${HOST}:${PORT}/docs`);
  if (process.env.START_EMBEDDED_WORKERS !== 'false') {
    startWorkers().catch((err) => console.error('[worker] Failed to start embedded workers:', err));
  }
});
