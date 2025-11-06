import { Router, Request, Response } from "express";
import { env } from "../config/env.js";
import { getGitInfo } from "../utils/git.js";

const router = Router();

/**
 * Devuelve información no sensible de entorno para el frontend.
 * Ejemplo: GET /api/v1/env
 */
router.get("/env", async (req: Request, res: Response) => {
  const gitInfo = await getGitInfo();

  res.json({
    nodeEnv: env.NODE_ENV,
    mongoDbName: env.MONGO_DB_NAME || "Unknown DB",
    apiUrl: env.API_URL || null,
    git: gitInfo,
  });
});

export const envRoutes = router;
