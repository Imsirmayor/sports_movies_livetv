import { createApp } from "./app.js";
import { loadApiConfig } from "./config.js";
import { createLogger } from "@frankenstein/media-worker";

const log = createLogger("Api");

async function main(): Promise<void> {
  const config = loadApiConfig();
  const ctx = await createApp(config);

  const server = ctx.app.listen(config.port, config.host, () => {
    log.info(`API listening on http://${config.host}:${config.port}`);
  });

  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down...`);
    server.close();
    try {
      await ctx.shutdown();
    } catch (err) {
      log.error(`Shutdown error: ${err instanceof Error ? err.message : err}`);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  console.error(`[FATAL] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
