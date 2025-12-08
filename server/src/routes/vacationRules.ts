import express from "express";
import { VacationRule } from "../models/VacationRule.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/vacationsrules - Get all vacation rules
router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const rules = await VacationRule.find({ tenantId }).sort({ createdAt: -1 });
    res.json(rules);
  } catch (error: any) {
    console.error("Error fetching vacation rules:", error);
    res.status(500).json({ error: "Error al obtener las reglas de vacaciones" });
  }
});

// GET /api/vacationsrules/:id - Get a single vacation rule
router.get("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const rule = await VacationRule.findOne({ _id: id, tenantId });

    if (!rule) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json(rule);
  } catch (error: any) {
    console.error("Error fetching vacation rule:", error);
    res.status(500).json({ error: "Error al obtener la regla de vacaciones" });
  }
});

// POST /api/vacationsrules - Create a new vacation rule
router.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const ruleData = {
      ...req.body,
      tenantId,
      requiereFirma: true, // Always true as per requirements
    };

    const newRule = new VacationRule(ruleData);
    await newRule.save();

    res.status(201).json(newRule);
  } catch (error: any) {
    console.error("Error creating vacation rule:", error);
    res.status(500).json({ error: "Error al crear la regla de vacaciones" });
  }
});

// PATCH /api/vacationsrules/:id - Update a vacation rule
router.patch("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const updatedRule = await VacationRule.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: { ...req.body, requiereFirma: true } }, // Ensure requiereFirma is always true
      { new: true, runValidators: true }
    );

    if (!updatedRule) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json(updatedRule);
  } catch (error: any) {
    console.error("Error updating vacation rule:", error);
    res.status(500).json({ error: "Error al actualizar la regla de vacaciones" });
  }
});

// DELETE /api/vacationsrules/:id - Delete a vacation rule (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const deletedRule = await VacationRule.findOneAndUpdate({ _id: id, tenantId }, { $set: { active: false } }, { new: true });

    if (!deletedRule) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json({ message: "Regla eliminada correctamente" });
  } catch (error: any) {
    console.error("Error deleting vacation rule:", error);
    res.status(500).json({ error: "Error al eliminar la regla de vacaciones" });
  }
});

export const vacationRulesRoutes = router;
