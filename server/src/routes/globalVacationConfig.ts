import express from "express";
import { GlobalVacationConfig } from "../models/VacationGlobalConfig.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const config = await GlobalVacationConfig.findOne({ tenantId });

    if (!config) {
      const newConfig = await GlobalVacationConfig.create({
        tenantId,
        diasAnuales: 18,
        permiteArrastre: false,
        permiteFraccionadas: true,
        requiereFirma: true,
        antiguedadTramos: [],
      });
      return res.json(newConfig);
    }

    res.json(config);
  } catch (error: any) {
    console.error("Error fetching global vacation config:", error);
    res.status(500).json({ error: "Error al obtener la configuración global de vacaciones" });
  }
});

router.put("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;

    console.log("Updating global vacation config with data:", JSON.stringify(req.body, null, 2));

    let config = await GlobalVacationConfig.findOne({ tenantId });

    if (!config) {
      config = await GlobalVacationConfig.create({
        ...req.body,
        tenantId,
      });
    } else {
      config = await GlobalVacationConfig.findOneAndUpdate(
        { tenantId },
        { $set: req.body },
        { new: true, runValidators: true }
      );
    }

    res.json(config);
  } catch (error: any) {
    console.error("Error updating global vacation config:", error);
    console.error("Request body:", JSON.stringify(req.body, null, 2));

    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors || {}).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      console.error("Validation errors:", validationErrors);
      return res.status(400).json({
        error: "Error de validación",
        details: validationErrors,
        message: error.message
      });
    }

    res.status(500).json({
      error: "Error al actualizar la configuración global de vacaciones",
      message: error.message
    });
  }
});

export const globalVacationConfigRoutes = router;

