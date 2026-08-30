import { Router, Response } from "express";
import { z } from "zod";
import { FuenteParitaria } from "../models/FuenteParitaria.js";
import { PublicacionParitaria } from "../models/PublicacionParitaria.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { revisarFuente, revisarTodas, fuenteConProblema } from "../services/paritariasVigilanciaService.js";

/**
 * ABM de fuentes de paritarias y lectura de lo detectado.
 *
 * Esta entrega SOLO DETECTA: no hay ningún endpoint que abra un PDF, lea importes o toque una escala.
 * Si alguna vez aparece uno acá, se fue de alcance.
 */
const router = Router();

const fuenteSchema = z.object({
  entidad: z.string().min(1, "La entidad es obligatoria"),
  nombre: z.string().min(1, "El nombre es obligatorio"),
  url: z.string().url("La URL no es válida"),
  convenios: z.array(z.string()).default([]),
  patronIncluir: z.string().min(1, "Sin patrón de inclusión entraría cualquier PDF de la página"),
  // Se pide vacío explícito y no opcional: quien da de alta una fuente tiene que haber MIRADO qué
  // más cuelga esa página. El texto del convenio colectivo conviviendo con los acuerdos es la norma.
  patronExcluir: z.string().default(""),
  activa: z.boolean().default(true),
});

/** Valida que los patrones compilen ANTES de guardar: uno roto deja la fuente sin filtrar y en silencio. */
const patronInvalido = (p: string): string | null => {
  if (!p.trim()) return null;
  try {
    new RegExp(p, "i");
    return null;
  } catch (e: any) {
    return `«${p}» no es una expresión regular válida: ${e?.message || e}`;
  }
};

router.get("/fuentes", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const fuentes = await FuenteParitaria.find().sort({ entidad: 1, nombre: 1 }).lean();
    // El conteo de publicaciones va acá y no en una llamada aparte: es lo que dice si la fuente
    // realmente está encontrando cosas, y sin él la pantalla mostraría una fila que no se sabe si sirve.
    const conteos = await PublicacionParitaria.aggregate([{ $group: { _id: { fuente: "$fuente", vista: "$vista" }, n: { $sum: 1 } } }]);
    const total = new Map<string, number>();
    const sinVer = new Map<string, number>();
    for (const c of conteos as any[]) {
      const k = String(c._id.fuente);
      total.set(k, (total.get(k) || 0) + c.n);
      if (!c._id.vista) sinVer.set(k, (sinVer.get(k) || 0) + c.n);
    }
    res.json((fuentes as any[]).map((f) => ({ ...f, publicaciones: total.get(String(f._id)) || 0, sinVer: sinVer.get(String(f._id)) || 0, conProblema: fuenteConProblema(f) })));
  } catch (error) {
    console.error("List fuentes paritaria error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.post("/fuentes", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = fuenteSchema.parse(req.body);
    for (const p of [data.patronIncluir, data.patronExcluir]) {
      const err = patronInvalido(p);
      if (err) return res.status(400).json({ error: err });
    }
    const creada = await FuenteParitaria.create(data);
    res.status(201).json(creada);
  } catch (error: any) {
    if (error?.name === "ZodError") return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
    console.error("Create fuente paritaria error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.put("/fuentes/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = fuenteSchema.partial().parse(req.body);
    for (const p of [data.patronIncluir, data.patronExcluir]) {
      if (p === undefined) continue;
      const err = patronInvalido(p);
      if (err) return res.status(400).json({ error: err });
    }
    const actualizada = await FuenteParitaria.findByIdAndUpdate(req.params.id, { $set: data }, { new: true });
    if (!actualizada) return res.status(404).json({ error: "Fuente no encontrada" });
    res.json(actualizada);
  } catch (error: any) {
    if (error?.name === "ZodError") return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
    console.error("Update fuente paritaria error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * Borra la fuente Y sus publicaciones.
 *
 * Las publicaciones no tienen sentido sin su fuente —no se sabría de dónde salieron ni con qué
 * patrón— y dejarlas huérfanas es exactamente el tipo de puntero a la nada que costó los 163
 * contratos del `legacyId 43`.
 */
router.delete("/fuentes/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await FuenteParitaria.deleteOne({ _id: req.params.id });
    if (r.deletedCount === 0) return res.status(404).json({ error: "Fuente no encontrada" });
    const { deletedCount } = await PublicacionParitaria.deleteMany({ fuente: req.params.id });
    res.json({ message: `Fuente eliminada junto con ${deletedCount} publicación(es).` });
  } catch (error) {
    console.error("Delete fuente paritaria error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * «Revisar ahora»: EL MISMO código que la rutina diaria, con otro disparador.
 *
 * No hay dos caminos a propósito. Un botón que hace «casi lo mismo» que el cron es la forma más
 * segura de que uno de los dos quede atrás y nadie se entere hasta que importe.
 */
router.post("/fuentes/:id/revisar", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await revisarFuente(req.params.id));
  } catch (error: any) {
    console.error("Revisar fuente error:", error);
    res.status(500).json({ error: error?.message || "No se pudo revisar la fuente" });
  }
});

router.post("/revisar", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await revisarTodas());
  } catch (error: any) {
    console.error("Revisar todas error:", error);
    res.status(500).json({ error: "No se pudieron revisar las fuentes" });
  }
});

