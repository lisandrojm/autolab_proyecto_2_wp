import { Router } from "express";
import { Valoracion } from "../models/Valoracion.js";
import { Project } from "../models/Project.js";
import { RoleFrame } from "../models/RoleFrame.js";
import UserProject from "../models/UserProject.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { sugerirPorBruto } from "../services/valorarFunciones.js";
/**
 * ABM de valoraciones comerciales (Plata, Oro…).
 *
 * Es un catálogo simple con dos reglas propias que el factory no puede conocer —los rangos no se
 * pueden pisar y la default tiene que ser una sola—, así que van en middlewares montados ANTES de
 * delegar. Se resuelve así y no con un CRUD a mano para no duplicar listado, alta, edición, borrado
 * y el manejo de campos extra, que es exactamente lo que el factory ya sabe hacer.
 */
const router = Router();
/**
 * Un extremo del rango de margen, normalizado. `null` es ABIERTO: sin mínimo o sin techo.
 *
 * El vacío del formulario llega como `""` y `Number("")` es 0, que es un margen VÁLIDO —trabajar sin
 * ganancia—: «desde 0» y «sin mínimo» no son lo mismo, y con márgenes negativos (un proyecto a
 * pérdida) la diferencia se nota.
 */
const aMonto = (v) => {
    if (v === undefined || v === null || String(v).trim() === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
/** Cómo se lee un rango de margen en un mensaje de error. */
const textoRango = (desde, hasta) => {
    if (desde === null && hasta === null)
        return "sin rango";
    if (desde === null)
        return `hasta ${hasta}%`;
    if (hasta === null)
        return `desde ${desde}%`;
    return `${desde}% – ${hasta}%`;
};
/**
 * Dos rangos SEMIABIERTOS `[desde, hasta)` se solapan si cada uno empieza antes de que el otro
 * termine. Con el tope abierto, «hasta 20» y «desde 20» NO se pisan: un margen de 20 % cae en el
 * segundo, que es lo que evita tener que decidir de qué lado queda el número redondo.
 */
const seSolapan = (a, b) => {
    const aDesde = a.desde ?? Number.NEGATIVE_INFINITY;
    const aHasta = a.hasta ?? Number.POSITIVE_INFINITY;
    const bDesde = b.desde ?? Number.NEGATIVE_INFINITY;
    const bHasta = b.hasta ?? Number.POSITIVE_INFINITY;
    return aDesde < bHasta && bDesde < aHasta;
};
/**
 * Rechaza un rango que pise el de otra valoración ACTIVA del mismo tenant.
 *
 * Sólo contra las activas: una valoración apagada sigue resolviendo los proyectos viejos pero no se
 * ofrece en altas nuevas, así que su rango no compite por ningún margen.
 *
 * Se valida sobre el estado FINAL del documento y no sobre el body: en una edición el cliente puede
 * mandar sólo `margenHasta`, y comparar ese dato suelto contra el resto daría una respuesta sobre un
 * rango que no existe.
 */
const validarRango = async (req, res, next) => {
    try {
        const body = req.body;
        const id = req.params.id;
        const actual = id ? await Valoracion.findOne({ _id: id, tenantId: req.tenantObjectId }).lean() : null;
        if (id && !actual)
            return next(); // que conteste el 404 el factory, no este middleware
        // `undefined` = no vino en el body: se conserva lo que ya tenía.
        const desde = body.margenDesde === undefined ? (actual?.margenDesde ?? null) : aMonto(body.margenDesde);
        const hasta = body.margenHasta === undefined ? (actual?.margenHasta ?? null) : aMonto(body.margenHasta);
        const activo = body.activo === undefined ? (actual?.activo ?? true) : body.activo === true || body.activo === "true";
        if (desde !== null && hasta !== null && hasta <= desde) {
            return res.status(400).json({ error: `El rango está al revés: "hasta" (${hasta}%) tiene que ser mayor que "desde" (${desde}%).` });
        }
        // Una valoración apagada, o sin rango, no compite con nadie.
        if (!activo || (desde === null && hasta === null))
            return next();
        const otras = await Valoracion.find({ tenantId: req.tenantObjectId, activo: { $ne: false }, ...(id ? { _id: { $ne: id } } : {}) })
            .select("name margenDesde margenHasta")
            .lean();
        const choca = otras.find((o) => seSolapan({ desde, hasta }, { desde: o.margenDesde ?? null, hasta: o.margenHasta ?? null }));
        if (choca) {
            return res.status(400).json({
                error: `El rango ${textoRango(desde, hasta)} se pisa con «${choca.name}» (${textoRango(choca.margenDesde ?? null, choca.margenHasta ?? null)}). Dos valoraciones no pueden cubrir el mismo margen: no habría forma de saber cuál corresponde.`,
            });
        }
        return next();
    }
    catch (error) {
        console.error("Validar rango de valoración error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * `esDefault` es exclusiva: al marcar una, se apagan las demás.
 *
 * `resolverValoracion` devuelve «la» default, en singular — es a donde cae un proyecto cuyo
 * margen no entra en ningún rango, o que todavía no tiene margen cargado. Con dos marcadas, cuál
 * gana lo decidiría el orden en que Mongo devuelve los documentos.
 *
 * Corre DESPUÉS del handler del factory (el guardado ya ocurrió): apagar las otras antes dejaría al
 * tenant sin ninguna default si el guardado después falla.
 */
const exclusividadDeDefault = async (req, res, next) => {
    const body = req.body;
    if (!(body.esDefault === true || body.esDefault === "true"))
        return next();
    /*
      SE EXCLUYE EL DOCUMENTO RECIÉN GUARDADO, y para eso hay que conocer su id.
  
      En un PUT alcanzaría con `req.params.id`, pero en un POST ese id no existe todavía cuando este
      middleware corre: el `updateMany` apagaba TODAS las que tuvieran `esDefault: true` incluida la
      que se acababa de crear, así que dar de alta la valoración por defecto la dejaba en «No». Se veía
      en la tabla y no fallaba nada.
  
      Se intercepta `res.json` para quedarse con el documento que el factory contesta, que es la única
      forma de tener el id sin duplicar el guardado acá.
    */
    const jsonOriginal = res.json.bind(res);
    let guardadoId = req.params.id;
    res.json = ((cuerpo) => {
        const id = cuerpo?._id;
        if (id)
            guardadoId = String(id);
        return jsonOriginal(cuerpo);
    });
    res.on("finish", () => {
        if (res.statusCode >= 400)
            return;
        Valoracion.updateMany({ tenantId: req.tenantObjectId, esDefault: true, ...(guardadoId ? { _id: { $ne: guardadoId } } : {}) }, { $set: { esDefault: false } }).catch((e) => console.error("No se pudieron apagar las otras valoraciones por defecto:", e));
    });
    return next();
};
/**
 * NO SE BORRA UNA VALORACIÓN EN USO: 409 con el detalle de quién la usa.
 *
 * Mismo criterio que `esElegible` en categorías: lo que se dejó de usar se APAGA (`activo: false`),
 * no se borra. Una valoración apagada deja de ofrecerse en las altas nuevas y sigue resolviendo su
 * nombre en todo lo viejo — proyectos valorados, categorías de funciones, contratos firmados.
 *
 * Borrarla dejaría punteros a la nada exactamente como pasó con los tipos de contrato «Eventual…»:
 * los estados quedaron con ocho referencias muertas que había que restaurar desde un backup, y en
 * ese momento nadie se enteró porque la operación contestó 200.
 *
 * Se cuentan las TRES puntas donde vive un puntero: el proyecto, la asociación función ↔ categoría y
 * el contrato ya firmado. Un borrado que sólo mirara una de las tres seguiría rompiendo las otras dos.
 */
const bloquearBorradoEnUso = async (req, res, next) => {
    try {
        const { id } = req.params;
        const existe = await Valoracion.findOne({ _id: id, tenantId: req.tenantObjectId }).select("name").lean();
        // No existe: que el 404 lo conteste el factory, que es el que sabe redactarlo.
        if (!existe)
            return next();
        const [proyectos, roles, contratos] = await Promise.all([
            Project.find({ tenantId: req.tenantObjectId, valoracionId: id }).select("name").limit(50).lean(),
            RoleFrame.find({ "data.categoriasSat.valoracionId": id }).select("name").limit(50).lean(),
            UserProject.countDocuments({ "contracts.valoracion_id": id }),
        ]);
        if (proyectos.length === 0 && roles.length === 0 && contratos === 0)
            return next();
        const partes = [];
        if (proyectos.length)
            partes.push(`${proyectos.length} proyecto(s)`);
        if (roles.length)
            partes.push(`${roles.length} función(es) de Roles Empresa`);
        if (contratos)
            partes.push(`${contratos} contrato(s) ya firmados`);
        return res.status(409).json({
            error: `«${existe.name}» está en uso por ${partes.join(", ")}. No se puede borrar: lo que la tiene puesta quedaría apuntando a la nada. Apagala (Estado → Inactiva): deja de ofrecerse en las altas nuevas y sigue resolviendo lo viejo.`,
            proyectos: proyectos.map((p) => p.name),
            funciones: roles.map((r) => r.name),
            contratos,
        });
    }
    catch (error) {
        console.error("Verificar uso de valoración error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
/*
  IMPORT DE EXCEL Y CARGA MASIVA: CERRADOS PARA ESTE CATÁLOGO.

  No es una restricción por prolijidad. `extraNumberFields` no participa del import —está documentado
  en el factory—, así que una planilla de valoraciones entraría SIN los rangos: se crearían «Plata» y
  «Oro» sin `margenDesde`/`margenHasta` y sin pasar por `validarRango`, que es justo la regla que hace
  que esto funcione. Un catálogo de tres o cuatro filas se carga a mano.
*/
router.post("/import", requireTenant, authenticateToken, (_req, res) => {
    res.status(405).json({ error: "Las valoraciones se cargan a mano: son pocas y el Excel no trae los rangos de margen." });
});
router.post("/bulk", requireTenant, authenticateToken, (_req, res) => {
    res.status(405).json({ error: "Las valoraciones se cargan a mano: son pocas y la carga masiva no valida los rangos." });
});
/*
  ── LAS CATEGORÍAS SE VALORAN POR BRUTO ──

  El proyecto toma su valoración del margen; la categoría, de su sueldo (la regla, con sus tests, en
  `utils/valoracionPorBruto.ts`). `sugerir` la expone para el formulario de Roles Empresa, que la
  pide con lo que tiene tildado y la pone sola en lo que nadie eligió a mano. Se pide por CONJUNTO
  porque «la más barata» es relativa a las otras.

  Aplicarla a TODAS las funciones de una vez —cuando se agrega un nivel, por ejemplo— es el script
  `valorarFuncionesPorBruto` (con modo en seco). Hubo un botón para eso en la pantalla y se sacó: en
  el día a día no tenía nada que hacer, porque cada función ya se valora sola al editarla.
*/
router.post("/por-bruto/sugerir", requireTenant, authenticateToken, async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.categorias) ? req.body.categorias.map(String) : [];
        res.json({ sugerencias: await sugerirPorBruto(req.tenantObjectId, ids.slice(0, 500)) });
    }
    catch (error) {
        console.error("Sugerir valoración por bruto error:", error);
        res.status(500).json({ error: "No se pudo calcular la valoración por bruto." });
    }
});
/*
  Van montadas ANTES del factory y llaman a `next()`: el guardado sigue siendo el del factory, acá
  sólo se agregan las dos reglas que este catálogo tiene y los demás no.
*/
router.post("/", requireTenant, authenticateToken, validarRango, exclusividadDeDefault);
router.put("/:id", requireTenant, authenticateToken, validarRango, exclusividadDeDefault);
router.delete("/:id", requireTenant, authenticateToken, bloquearBorradoEnUso);
router.use(createSimpleCatalogRouter(Valoracion, {
    entityLabel: "Valoración",
    sheetName: "Valoraciones",
    templateFilename: "plantilla_valoraciones.xlsx",
    sampleNames: ["Plata", "Oro"],
    tenantScoped: true,
    extraNumberFields: [{ key: "orden" }, { key: "margenDesde" }, { key: "margenHasta" }],
    extraStringFields: [{ key: "color" }],
    extraBooleanFields: [{ key: "activo" }, { key: "esDefault" }],
    filtrosPermitidos: ["activo"],
}));
export { router as valoracionRoutes };
