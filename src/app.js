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
const discountRoutes = require('./routes/discount.routes');
const webhookRoutes = require('./routes/webhook.routes');
const paymentRoutes = require('./routes/payment.routes');
const storefrontRoutes = require('./routes/storefront.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();

const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, '');

const defaultAllowedOrigins = process.env.NODE_ENV === 'production'
  ? ''
  : 'http://localhost:3000,http://localhost:5173';

const allowedOrigins = [
  process.env.ALLOWED_ORIGINS || defaultAllowedOrigins,
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map(normalizeOrigin)
  .filter((origin, index, origins) => origin && origin !== '*' && origins.indexOf(origin) === index);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) return callback(null, true);
      const error = new Error(`CORS: origin ${origin} not allowed`);
      error.status = 403;
      callback(error);
    },
    credentials: true,
  })
);

app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/openapi.json', (_req, res) => res.json(swaggerSpec));

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'ShopBuilder API running',
  });
});

app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/merchants', merchantRoutes);
app.use('/stores', storeRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/orders', orderRoutes);
app.use('/admin', adminRoutes);
app.use('/cart', cartRoutes);
app.use('/discounts', discountRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/payments', paymentRoutes);
app.use('/storefront', storefrontRoutes);
app.use('/subscriptions', subscriptionRoutes);
app.use('/analytics', analyticsRoutes);

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' })
);

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    error: {
      message: status === 500 ? 'Internal Server Error' : err.message,
      status,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = app;
