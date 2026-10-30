import express from "express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // Install CORS before routes, in both local and serverless entry points.
  const clientOrigins = new Set(
    (process.env.CLIENT_ORIGIN ?? "")
      .split(",")
      .map(origin => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin?.replace(/\/$/, "");
    if (requestOrigin && clientOrigins.has(requestOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.vary("Origin");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "fraud-sentinel-backend" });
  });
  app.use("/api/trpc", createExpressMiddleware({
    router: appRouter,
    createContext,
  }));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  return app;
}
