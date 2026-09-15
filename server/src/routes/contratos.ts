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
 * Busca el Contrato por nombre o lo crea, de forma atómica (findOneAndUpdate + upsert): dos
 * requests concurrentes disparando el backfill al mismo tiempo NO deben poder crear dos Contrato
 * con el mismo nombre. El índice único en `name` es el respaldo final: si por lo que sea las dos
 * llegan a intentar el insert a la vez, MongoDB solo deja pasar una y la otra recibe E11000, que
 * se resuelve leyendo la que ganó.
 */
async function buscarOCrearContrato(nombre: string, plantilla: { data?: any; isActive?: boolean }) {
  try {
    return await Contrato.findOneAndUpdate(
      { name: nombre },
      {
        $setOnInsert: {
          name: nombre,
          data: {
            cantidadJornadas: plantilla.data?.cantidadJornadas || 0,
            multiplicadorDiario: plantilla.data?.multiplicadorDiario || 0,
            esTiempoIndeterminado: !!plantilla.data?.esTiempoIndeterminado,
            requiereFirma: true,
          },
          isActive: plantilla.isActive !== false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error: any) {
    if (error?.code === 11000) {
      const existente = await Contrato.findOne({ name: nombre });
      if (existente) return existente;
    }
    throw error;
  }
}

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

    const contrato = await buscarOCrearContrato(nombre, plantilla);
    if (!contrato) continue;

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

/*
  LÍMITES DE LA JORNADA DEL TIPO DE CONTRATO: horas por jornada y días por semana.

  Opcionales —vacío es «sin límite»—, y son la base para acotar la solicitud de contratación: un tipo
  «5x7» no debería poder pedirse con 6 días. Se validan acá para que no entre un 30 horas o un 9 días.
  Las horas admiten decimales (7,5); los días, no.
*/
const leerLimitesDeJornada = (horas: unknown, dias: unknown): { horasPorJornada: number | null; diasPorSemana: number | null; error?: string } => {
  const vacio = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
  const h = vacio(horas) ? null : Number(String(horas).replace(",", "."));
  const d = vacio(dias) ? null : Number(dias);
  if (h !== null && (!Number.isFinite(h) || h < 1 || h > 24)) return { horasPorJornada: null, diasPorSemana: null, error: "Las horas por jornada tienen que estar entre 1 y 24." };
  if (d !== null && (!Number.isInteger(d) || d < 1 || d > 7)) return { horasPorJornada: null, diasPorSemana: null, error: "Los días por semana tienen que ser un número entero entre 1 y 7." };
  return { horasPorJornada: h, diasPorSemana: d };
};

// POST / - crear
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { nombre, cantidadJornadas, multiplicadorDiario, horasPorJornada, diasPorSemana, esTiempoIndeterminado, requiereFirma, isActive, afipModalidadContrato, afipTipoServicio, afipActividad, afipModalidadLiquidacion, generaAlta } = req.body;
    const limites = leerLimitesDeJornada(horasPorJornada, diasPorSemana);
    if (limites.error) {
      res.status(400).json({ error: limites.error });
      return;
    }
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
        horasPorJornada: limites.horasPorJornada,
        diasPorSemana: limites.diasPorSemana,
        esTiempoIndeterminado: esTiempoIndeterminado === "true" || esTiempoIndeterminado === true,
        requiereFirma: requiereFirma === undefined ? true : requiereFirma === "true" || requiereFirma === true,
        afipModalidadContrato: afipModalidadContrato != null ? String(afipModalidadContrato).trim() : undefined,
        afipTipoServicio: afipTipoServicio != null ? String(afipTipoServicio).trim() : undefined,
        afipActividad: afipActividad != null ? String(afipActividad).trim() : undefined,
        afipModalidadLiquidacion: afipModalidadLiquidacion != null ? String(afipModalidadLiquidacion).trim() : undefined,
        generaAlta: generaAlta === undefined ? true : generaAlta === "true" || generaAlta === true,
      },
      isActive: isActive === undefined ? true : isActive === "true" || isActive === true,
    });
    res.status(201).json(created);
  } catch (error: any) {
    // Respaldo del chequeo de arriba: dos creaciones a la vez con el mismo nombre.
    if (error?.code === 11000) {
      res.status(409).json({ error: "Ya existe un contrato con ese nombre" });
      return;
    }
    console.error("Create contrato error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /:id - actualizar
router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { nombre, cantidadJornadas, multiplicadorDiario, horasPorJornada, diasPorSemana, esTiempoIndeterminado, requiereFirma, isActive, afipModalidadContrato, afipTipoServicio, afipActividad, afipModalidadLiquidacion, generaAlta } = req.body;
    const limites = leerLimitesDeJornada(horasPorJornada, diasPorSemana);
    if (limites.error) {
      res.status(400).json({ error: limites.error });
      return;
    }
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
    if (horasPorJornada !== undefined) item.data.horasPorJornada = limites.horasPorJornada;
    if (diasPorSemana !== undefined) item.data.diasPorSemana = limites.diasPorSemana;
    if (esTiempoIndeterminado !== undefined) item.data.esTiempoIndeterminado = esTiempoIndeterminado === "true" || esTiempoIndeterminado === true;
    if (requiereFirma !== undefined) item.data.requiereFirma = requiereFirma === "true" || requiereFirma === true;
    if (generaAlta !== undefined) item.data.generaAlta = generaAlta === "true" || generaAlta === true;
    if (afipModalidadContrato !== undefined) item.data.afipModalidadContrato = String(afipModalidadContrato).trim();
    if (afipTipoServicio !== undefined) item.data.afipTipoServicio = String(afipTipoServicio).trim();
    if (afipActividad !== undefined) item.data.afipActividad = String(afipActividad).trim();
    if (afipModalidadLiquidacion !== undefined) item.data.afipModalidadLiquidacion = String(afipModalidadLiquidacion).trim();
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
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ error: "Ya existe un contrato con ese nombre" });
      return;
    }
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
