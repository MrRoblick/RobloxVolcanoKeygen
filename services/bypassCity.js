// services/bypassCity.js
const cheerio = require("cheerio");
const { DEFAULTS } = require("../config");
const logger = require("../lib/logger");
const { sleep } = require("../lib/utils");

/**
 * BypassCityService
 * Возвращает унифицированный объект:
 * { data: <raw api payload>, url: "<string|null>", isLongLivedToken: boolean, taskId?: string, key?: string }
 */
class BypassCityService {
  constructor({ fetch: fetchImpl = global.fetch, config = DEFAULTS.BYPASS } = {}) {
    this.fetch = fetchImpl;
    this.host = config.HOST;
    this.hostApi = config.HOST_API;
    this.sitekey = config.SITEKEY;
    this.pollIntervalMs = config.POLL_INTERVAL_MS;
    this.maxPollAttempts = config.MAX_POLL_ATTEMPTS;
    // volcano host from global config so we can detect result pages
    this._volcanoHost = (DEFAULTS && DEFAULTS.VOLCANO && DEFAULTS.VOLCANO.HOST) || "https://key.volcano.wtf";
  }

  async GetCloudflareToken(Solver) {
    if (!Solver || typeof Solver.cloudflareTurnstile !== "function") {
      throw new TypeError("Invalid Solver for GetCloudflareToken");
    }
    return Solver.cloudflareTurnstile({
      pageurl: `${this.host}/bypass`,
      sitekey: this.sitekey,
    });
  }

  _normalizeUrlFromPayload(payload) {
    if (!payload) return null;
    if (typeof payload === "string") return payload;
    if (typeof payload === "object") {
      if (typeof payload.data === "string") return payload.data;
      if (typeof payload.url === "string") return payload.url;
    }
    return null;
  }

  /**
   * Если url выглядит как https://key.volcano.wtf/lootlabs/result/* — попробуем GET и распарсить ключ.
   * Возвращаемую структуру расширяем полем key (string) при успехе.
   */
  async _tryFetchVolcanoResultKey(url) {
    try {
      // валидный GET
      const res = await this.fetch(url, { method: "GET" });
      if (!res || !res.ok) {
        logger.debug(`Volcano result GET returned ${res ? res.status : "no response"} for ${url}`);
        return null;
      }
      const html = await res.text();
      const $ = cheerio.load(html);

      // селектор совпадает с тем, что использовался в VolcanoService
      const keyText = $("#key-display").text().trim();
      if (keyText && keyText.length > 0) {
        return keyText;
      }

      // если ключ не найден по #key-display — можно расширить парсинг здесь
      return null;
    } catch (err) {
      logger.warn("Error fetching/parsing volcano result page:", err && err.message ? err.message : err);
      return null;
    }
  }

  /**
   * Bypass запускает задачу и/или возвращает сразу data/url. Дополнительно,
   * если url попадает на /lootlabs/result/* — делает GET и пытается достать ключ.
   */
  async Bypass(url, cloudflareToken, opts = {}) {
    const pollIntervalMs = opts.pollIntervalMs ?? this.pollIntervalMs;
    const maxAttempts = opts.maxAttempts ?? this.maxPollAttempts;

    if (!url) throw new TypeError("url is required for Bypass");
    if (!cloudflareToken) throw new TypeError("cloudflareToken is required for Bypass");

    const startRes = await this.fetch(`${this.hostApi}/bypass`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        token: cloudflareToken,
        "x-captcha-provider": "TURNSTILE",
      },
      body: JSON.stringify({ url }),
    });

    if (!startRes.ok) {
      const text = await startRes.text().catch(() => "");
      throw new Error(`Bypass start failed: ${startRes.status} ${text}`);
    }

    const startJson = await startRes.json();

    // если не long-lived — немедленный результат (нормализуем url)
    if (!startJson?.isLongLivedToken) {
      const raw = startJson?.data;
      const normalizedUrl = this._normalizeUrlFromPayload(raw);
      logger.info("Bypass: immediate result from API (not long-lived).");
      // try to fetch key if this is volcano result page
      let parsedKey = null;
      if (normalizedUrl && normalizedUrl.startsWith(`${this._volcanoHost}/lootlabs/result/`)) {
        parsedKey = await this._tryFetchVolcanoResultKey(normalizedUrl);
      }
      return { data: raw, url: normalizedUrl, isLongLivedToken: false, key: parsedKey ?? undefined };
    }

    // long-lived flow
    const taskId = startJson?.data;
    if (!taskId) throw new Error("Bypass start: isLongLivedToken=true but no taskId returned");

    logger.info(`Bypass: long-lived task started (${taskId}), polling for completion...`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const statusRes = await this.fetch(`${this.hostApi}/long-lived/${taskId}/status`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!statusRes.ok) {
        logger.warn(`Bypass status ${statusRes.status} for task ${taskId}`);
      } else {
        const data = await statusRes.json();
        logger.info(`Bypass task ${taskId} status=${data.status} progress=${data.progress}`);

        if (data.status === "COMPLETED") {
          const rawResult = data.result;
          const normalizedUrl = this._normalizeUrlFromPayload(rawResult);
          // если это volcano result — попытаемся получить ключ
          let parsedKey = null;
          if (normalizedUrl && normalizedUrl.startsWith(`${this._volcanoHost}/lootlabs/result/`)) {
            parsedKey = await this._tryFetchVolcanoResultKey(normalizedUrl);
          }
          return {
            data: rawResult,
            url: normalizedUrl,
            isLongLivedToken: true,
            taskId,
            key: parsedKey ?? undefined,
          };
        }

        if (data.status === "FAILED") {
          throw new Error(`Bypass task ${taskId} failed: ${JSON.stringify(data)}`);
        }
      }

      await sleep(pollIntervalMs);
    }

    throw new Error("Bypass: timeout waiting for long-lived task completion");
  }
}

module.exports = BypassCityService;
