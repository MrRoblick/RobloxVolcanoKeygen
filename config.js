// config.js — централизованные константы и опции
const DEFAULTS = {
  VOLCANO: {
    HOST: "https://key.volcano.wtf",
    SITEKEY: "0x4AAAAAABNx91M7AJvQomg-",
    MAX_STAGE: 3,
  },
  BYPASS: {
    HOST: "https://bypass.city",
    HOST_API: "https://api2.bypass.city",
    SITEKEY: "0x4AAAAAAAGzw6rXeQWJ_y2P",
    POLL_INTERVAL_MS: 2000,
    MAX_POLL_ATTEMPTS: 5000,
  },
  NETWORK: {
    FETCH_TIMEOUT_MS: 15_000,
    RETRY: {
      ATTEMPTS: 3,
      BASE_DELAY_MS: 500,
      FACTOR: 2,
    },
  },
};

module.exports = { DEFAULTS };
