const app = require('./app');
const startWorkers = require('./workers');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ShopBuilder API running on http://localhost:${PORT}`);
  console.log(`Swagger docs:   http://localhost:${PORT}/docs`);
  if (process.env.START_EMBEDDED_WORKERS !== 'false') {
    startWorkers().catch((err) => console.error('[worker] Failed to start embedded workers:', err));
  }
});
