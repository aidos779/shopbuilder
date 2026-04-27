const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ShopBuilder API running on http://localhost:${PORT}`);
  console.log(`Swagger docs:   http://localhost:${PORT}/docs`);
});