/** Las publicaciones detectadas, con su fuente. `?sinVer=1` para el banner. */
router.get("/publicaciones", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filtro: Record<string, unknown> = { estado: "detectada" };
    if (String(req.query.sinVer || "") === "1") filtro.vista = false;
    const pubs = await PublicacionParitaria.find(filtro).sort({ detectadaEl: -1 }).limit(200).populate("fuente", "entidad nombre convenios").lean();
    res.json(pubs);
  } catch (error) {
    console.error("List publicaciones error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/** Marcar como vista. Es lo que saca la publicación del banner sin procesarla. */
router.put("/publicaciones/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patch: Record<string, unknown> = {};
    if (req.body.vista !== undefined) patch.vista = req.body.vista !== false;
    if (req.body.estado === "descartada" || req.body.estado === "detectada") patch.estado = req.body.estado;
    const p = await PublicacionParitaria.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
    if (!p) return res.status(404).json({ error: "Publicación no encontrada" });
    res.json(p);
  } catch (error) {
    console.error("Update publicacion error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * Lo que alimenta el banner y la columna de `/convenios`.
 *
 * Dos cosas DISTINTAS y por eso van separadas: novedades sin ver (ámbar, hay algo para leer) y
 * fuentes con problema (rojo, la vigilancia está ciega). Mezclarlas haría que una fuente caída se
 * viera como «no hay novedades», que es precisamente lo contrario de lo que pasa.
 */
router.get("/estado", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [fuentes, sinVer] = await Promise.all([
      FuenteParitaria.find().lean(),
      PublicacionParitaria.find({ vista: false, estado: "detectada" }).sort({ detectadaEl: -1 }).limit(50).populate("fuente", "entidad nombre convenios").lean(),
    ]);

    // Por convenio: qué fuente lo vigila. Es lo que dibuja la columna, y sale de acá para que la
    // pantalla no tenga que recorrer las fuentes por su cuenta y llegar a otra conclusión.
    const porConvenio: Record<string, Array<{ _id: string; entidad: string; nombre: string; ultimaRevision: Date | null; conProblema: boolean }>> = {};
    for (const f of fuentes as any[]) {
      for (const c of f.convenios || []) {
        (porConvenio[c] ??= []).push({ _id: String(f._id), entidad: f.entidad, nombre: f.nombre, ultimaRevision: f.ultimaRevision ?? null, conProblema: fuenteConProblema(f) });
      }
    }

    res.json({
      porConvenio,
      sinVer: (sinVer as any[]).map((p) => ({ _id: String(p._id), url: p.url, textoEnlace: p.textoEnlace, detectadaEl: p.detectadaEl, fuente: p.fuente })),
      conProblema: (fuentes as any[])
        .filter((f) => f.activa && fuenteConProblema(f))
        .map((f) => ({ _id: String(f._id), entidad: f.entidad, nombre: f.nombre, url: f.url, ultimoResultado: f.ultimoResultado, ultimoError: f.ultimoError, ultimaRevision: f.ultimaRevision ?? null })),
      /** Fuentes activas que nunca se revisaron: no están rotas, pero todavía no vigilan nada. */
      sinRevisar: (fuentes as any[]).filter((f) => f.activa && !f.ultimaRevision).length,
    });
  } catch (error) {
    console.error("Estado paritarias error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export { router as paritariasRoutes };
