import { Router, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { FormaPago } from "../models/FormaPago.js";
import { Contrato } from "../models/Contrato.js";
import UserProject from "../models/UserProject.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { codigoDesdeNombre, conflictoDeUnicidad, errorDeCampos, motivoParaNoBorrar, normalizarCodigo, ordenarFormas, type FormaPagoLike } from "../compartido/formasPago.js";

/**
 * ABM de formas de pago (Configuración → Formas de pago).
 *
 * Mismo factory que Entidades Financieras, con las reglas propias en middlewares montados ANTES de
 * delegar (como Valoraciones): largo y forma de nombre/código/descripción, código autogenerado desde el
 * nombre si viene vacío, y nombre/código únicos (409). El borrado lo frena el gancho `antesDeBorrar`
 * cuando hay contratos o tipos de contrato que la usan.
 */
const router = Router();

/** Contratos de miembros y tipos de contrato que usan la forma: lo que impide borrarla. */
export async function usoDeFormaPago(id: Types.ObjectId | string): Promise<{ contratos: number; tipos: number }> {
  const _id = new Types.ObjectId(String(id));
  const [porContratos, tipos] = await Promise.all([
    UserProject.aggregate([{ $match: { "contracts.forma_pago_id": _id } }, { $unwind: "$contracts" }, { $match: { "contracts.forma_pago_id": _id } }, { $count: "n" }]),
    Contrato.countDocuments({ $or: [{ "data.formasPagoIds": _id }, { "data.formaPagoDefaultId": _id }] }),
  ]);
  return { contratos: Number(porContratos[0]?.n) || 0, tipos };
}

// GET /formas-de-pago?activo=true|false — en el orden de los selectores (`orden`, después nombre).
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filtro: Record<string, unknown> = {};
    // Ausente cuenta como activa (igual que en el resto de los catálogos con `activo`).
    if (req.query.activo === "true") filtro.activo = { $ne: false };
    if (req.query.activo === "false") filtro.activo = false;
    const items = (await FormaPago.find(filtro).lean()) as unknown as FormaPagoLike[];
    res.json(ordenarFormas(items));
  } catch (error) {
    console.error("Get formas de pago error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/import", authenticateToken, (_req, res) => {
  res.status(405).json({ error: "Las formas de pago se cargan a mano: son pocas y el Excel no trae sus reglas." });
});
router.post("/bulk", authenticateToken, (_req, res) => {
  res.status(405).json({ error: "Las formas de pago se cargan a mano: son pocas y la carga masiva no valida sus reglas." });
});

/**
 * Normaliza y valida el body de un alta o edición. En el alta, un código vacío se arma con el nombre.
 * Una edición que no trae nombre ni código (el interruptor de activo, el orden) no pasa por la unicidad.
 */
async function validarFormaPago(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const body = (req.body ||= {});
    const esAlta = req.method === "POST";
    if (body.nombre !== undefined) body.nombre = String(body.nombre ?? "").trim();
    if (esAlta && !String(body.externalId ?? "").trim()) body.externalId = codigoDesdeNombre(body.nombre || "");
    if (body.externalId !== undefined) body.externalId = normalizarCodigo(String(body.externalId ?? ""));
    if (body.descripcion !== undefined) body.descripcion = String(body.descripcion ?? "").trim();

    const error = errorDeCampos({ nombre: esAlta ? body.nombre ?? "" : body.nombre, codigo: body.externalId, descripcion: body.descripcion });
    if (error) return void res.status(400).json({ error });

    if (body.nombre !== undefined || body.externalId !== undefined) {
      const existentes = (await FormaPago.find().select("_id name externalId").lean()) as unknown as FormaPagoLike[];
      const conflicto = conflictoDeUnicidad(existentes, { nombre: body.nombre, codigo: body.externalId }, esAlta ? null : req.params.id);
      if (conflicto) return void res.status(409).json({ error: conflicto });
    }

    // Una nueva entra al final del orden.
    if (esAlta && (body.orden === undefined || body.orden === "")) {
      const ultima: any = await FormaPago.findOne().sort({ orden: -1 }).select("orden").lean();
      body.orden = (Number(ultima?.orden) || 0) + 1;
    }
    next();
  } catch (e) {
    console.error("Validar forma de pago error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
router.post("/", authenticateToken, validarFormaPago);
router.put("/:id", authenticateToken, validarFormaPago);

router.use(
  createSimpleCatalogRouter(FormaPago, {
    entityLabel: "Forma de pago",
    sheetName: "Formas de Pago",
    templateFilename: "plantilla_formas_de_pago.xlsx",
    extraStringFields: [{ key: "descripcion" }],
    extraNumberFields: [{ key: "orden" }],
    // Desactivar no rompe nada: los contratos que ya la tienen conservan la referencia.
    extraBooleanFields: [{ key: "activo" }, { key: "requiereDatosBancarios" }, { key: "requiereComprobante" }],
    antesDeBorrar: async (item) => motivoParaNoBorrar(item.name, await usoDeFormaPago(item._id)),
  }),
);

export { router as formaPagoRoutes };
