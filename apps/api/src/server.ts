import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./index.js";

const port = Number(process.env.PORT ?? 8210);
const app = createApp();

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`[ekcp-api] listening on http://0.0.0.0:${info.port}`);
});
