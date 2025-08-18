// lib/retry.js
const logger = require("./logger");

/**
 * Простая обёртка retry с экспоненциальным бэкоффом.
 */
async function retry(fn, opts = {}) {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 300;
  const factor = opts.factor ?? 2;

  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      const delay = Math.round(baseDelayMs * Math.pow(factor, i));
      logger.warn(`Attempt ${i + 1}/${attempts} failed: ${err.message}. Retrying in ${delay}ms`);
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

module.exports = { retry };
