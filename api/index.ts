import type { Request, Response } from "express";
import type { Express } from "express";

let appPromise: Promise<Express> | undefined;

export default async function handler(req: Request, res: Response) {
  try {
    appPromise ??= import("../server/_core/app.ts").then(({ createApp }) => createApp());
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    console.error("[Vercel] Failed to initialize Node API:", error);
    return res.status(500).json({ error: "Node API initialization failed" });
  }
}
