import express from "express";
import { VacationConfig } from "../models/VacationConfig.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken } from "../middleware/auth.js";
import { errorDeVentana, normalizarVentana } from "../compartido/ventanaGoce.js";
import { normalizarConfigCampania } from "../compartido/vacaciones/campania.js";
import { cargarCatalogoDeTipos, reglasParaGuardar, tiposParaVacaciones } from "../services/vacaciones/tiposDeContrato.js";
import { Types } from "mongoose";
import { llevarVentanaGlobalALosPlanes } from "../services/vacaciones/ventanaYPlanes.js";
const router = express.Router();
router.use(authenticateToken);
/**
 * GET /vacation-config/tipos-contrato — LOS TIPOS DE CONTRATO PARA VACACIONES (23/11/2026): uno por tipo del catálogo
 * (`contratos`), los activos y los inactivos que todavía tienen gente vigente, con sus códigos de ARCA, cuántas
 * personas lo tienen vigente y si tiene vacaciones según «Visibilidad por tipo de Contrato». Lo usan esa pantalla y
 * la campaña de goce. `contracts-available` (abajo) queda para Órdenes.
 */
router.get("/tipos-contrato", async (req, res) => {
    try {
        const config = await VacationConfig.findOne({ tenantId: req.tenantId }).select("contractRules").lean();
        res.json(await tiposParaVacaciones(String(req.tenantId), config?.contractRules));
    }
    catch (error) {
        console.error("Error fetching tipos de contrato para vacaciones:", error);
        res.status(500).json({ error: "Error al obtener los tipos de contrato" });
    }
});
router.get("/contracts-available", async (req, res) => {
    try {
        // Aggregate all unique contract types from UserProject
        const contracts = await UserProject.aggregate([
            { $unwind: "$contracts" },
            // Sin las lápidas de contratos anulados (etapa 2b): no tienen tipo y armaban un grupo vacío.
            { $match: { "contracts.estadoContrato": { $ne: "ANULADO" } } },
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
        // La ventana anual de goce se valida acá: el `$set` de abajo guardaría tal cual un día que no existe (30/2).
        if (req.body?.ventanaGoce !== undefined) {
            const problema = errorDeVentana(req.body.ventanaGoce);
            if (problema)
                return res.status(400).json({ error: problema });
            const { enabled, inicio, fin } = req.body.ventanaGoce;
            req.body.ventanaGoce = { enabled, inicio, fin };
        }
        // La campaña de goce: números en rango (lo que venga mal cae al de por defecto) y nada más que esos cuatro campos.
        if (req.body?.campania !== undefined)
            req.body.campania = normalizarConfigCampania(req.body.campania);
        // «Visibilidad por tipo de Contrato»: una regla por tipo del catálogo (las viejas por número de FRAME se traducen).
        if (req.body?.contractRules !== undefined)
            req.body.contractRules = reglasParaGuardar(req.body.contractRules, await cargarCatalogoDeTipos());
        // La antigüedad por empresa: modo conocido, empresas válidas y sin repetir, el flag como booleano.
        if (req.body?.computoAntiguedad !== undefined) {
            const c = req.body.computoAntiguedad || {};
            if (c.modo !== undefined && c.modo !== "empresaVigente" && c.modo !== "precedenciaManual")
                return res.status(400).json({ error: "Modo de antigüedad desconocido: tiene que ser «empresaVigente» o «precedenciaManual»." });
            if (c.precedencia !== undefined && !Array.isArray(c.precedencia))
                return res.status(400).json({ error: "La precedencia de empresas tiene que ser una lista." });
            const ids = [...new Set((c.precedencia || []).map(String))];
            if (ids.some((id) => !Types.ObjectId.isValid(id)))
                return res.status(400).json({ error: "La precedencia tiene una empresa que no existe." });
            req.body.computoAntiguedad = { modo: c.modo || "empresaVigente", precedencia: ids.map((id) => new Types.ObjectId(id)), sumarEntreEmpresas: c.sumarEntreEmpresas === true };
        }
        let config = await VacationConfig.findOne({ tenantId });
        const ventanaAntes = normalizarVentana(config?.ventanaGoce);
        if (!config) {
            config = await VacationConfig.create({
                ...req.body,
                tenantId,
            });
        }
        else {
            config = await VacationConfig.findOneAndUpdate({ tenantId }, { $set: req.body }, { new: true, runValidators: true });
        }
        // La ventana global cambió: se mueve la temporada de los planes en borrador de los proyectos que la usan.
        const ventana = normalizarVentana(config?.ventanaGoce);
        if (req.body?.ventanaGoce !== undefined && (ventana.inicio !== ventanaAntes.inicio || ventana.fin !== ventanaAntes.fin) && Types.ObjectId.isValid(String(tenantId))) {
            await llevarVentanaGlobalALosPlanes(new Types.ObjectId(String(tenantId)), ventana).catch((e) => console.error("[PLAN-VACACIONES] No se pudo mover la temporada de los planes:", e?.message || e));
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
