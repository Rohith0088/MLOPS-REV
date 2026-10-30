import type { Request, Response } from "express";
import { createApp } from "../server/_core/app.ts";

const app = createApp();

export default function handler(req: Request, res: Response) {
  return app(req, res);
}
