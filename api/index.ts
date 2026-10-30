import { createApp } from "../server/_core/app";
import type { Request, Response } from "express";

const app = createApp();

export default function handler(req: Request, res: Response): void {
  app(req, res);
}
