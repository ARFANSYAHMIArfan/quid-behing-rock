import type { Request, Response } from "express";
import { createApp } from "../server";
const app = createApp(true);
export default async function handler(req: Request, res: Response) {
  (await app)(req, res);
}
