// lib/utils.js
const { URL } = require("url");

/**
 * Возвращает последний сегмент пути (id) из строки/URL.
 * @param {string} link
 * @returns {string}
 */
function extractId(link) {
  if (!link || typeof link !== "string") return "";
  try {
    const u = new URL(link);
    return u.pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    // fallback: treat as path
    return link.split("/").filter(Boolean).pop() || "";
  }
}

/** Sleep */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { extractId, sleep };
