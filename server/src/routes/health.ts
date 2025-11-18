import { Router } from "express";
export const healthRoutes = Router().get("/", (_req, res) => res.json({ ok: true, ts: Date.now() }));
