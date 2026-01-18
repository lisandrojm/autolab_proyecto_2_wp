import express from "express";
import { RequestActivityConfig } from "../models/RequestActivityConfig.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const config = await RequestActivityConfig.findOne({ tenantId });

    if (!config) {
      const newConfig = await RequestActivityConfig.create({
        tenantId,
        enableFastEntry: true, // Default to true (current behavior)
      });
      return res.json(newConfig);
    }

    res.json(config);
  } catch (error: any) {
    console.error("Error fetching activity log config:", error);
    res.status(500).json({ error: "Error al obtener la configuración de reportes" });
  }
});

router.put("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { enableFastEntry } = req.body;

    let config = await RequestActivityConfig.findOne({ tenantId });

    if (!config) {
      config = await RequestActivityConfig.create({
        tenantId,
        enableFastEntry,
      });
    } else {
      config.enableFastEntry = enableFastEntry;
      await config.save();
    }

    res.json(config);
  } catch (error: any) {
    console.error("Error updating activity log config:", error);
    res.status(500).json({ error: "Error al actualizar la configuración" });
  }
});

export const RequestActivityConfigRoutes = router;
