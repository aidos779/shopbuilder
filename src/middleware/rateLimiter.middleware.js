const rateLimit = require('express-rate-limit');

const createRateLimiter = (options = {}) => {
  const config = {
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    // Skip rate limiting in test environment
    skip: () => process.env.NODE_ENV === 'test',
    ...options,
  };

  if (process.env.REDIS_HOST && process.env.NODE_ENV !== 'test') {
    try {
      const { RedisStore } = require('rate-limit-redis');
      const redis = require('../config/redis');
      config.store = new RedisStore({
        sendCommand: (...args) => redis.call(...args),
      });
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      console.warn('Redis rate-limit store unavailable, using memory store:', err.message);
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_HOST is required for production rate limiting');
  }

  return rateLimit(config);
};

module.exports = { createRateLimiter };
