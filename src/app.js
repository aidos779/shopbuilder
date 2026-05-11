require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { validateEnv } = require('./utils/env');

validateEnv();

const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const merchantRoutes = require('./routes/merchant.routes');
const storeRoutes = require('./routes/store.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const orderRoutes = require('./routes/order.routes');
const adminRoutes = require('./routes/admin.routes');
const cartRoutes = require('./routes/cart.routes');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/merchants', merchantRoutes);
app.use('/stores', storeRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/orders', orderRoutes);
app.use('/admin', adminRoutes);
app.use('/cart', cartRoutes);

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' })
);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;
