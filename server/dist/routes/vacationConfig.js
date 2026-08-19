import express from "express";
import { VacationConfig } from "../models/VacationConfig.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken } from "../middleware/auth.js";
const router = express.Router();
router.use(authenticateToken);
router.get("/contracts-available", async (req, res) => {
    try {
        // Aggregate all unique contract types from UserProject
        const contracts = await UserProject.aggregate([
            { $unwind: "$contracts" },
            {
                $group: {
                    _id: "$contracts.tipo_contrato_id",
                    name: { $first: "$contracts.nombre_contrato" },
                },
            },
            {
                $project: {
                    _id: 0,
                    id: "$_id",
                    name: "$name",
                },
            },
            { $sort: { name: 1 } },
        ]);
        res.json(contracts);
    }
    catch (error) {
        console.error("Error fetching available contracts:", error);
        res.status(500).json({ error: "Error al obtener contratos disponibles" });
    }
});
router.get("/", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const config = await VacationConfig.findOne({ tenantId });
        if (!config) {
            const newConfig = await VacationConfig.create({
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
    }
    catch (error) {
        console.error("Error fetching vacation config:", error);
        res.status(500).json({ error: "Error al obtener la configuración de vacaciones" });
    }
});
router.put("/", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        console.log("Updating vacation config with data:", JSON.stringify(req.body, null, 2));
        let config = await VacationConfig.findOne({ tenantId });
        if (!config) {
            config = await VacationConfig.create({
                ...req.body,
                tenantId,
            });
        }
        else {
            config = await VacationConfig.findOneAndUpdate({ tenantId }, { $set: req.body }, { new: true, runValidators: true });
        }
        res.json(config);
    }
    catch (error) {
        console.error("Error updating vacation config:", error);
        console.error("Request body:", JSON.stringify(req.body, null, 2));
        if (error.name === "ValidationError") {
            const validationErrors = Object.keys(error.errors || {}).map((key) => ({
                field: key,
                message: error.errors[key].message,
            }));
            console.error("Validation errors:", validationErrors);
            return res.status(400).json({
                error: "Error de validación",
                details: validationErrors,
                message: error.message,
            });
        }
        res.status(500).json({
            error: "Error al actualizar la configuración de vacaciones",
            message: error.message,
        });
    }
});
export const vacationConfigRoutes = router;
