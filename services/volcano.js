// services/volcano.js
const cheerio = require("cheerio");
const { DEFAULTS } = require("../config");
const logger = require("../lib/logger");
const { retry } = require("../lib/retry");

/**
 * VolcanoService — обёртка над HTTP + парсингом HTML
 */
class VolcanoService {
  constructor({ fetch: fetchImpl = global.fetch, config = DEFAULTS.VOLCANO } = {}) {
    this.fetch = fetchImpl;
    this.host = config.HOST;
    this.sitekey = config.SITEKEY;
    this.maxStage = config.MAX_STAGE;
  }

  GetMaxStage() { return this.maxStage; }
  GetFirstId() { return "0"; }
  GetLootdestUrl() { return `${this.host}/lootlabs`; }

  async GetCloudflareToken(Solver) {
    if (!Solver || typeof Solver.cloudflareTurnstile !== "function") {
      throw new TypeError("Invalid Solver passed to GetCloudflareToken");
    }
    return Solver.cloudflareTurnstile({
      pageurl: `${this.host}/lootlabs`,
      sitekey: this.sitekey,
    });
  }

  /**
   * Валидация URL перед fetch и базовая обработка ответа.
   */
  async _fetchWithValidation(url, opts = {}) {
    if (typeof url !== "string") {
      throw new TypeError(`Expected url string for fetch but got: ${JSON.stringify(url)}`);
    }

    // попытка создать новый URL для явной проверки валидности
    try {
      // eslint-disable-next-line no-new
      new URL(url);
    } catch (err) {
      throw new TypeError(`Failed to parse URL from provided value: ${url}`);
    }

    const res = await this.fetch(url, opts);
    if (!res) throw new Error("fetch returned falsy response");
    if (!res.ok && res.status !== 302) {
      // 302 — ожидаемое редирект поведение для checkpoint
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return res;
  }

  async GetInfo(url) {
    return retry(async () => {
      const res = await this._fetchWithValidation(url, { method: "GET" });
      const html = await res.text();
      const $ = cheerio.load(html);

      const text = $('.flex.justify-between.text-sm.font-medium.text-gray-300 span').eq(1).text().trim();
      const current = Number.parseInt((text.split("/")[0] || "0").trim(), 10);
      const key = $("#key-display").text().trim() || "";

      return { current_stage: Number.isNaN(current) ? 0 : current, key };
    }, { attempts: 2, baseDelayMs: 200 });
  }

  async NextCheckpoint(url, id, cloudflareToken) {
    if (!url) throw new TypeError("url is required");
    if (typeof id !== "string") throw new TypeError("id must be string");

    const info = await this.GetInfo(url);

    const res = await this._fetchWithValidation(url, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `id=${encodeURIComponent(id)}&cf-turnstile-response=${encodeURIComponent(cloudflareToken)}`,
    });

    const location = res.headers.get("location") || undefined;
    logger.debug("NextCheckpoint result location:", location);

    return {
      current_stage: info.current_stage,
      next: location,
      key: info.key,
    };
  }
}

module.exports = VolcanoService;
