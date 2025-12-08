import express from "express";
import { Vacation } from "../models/Vacation.js";
import { authenticateToken } from "../middleware/auth.js";
import { z } from "zod";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// ============================================================
// RULES ENDPOINTS
// ============================================================

// GET /api/vacations/rules - Get all rules
router.get("/rules", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const rules = await Vacation.find({
      tenantId,
      type: "rule",
      active: true,
    }).sort({ createdAt: -1 });

    res.json(rules);
  } catch (error: any) {
    console.error("Error fetching vacation rules:", error);
    res.status(500).json({ error: "Error al obtener las reglas de vacaciones" });
  }
});

// POST /api/vacations/rules - Create a new rule
router.post("/rules", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: "Se requiere el campo 'data'" });
    }

    const newRule = new Vacation({
      type: "rule",
      tenantId,
      active: true,
      data,
    });

    await newRule.save();
    res.status(201).json(newRule);
  } catch (error: any) {
    console.error("Error creating vacation rule:", error);
    res.status(500).json({ error: "Error al crear la regla de vacaciones" });
  }
});

// PATCH /api/vacations/rules/:id - Update a rule
router.patch("/rules/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { data, active } = req.body;

    const updateFields: any = {};
    if (data !== undefined) updateFields.data = data;
    if (active !== undefined) updateFields.active = active;

    const updatedRule = await Vacation.findOneAndUpdate({ _id: id, tenantId, type: "rule" }, { $set: updateFields }, { new: true });

    if (!updatedRule) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json(updatedRule);
  } catch (error: any) {
    console.error("Error updating vacation rule:", error);
    res.status(500).json({ error: "Error al actualizar la regla de vacaciones" });
  }
});

// DELETE /api/vacations/rules/:id - Delete a rule (soft delete)
router.delete("/rules/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const deletedRule = await Vacation.findOneAndUpdate({ _id: id, tenantId, type: "rule" }, { $set: { active: false } }, { new: true });

    if (!deletedRule) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json({ message: "Regla eliminada correctamente" });
  } catch (error: any) {
    console.error("Error deleting vacation rule:", error);
    res.status(500).json({ error: "Error al eliminar la regla de vacaciones" });
  }
});

// ============================================================
// RECORDS ENDPOINTS
// ============================================================

// GET /api/vacations/records - Get all records
router.get("/records", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const records = await Vacation.find({
      tenantId,
      type: "record",
      active: true,
    }).sort({ createdAt: -1 });

    res.json(records);
  } catch (error: any) {
    console.error("Error fetching vacation records:", error);
    res.status(500).json({ error: "Error al obtener los registros de vacaciones" });
  }
});

// GET /api/vacations/records/:id - Get a single record
router.get("/records/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const record = await Vacation.findOne({
      _id: id,
      tenantId,
      type: "record",
      active: true,
    });

    if (!record) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }

    res.json(record);
  } catch (error: any) {
    console.error("Error fetching vacation record:", error);
    res.status(500).json({ error: "Error al obtener el registro de vacaciones" });
  }
});

// POST /api/vacations/records - Create a new record
router.post("/records", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: "Se requiere el campo 'data'" });
    }

    const newRecord = new Vacation({
      type: "record",
      tenantId,
      active: true,
      data,
    });

    await newRecord.save();
    res.status(201).json(newRecord);
  } catch (error: any) {
    console.error("Error creating vacation record:", error);
    res.status(500).json({ error: "Error al crear el registro de vacaciones" });
  }
});

// PATCH /api/vacations/records/:id - Update a record
router.patch("/records/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { data, active } = req.body;

    const updateFields: any = {};
    if (data !== undefined) updateFields.data = data;
    if (active !== undefined) updateFields.active = active;

    const updatedRecord = await Vacation.findOneAndUpdate({ _id: id, tenantId, type: "record" }, { $set: updateFields }, { new: true });

    if (!updatedRecord) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }

    res.json(updatedRecord);
  } catch (error: any) {
    console.error("Error updating vacation record:", error);
    res.status(500).json({ error: "Error al actualizar el registro de vacaciones" });
  }
});

// DELETE /api/vacations/records/:id - Delete a record (soft delete)
router.delete("/records/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const deletedRecord = await Vacation.findOneAndUpdate({ _id: id, tenantId, type: "record" }, { $set: { active: false } }, { new: true });

    if (!deletedRecord) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }

    res.json({ message: "Registro eliminado correctamente" });
  } catch (error: any) {
    console.error("Error deleting vacation record:", error);
    res.status(500).json({ error: "Error al eliminar el registro de vacaciones" });
  }
});

// ============================================================
// HISTORY ENDPOINTS
// ============================================================

// GET /api/vacations/history - Get all history entries
router.get("/history", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const history = await Vacation.find({
      tenantId,
      type: "history",
      active: true,
    }).sort({ "data.timestamp": -1 });

    res.json(history);
  } catch (error: any) {
    console.error("Error fetching vacation history:", error);
    res.status(500).json({ error: "Error al obtener el historial de vacaciones" });
  }
});

// POST /api/vacations/history - Create a new history entry
router.post("/history", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: "Se requiere el campo 'data'" });
    }

    const newHistory = new Vacation({
      type: "history",
      tenantId,
      active: true,
      data,
    });

    await newHistory.save();
    res.status(201).json(newHistory);
  } catch (error: any) {
    console.error("Error creating vacation history:", error);
    res.status(500).json({ error: "Error al crear el historial de vacaciones" });
  }
});

export const vacationRoutes = router;
