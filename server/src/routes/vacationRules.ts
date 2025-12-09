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

    console.log("Creating vacation rule with data:", JSON.stringify(ruleData, null, 2));

    const newRule = new VacationRule(ruleData);
    await newRule.save();

    res.status(201).json(newRule);
  } catch (error: any) {
    console.error("Error creating vacation rule:", error);
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
      error: "Error al crear la regla de vacaciones",
      message: error.message
    });
  }
});

// PATCH /api/vacationsrules/:id - Update a vacation rule
router.patch("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    console.log(`Updating vacation rule ${id} with data:`, JSON.stringify(req.body, null, 2));

    const updatedRule = await VacationRule.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: { ...req.body, requiereFirma: true } },
      { new: true, runValidators: true }
    );

    if (!updatedRule) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json(updatedRule);
  } catch (error: any) {
    console.error("Error updating vacation rule:", error);
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
      error: "Error al actualizar la regla de vacaciones",
      message: error.message
    });
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
