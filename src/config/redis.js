const Redis = require('ioredis');

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      tls: { rejectUnauthorized: false },
      lazyConnect: true,
    })
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      lazyConnect: true,
    });

redis.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('Redis connection error:', err.message);
  }
});

module.exports = redis;