import { Router, Response } from "express";
import { Contrato } from "../models/Contrato.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

const parseNum = (val: any): number => {
  if (val === undefined || val === null || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

/**
 * Backfill idempotente: antes de esta feature, el "tipo de contrato" y la "plantilla" (contenido +
 * membrete) vivían juntos en `ContratoFrame`. Para toda Plantilla que todavía no tenga `contratoId`,
 * se busca o crea un Contrato con su mismo nombre/jornadas/multiplicador/tiempo indeterminado y se
 * vincula. Se corre solo (no hace falta un script manual): al no haber pendientes, es un no-op rápido.
 */
async function ensureContratosBackfilled(): Promise<void> {
  const sinContrato = await ContratoFrame.find({ contratoId: { $exists: false } });
  if (sinContrato.length === 0) return;

  for (const plantilla of sinContrato) {
    const nombre = String(plantilla.name || plantilla.data?.nombre || "").trim();
    if (!nombre) continue;

    let contrato = await Contrato.findOne({ name: nombre });
    if (!contrato) {
      contrato = await Contrato.create({
        name: nombre,
        data: {
          cantidadJornadas: plantilla.data?.cantidadJornadas || 0,
          multiplicadorDiario: plantilla.data?.multiplicadorDiario || 0,
          esTiempoIndeterminado: !!plantilla.data?.esTiempoIndeterminado,
        },
        isActive: plantilla.isActive !== false,
      });
    }

    plantilla.contratoId = contrato._id as any;
    await plantilla.save();
  }
}

// GET / - listar
router.get("/", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureContratosBackfilled();
    const items = await Contrato.find().sort({ name: 1 }).lean();
    res.json(items);
  } catch (error) {
    console.error("Get contratos error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / - crear
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { nombre, cantidadJornadas, multiplicadorDiario, esTiempoIndeterminado, isActive } = req.body;
    const name = String(nombre ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }

    const existente = await Contrato.findOne({ name }).lean();
    if (existente) {
      res.status(409).json({ error: "Ya existe un contrato con ese nombre" });
      return;
    }

    const created = await Contrato.create({
      name,
      data: {
        cantidadJornadas: parseNum(cantidadJornadas),
        multiplicadorDiario: parseNum(multiplicadorDiario),
        esTiempoIndeterminado: esTiempoIndeterminado === "true" || esTiempoIndeterminado === true,
      },
      isActive: isActive === undefined ? true : isActive === "true" || isActive === true,
    });
    res.status(201).json(created);
  } catch (error) {
    console.error("Create contrato error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /:id - actualizar
router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { nombre, cantidadJornadas, multiplicadorDiario, esTiempoIndeterminado, isActive } = req.body;
    const item = await Contrato.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }

    if (nombre !== undefined) {
      const name = String(nombre).trim();
      if (!name) {
        res.status(400).json({ error: "El nombre es obligatorio" });
        return;
      }
      const duplicado = await Contrato.findOne({ name, _id: { $ne: item._id } }).lean();
      if (duplicado) {
        res.status(409).json({ error: "Ya existe un contrato con ese nombre" });
        return;
      }
      item.name = name;
    }
    if (cantidadJornadas !== undefined) item.data.cantidadJornadas = parseNum(cantidadJornadas);
    if (multiplicadorDiario !== undefined) item.data.multiplicadorDiario = parseNum(multiplicadorDiario);
    if (esTiempoIndeterminado !== undefined) item.data.esTiempoIndeterminado = esTiempoIndeterminado === "true" || esTiempoIndeterminado === true;
    if (isActive !== undefined) item.isActive = isActive === "true" || isActive === true;

    item.markModified("data");
    await item.save();

    // Las Plantillas de este Contrato mantienen sus campos sincronizados (son las que consume
    // el resto de la app: PDF, wizard, filtros).
    await ContratoFrame.updateMany(
      { contratoId: item._id },
      {
        $set: {
          "data.cantidadJornadas": item.data.cantidadJornadas,
          "data.multiplicadorDiario": item.data.multiplicadorDiario,
          "data.esTiempoIndeterminado": item.data.esTiempoIndeterminado,
        },
      },
    );

    res.json(item);
  } catch (error) {
    console.error("Update contrato error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:id - eliminar
router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const enUso = await ContratoFrame.countDocuments({ contratoId: req.params.id });
    if (enUso > 0) {
      res.status(409).json({ error: `No se puede eliminar: ${enUso} plantilla${enUso === 1 ? "" : "s"} lo tiene${enUso === 1 ? "" : "n"} asignado. Reasigná o eliminá esa${enUso === 1 ? "" : "s"} plantilla${enUso === 1 ? "" : "s"} primero.` });
      return;
    }

    const item = await Contrato.findByIdAndDelete(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }
    res.json({ message: "Contrato eliminado correctamente" });
  } catch (error) {
    console.error("Delete contrato error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as contratoRoutes, ensureContratosBackfilled };
