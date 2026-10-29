import { createApp } from "../server/_core/app.ts";
import type { Request, Response } from "express";

let app: ReturnType<typeof createApp> | undefined;

export default function handler(req: Request, res: Response) {
  try {
    app ??= createApp();
    return app(req, res);
  } catch (error) {
    console.error("[Vercel] Failed to initialize Node API:", error);
    return res.status(500).json({ error: "Node API initialization failed" });
  }
}
