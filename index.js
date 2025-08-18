// index.js — orchestration layer
const path = require("path");
const fs = require("fs").promises;
const rucaptcha = require("@2captcha/captcha-solver");
const VolcanoService = require("./services/volcano");
const BypassCityService = require("./services/bypassCity");
const logger = require("./lib/logger");
const { extractId } = require("./lib/utils");
const { DEFAULTS } = require("./config");

const TOKEN_PATH = path.resolve(__dirname, "token.txt");

async function readToken(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    const t = raw.trim();
    if (!t) throw new Error("token.txt is empty");
    return t;
  } catch (err) {
    logger.error("Failed to read token:", err.message);
    throw err;
  }
}

function normalizeBypassUrl(bypassResult) {
  if (!bypassResult) throw new Error("Bypass result is empty");
  if (typeof bypassResult.url === "string" && bypassResult.url.length > 0) return bypassResult.url;

  const raw = bypassResult.data;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    if (typeof raw.data === "string") return raw.data;
    if (typeof raw.url === "string") return raw.url;
  }

  throw new Error(`Failed to parse URL from bypass result: ${JSON.stringify(bypassResult)}`);
}

async function run() {
  logger.info("# VOLCANO KEYGEN #");

  const token = await readToken(TOKEN_PATH);
  const solver = new rucaptcha.Solver(token);

  const volcano = new VolcanoService({});
  const bypassCity = new BypassCityService({});

  const maxStage = volcano.GetMaxStage();
  let url = volcano.GetLootdestUrl();
  let id = volcano.GetFirstId();

  try {
    for (let stage = 0; stage <= maxStage; stage++) {
      logger.info(`\n--- Stage ${stage} ---`);

      const volcanoTok = await volcano.GetCloudflareToken(solver);
      logger.debug("VOLCANO token:", volcanoTok?.data);

      const checkpoint = await volcano.NextCheckpoint(url, id, volcanoTok?.data);
      logger.info("Checkpoint:", { current_stage: checkpoint.current_stage, next: checkpoint.next });

      if (checkpoint?.key && checkpoint.key.length > 0) {
        logger.info("🔑 Key obtained (from checkpoint):", checkpoint.key);
        return;
      }

      if (!checkpoint?.next) {
        logger.warn("No next URL provided by volcano; stopping.");
        break;
      }

      // Bypass flow
      const bypassTok = await bypassCity.GetCloudflareToken(solver);
      logger.debug("BYPASS token:", bypassTok?.data);

      const bypassResult = await bypassCity.Bypass(checkpoint.next, bypassTok?.data, {
        pollIntervalMs: DEFAULTS.BYPASS.POLL_INTERVAL_MS,
        maxAttempts: DEFAULTS.BYPASS.MAX_POLL_ATTEMPTS,
      });

      if (bypassResult && typeof bypassResult.key === "string" && bypassResult.key.length > 0) {
        logger.info("🔑 Key obtained (from bypass result):", bypassResult.key);
        return;
      }

      // normalize and validate URL
      const normalizedUrl = normalizeBypassUrl(bypassResult);

      // assign and parse id
      url = normalizedUrl;
      id = extractId(url);

      logger.info("Bypassed URL:", { url, isLongLived: bypassResult.isLongLivedToken, taskId: bypassResult.taskId ?? null });
      logger.debug("Parsed id:", id);
    }

    logger.warn("Completed loop without acquiring key.");
  } catch (err) {
    logger.error("Fatal error:", err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  logger.error("Unhandled error in run():", err);
  process.exitCode = 1;
});
