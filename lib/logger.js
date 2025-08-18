// lib/logger.js — минимальный уровневый логгер
class Logger {
  constructor(level = "info") {
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
    this.level = this.levels[level] != null ? level : "info";
  }

  log(level, ...args) {
    if (this.levels[level] <= this.levels[this.level]) {
      const tag = `[${level.toUpperCase()}]`;
      console.log(tag, ...args);
    }
  }
  error(...args) { this.log("error", ...args); }
  warn(...args)  { this.log("warn",  ...args); }
  info(...args)  { this.log("info",  ...args); }
  debug(...args) { this.log("debug", ...args); }
}

module.exports = new Logger(process.env.LOG_LEVEL || "info");
