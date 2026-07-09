import app, { setupViteDevMiddleware, setupStaticServing } from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const isDev = process.env.NODE_ENV !== "production";

async function start() {
  if (isDev) {
    try {
      await setupViteDevMiddleware(app);
      logger.info("Vite dev middleware attached");
    } catch (err) {
      logger.warn({ err }, "Vite dev middleware failed, trying static serving");
      await setupStaticServing(app);
    }
  } else {
    await setupStaticServing(app);
  }

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  // Encerramento gracioso: para de aceitar conexões, drena, fecha o pool.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    const force = setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
    server.close(async () => {
      try {
        const { pool } = await import("@workspace/db");
        await pool.end();
      } catch (err) {
        logger.warn({ err }, "Error closing DB pool");
      }
      clearTimeout(force);
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
