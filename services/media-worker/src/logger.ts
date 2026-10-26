export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const VALID = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
const raw = process.env.LOG_LEVEL ?? "INFO";
const minLevel: LogLevel = (VALID as readonly string[]).includes(raw)
  ? (raw as LogLevel)
  : "INFO";

function write(level: LogLevel, component: string, message: string): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;
  const line = `[${new Date().toISOString()}] [${level}] [${component}] ${message}`;
  if (level === "ERROR") console.error(line);
  else console.log(line);
}

export function createLogger(component: string) {
  return {
    debug: (msg: string) => write("DEBUG", component, msg),
    info: (msg: string) => write("INFO", component, msg),
    warn: (msg: string) => write("WARN", component, msg),
    error: (msg: string) => write("ERROR", component, msg),
  };
}
