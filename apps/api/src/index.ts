import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { sourceRoutes } from "./routes/sources.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { reviewRoutes } from "./routes/reviews.js";
import { searchRoutes } from "./routes/search.js";
import { auditRoutes } from "./routes/audit.js";
import { metricsRoutes } from "./routes/metrics.js";

export function createApp() {
  const app = new Hono();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: (process.env.CORS_ORIGINS ?? "http://localhost:3210").split(","),
      credentials: true,
    }),
  );

  app.route("/api/health", healthRoutes);
  app.route("/api/v1/auth", authRoutes);
  app.route("/api/v1/sources", sourceRoutes);
  app.route("/api/v1/knowledge", knowledgeRoutes);
  app.route("/api/v1/reviews", reviewRoutes);
  app.route("/api/v1/search", searchRoutes);
  app.route("/api/v1/audit", auditRoutes);
  app.route("/api/v1/metrics", metricsRoutes);

  app.notFound((c) => c.json({ error: "Not Found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}
