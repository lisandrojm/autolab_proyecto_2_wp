import { Router } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { TIPOS_NOMENCLATURA, TipoNomenclatura, VARIABLES_POR_TIPO, PATRON_POR_DEFECTO, TIPOS_NOMBRE_SE_LEE_DE_VUELTA, ORDEN_GRUPOS, validarPatron, renderNomenclatura } from "../utils/nomenclatura.js";

const router = Router();
router.use(requireTenant, authenticateToken);

const esTipo = (t: string): t is TipoNomenclatura => (TIPOS_NOMENCLATURA as readonly string[]).includes(t);

/**
 * Datos de ejemplo para la previsualización del ABM.
 *
 * Se muestran mientras se edita, que es cuando alguien decide si el patrón le sirve. Un ABM que
 * guarda a ciegas obliga a generar un documento de verdad para ver el resultado — y si salió mal, ya
 * quedó un archivo con el nombre equivocado.
 */
const EJEMPLO: Record<string, string> = {
  apellido: "gonzalez-rotstein",
  nombres: "juan-manuel",
  proyecto: "426_LN+",
  proyectoId: "705",
  tipo: "Contrato",
  contrato: "Jornada-2030-SRL",
  docName: "Acuerdo-de-titularidad-de-la-obra",
  fechaAlta: "20260810",
  fechaBaja: "-",
  identidad: "CUIL-20331501027_DNI-33150102",
  email: "juanmanuel.gonzalezrotstein-gmail.com",
  extra: "Alta-Temprana-de-ARCA",
  numero: "1042",
  timestamp: "20260821-143012",
  anio: "2026",
  fecha: "20260821",
  empresa: "FZERO S.R.L",
  empresaCuit: "CUIT-30710295839",
};

/** Solo los valores de las variables que ESE tipo ofrece: mostrar el resto confunde más que ayuda. */
const valoresDe = (tipo: TipoNomenclatura): Record<string, string> =>
  Object.fromEntries(VARIABLES_POR_TIPO[tipo].map((v) => [v.variable, EJEMPLO[v.variable.replace(/[{}]/g, "")] ?? ""]));

/**
 * GET /nomenclaturas
 *
 * Todos los tipos con su patrón vigente, su default y sus variables. Una sola respuesta para pintar
 * el ABM entero: el catálogo de variables vive en el SERVER porque es el mismo que usa la validación,
 * y tenerlo duplicado en el front es cómo terminan discrepando (el ABM ofrece una variable que el
 * validador rechaza).
 */
router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const guardadas = await NomenclaturaArchivo.find({ tenantId: req.tenantObjectId }).lean();
    const porTipo = new Map(guardadas.map((n: any) => [n.tipo, n]));
    res.json(
      TIPOS_NOMENCLATURA.map((tipo) => {
        const fila: any = porTipo.get(tipo);
        const patron = fila?.patron || PATRON_POR_DEFECTO[tipo];
        return {
          tipo,
          patron,
          patronPorDefecto: PATRON_POR_DEFECTO[tipo],
          personalizado: !!fila,
          seLeeDeVuelta: TIPOS_NOMBRE_SE_LEE_DE_VUELTA.includes(tipo),
          variables: VARIABLES_POR_TIPO[tipo],
          grupos: ORDEN_GRUPOS.filter((g) => VARIABLES_POR_TIPO[tipo].some((v) => v.grupo === g)),
          ejemplo: renderNomenclatura(patron, { ...EJEMPLO, tipo }),
          valores: valoresDe(tipo),
          actualizadoEl: fila?.updatedAt || null,
        };
      }),
    );
  } catch (error) {
    console.error("Nomenclaturas get error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /nomenclaturas/previsualizar  { tipo, patron }
 *
 * Valida y renderiza sin guardar. Es lo que alimenta el preview en vivo del ABM, y usa las MISMAS
 * funciones que el guardado: un preview que recorra otro camino puede prometer un resultado distinto
 * del que después ocurre, y entonces no sirve para decidir.
 */
router.post("/previsualizar", async (req: AuthenticatedRequest & TenantRequest, res) => {
  const tipo = String(req.body?.tipo || "");
  if (!esTipo(tipo)) {
    res.status(400).json({ error: "Tipo de documento desconocido." });
    return;
  }
  const patron = String(req.body?.patron ?? "");
  res.json({ errores: validarPatron(tipo, patron), ejemplo: renderNomenclatura(patron, { ...EJEMPLO, tipo }), valores: valoresDe(tipo) });
});

/**
 * PUT /nomenclaturas/:tipo  { patron }
 *
 * NO guarda un patrón inválido. Es la validación que importa: la del front se puede saltear —otra
 * pestaña, un request a mano— y lo que está en juego es que los documentos firmados vuelvan a
 * encontrar a su persona. Ver `validarPatron`.
 */
router.put("/:tipo", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tipo = String(req.params.tipo || "");
    if (!esTipo(tipo)) {
      res.status(400).json({ error: "Tipo de documento desconocido." });
      return;
    }
    const patron = String(req.body?.patron ?? "").trim();
    const errores = validarPatron(tipo, patron);
    if (errores.length > 0) {
      res.status(400).json({ error: errores.map((e) => e.motivo).join(" "), errores });
      return;
    }
    const fila = await NomenclaturaArchivo.findOneAndUpdate(
      { tenantId: req.tenantObjectId, tipo },
      { $set: { patron, actualizadoPor: req.user?.userId || null } },
      { new: true, upsert: true },
    );
    res.json({ tipo, patron: fila.patron, personalizado: true, ejemplo: renderNomenclatura(fila.patron, { ...EJEMPLO, tipo }) });
  } catch (error) {
    console.error("Nomenclaturas put error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** DELETE /nomenclaturas/:tipo — vuelve al patrón por defecto (borra la personalización). */
router.delete("/:tipo", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tipo = String(req.params.tipo || "");
    if (!esTipo(tipo)) {
      res.status(400).json({ error: "Tipo de documento desconocido." });
      return;
    }
    await NomenclaturaArchivo.deleteOne({ tenantId: req.tenantObjectId, tipo });
    res.json({ tipo, patron: PATRON_POR_DEFECTO[tipo], personalizado: false, ejemplo: renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...EJEMPLO, tipo }) });
  } catch (error) {
    console.error("Nomenclaturas delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as nomenclaturaRoutes };
export default router;
