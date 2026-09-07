import { Router } from "express";
import { z } from "zod";
import { Company } from "../models/Company.js";
import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { Convenio } from "../models/Convenio.js";
import { authenticateToken } from "../middleware/auth.js";
import { grupoDeTipoServicio, GRUPO_CONTINUOS, GRUPO_DISCONTINUOS } from "../utils/grupoTipoServicio.js";
// ABM de Empresas / Productoras (datos para armar contratos).
// Catálogo global (sin tenantId), igual que el resto de config: solo authenticateToken.
const router = Router();
const companySchema = z.object({
    razonSocial: z.string().min(1, "La razón social es obligatoria"),
    cuit: z.string().optional().default(""),
    domicilioCalle: z.string().optional().default(""),
    domicilioNumero: z.string().optional().default(""),
    domicilioPisoDepto: z.string().optional().default(""),
    localidad: z.string().optional().default(""),
    provincia: z.string().optional().default(""),
    codigoPostal: z.string().optional().default(""),
    firmanteNombre: z.string().optional().default(""),
    firmanteDni: z.string().optional().default(""),
    firmanteCargo: z.string().optional().default(""),
    representanteLegalNombre: z.string().optional().default(""),
    representanteLegalEmail: z.string().optional().default(""),
    logoUrl: z.string().optional().default(""),
    signatureUrl: z.string().optional().default(""),
    /** Obra social por defecto de esta empresa. `null` = usar la global del catálogo. */
    obraSocialDefaultId: z.number().nullable().optional(),
    /**
     * Nombre viejo de `obraSocialDefaultId`. Se sigue aceptando para no romper a un cliente sin
     * actualizar; `normalizar()` lo traduce y nunca se guarda con este nombre.
     */
    obraSocialId: z.number().nullable().optional(),
    /** Ids del catálogo de Obras Sociales registradas ante ARCA para este CUIT. Reemplaza la lista. */
    obrasSocialesIds: z.array(z.string()).optional(),
    /** Ids del catálogo de Convenios. Se manda la lista completa: reemplaza la anterior. */
    convenioIds: z.array(z.string()).optional(),
    /** Ids del catálogo de Sucursales de ARCA. Se manda la lista completa: reemplaza la anterior. */
    sucursalIds: z.array(z.string()).optional(),
    /**
     * Qué actividades declaró ESTA empleadora en cada domicilio. Reemplaza la lista.
     *
     * Una fila con `actividades: []` significa «ninguna declarada acá», y es distinto de no tener
     * fila —que significa «no se recortó, valen todas las del domicilio»—. Por eso la lista se manda
     * entera y no se hace merge: el merge no puede expresar «lo dejé vacío a propósito».
     */
    sucursalActividades: z.array(z.object({ sucursalId: z.string(), actividades: z.array(z.object({ codigo: z.string(), descripcion: z.string().optional() })) })).optional(),
    /** Elección habitual de esta empleadora dentro del nomenclador, para no repetirla en cada alta. */
    defaultsArca: z
        .object({
        grupoTipoServicio: z.string().optional().default(""),
        tipoServicio: z.string().optional().default(""),
        modalidadContratacion: z.string().optional().default(""),
        modalidadLiquidacion: z.string().optional().default(""),
        /** `_id` del domicilio habitual. `null` lo quita. */
        sucursalId: z.string().nullable().optional(),
        /** `_id` del convenio habitual. `null` lo quita. */
        convenioId: z.string().nullable().optional(),
        /** RNOS de la obra social que se ofrece primero. Preselección: no es la de los excluidos. */
        obraSocial: z.string().optional().default(""),
        /** Código de actividad que se ofrece primero al cargar actividades en un domicilio. */
        actividad: z.string().optional().default(""),
    })
        .optional(),
});
/**
 * El grupo y el tipo de servicio tienen que ser coherentes, y el que manda es el CÓDIGO.
 *
 * El grupo es derivable del tipo (`grupoDeTipoServicio`), así que lo que llega del cliente es a lo
 * sumo lo que el cliente creía. Guardar la combinación tal cual permitiría dejar, por ejemplo, grupo
 * CONTINUOS con un tipo 514 —que es discontinuo—, y ese default después precarga un alta que ARCA
 * rechaza. El error aparecería lejos de acá y sin rastro de dónde se originó.
 *
 * Se RECHAZA en vez de corregir en silencio: si el cliente mandó una combinación imposible, algo de
 * su lado está mal y taparlo lo deja mal para siempre. Lo que sí se completa es el grupo cuando no
 * vino: ahí no hay nada que contradecir, solo un dato derivado que falta.
 *
 * Devuelve el mensaje del rechazo, o `null` si está todo bien.
 */
const revisarDefaultsArca = (data) => {
    const defaults = data.defaultsArca;
    if (!defaults)
        return null;
    /*
      El domicilio por defecto tiene que ser UNO DE LOS DE ESTA EMPLEADORA.
  
      El código de domicilio es por CUIT: el mismo domicilio declarado por dos empresas son dos
      registros distintos. Un default apuntando a uno que esta empleadora no tiene declarado precarga un
      alta que ARCA rechaza, y el error aparece lejos de acá.
  
      Solo se puede validar cuando en el mismo request vienen los `sucursalIds`; si no, se acepta y el
      chequeo queda en la UI, que es la que muestra la lista de la que se elige.
    */
    if (defaults.sucursalId && Array.isArray(data.sucursalIds) && !data.sucursalIds.map(String).includes(String(defaults.sucursalId))) {
        return "Ese domicilio no está asignado a esta empleadora: elegí uno de los que tiene declarados.";
    }
    // Mismo criterio para el convenio: ARCA solo acepta categorías de los convenios que ESTE CUIT
    // registró, así que sugerir uno que no registró es sugerir un alta rechazada.
    if (defaults.convenioId && Array.isArray(data.convenioIds) && !data.convenioIds.map(String).includes(String(defaults.convenioId))) {
        return "Ese convenio no está registrado por esta empleadora: elegí uno de los que tiene.";
    }
    const tipo = String(defaults.tipoServicio || "").trim();
    const grupo = String(defaults.grupoTipoServicio || "").trim();
    if (!tipo) {
        // Sin tipo no hay de qué derivar. El grupo solo se acepta si es uno de los dos que existen: es un
        // filtro, y un valor inventado dejaría el combo del alta vacío sin explicar por qué.
        if (grupo && grupo !== GRUPO_CONTINUOS && grupo !== GRUPO_DISCONTINUOS) {
            return `«${grupo}» no es un Grupo de Tipo de Servicio: los únicos son ${GRUPO_CONTINUOS} (CONTINUOS) y ${GRUPO_DISCONTINUOS} (DISCONTINUOS).`;
        }
        return null;
    }
    const derivado = grupoDeTipoServicio(tipo);
    if (grupo && grupo !== derivado) {
        return `El tipo de servicio ${tipo} es del grupo ${derivado} y se está guardando con el grupo ${grupo}. Elegí un tipo de ese grupo, o cambiá el grupo.`;
    }
    // El grupo se guarda DERIVADO siempre, incluso cuando vino y coincide: así lo que queda en la base
    // es lo que dice el código y no lo que mandó el cliente.
    defaults.grupoTipoServicio = derivado;
    return null;
};
/**
 * Traduce el nombre viejo del campo y deja UNA sola forma en la base.
 *
 * Sin esto convivirían `obraSocialId` y `obraSocialDefaultId` en documentos distintos, y resolver el
 * RNOS por defecto dependería de qué cliente escribió último — el tipo de bug que ya costó una
 * migración con las categorías.
 */
const normalizar = (data) => {
    const { obraSocialId, ...resto } = data;
    if (obraSocialId !== undefined && resto.obraSocialDefaultId === undefined)
        resto.obraSocialDefaultId = obraSocialId;
    return resto;
};
// GET /companies
router.get("/", authenticateToken, async (_req, res) => {
    try {
        const items = await Company.find().sort({ razonSocial: 1 }).lean();
        // Se sirven los dos nombres mientras haya consumidores del viejo. El que manda es el nuevo: si
        // el documento ya migró, `obraSocialId` es un espejo de solo lectura.
        res.json(items.map((c) => ({ ...c, obraSocialId: c.obraSocialDefaultId ?? c.obraSocialId ?? null, obraSocialDefaultId: c.obraSocialDefaultId ?? c.obraSocialId ?? null })));
    }
    catch (error) {
        console.error("List companies error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /companies
router.post("/", authenticateToken, async (req, res) => {
    try {
        const data = normalizar(companySchema.parse(req.body));
        const problema = revisarDefaultsArca(data);
        if (problema)
            return res.status(422).json({ error: problema });
        const created = await Company.create(data);
        res.status(201).json(created);
    }
    catch (error) {
        if (error?.name === "ZodError") {
            return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
        }
        console.error("Create company error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /companies/:id
router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const data = normalizar(companySchema.partial().parse(req.body));
        const problema = revisarDefaultsArca(data);
        if (problema)
            return res.status(422).json({ error: problema });
        /*
          `defaultsArca` SE PARCHEA CAMPO POR CAMPO, no se reemplaza.
    
          `$set: { defaultsArca: {...} }` pisa el subdocumento COMPLETO, y el objeto que llega nunca está
          completo: cada pantalla del entorno empresa manda lo suyo —la ★ de Tipos de Servicio manda su
          código, la de Domicilios manda `sucursalId`— y el schema rellena con `""` / `null` todo lo que
          no vino. Es decir que guardar en una pantalla borraba en silencio lo marcado en las otras.
    
          Se mira `req.body` y no `data` porque zod ya completó los ausentes con su `.default("")`: en
          `data` no se distingue «lo mandé vacío para borrarlo» de «no lo mandé». Es el mismo criterio
          que usa `routes/arcaDefaults.ts` para el documento global.
        */
        const { defaultsArca, ...resto } = data;
        const set = { ...resto };
        const enviados = (req.body ?? {}).defaultsArca;
        if (defaultsArca && enviados && typeof enviados === "object") {
            for (const clave of Object.keys(defaultsArca)) {
                if (Object.prototype.hasOwnProperty.call(enviados, clave))
                    set[`defaultsArca.${clave}`] = defaultsArca[clave];
            }
            /*
              El GRUPO es la excepción: no lo manda el cliente, lo DERIVA `revisarDefaultsArca` del código
              del tipo. Es una clave que cambió sin haber venido en el body, así que el recorrido de arriba
              la dejaría afuera, y el grupo guardado terminaría contradiciendo al tipo guardado — que es
              exactamente lo que esa función existe para impedir.
            */
            if (Object.prototype.hasOwnProperty.call(enviados, "tipoServicio"))
                set["defaultsArca.grupoTipoServicio"] = defaultsArca.grupoTipoServicio;
        }
        // `$unset` del nombre viejo en cada guardado: así el documento queda con una sola forma en cuanto
        // se lo toca, sin depender de que la migración haya corrido.
        const updated = await Company.findByIdAndUpdate(req.params.id, { $set: set, $unset: { obraSocialId: "" } }, { new: true });
        if (!updated)
            return res.status(404).json({ error: "Empresa no encontrada" });
        res.json(updated);
    }
    catch (error) {
        if (error?.name === "ZodError") {
            return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
        }
        console.error("Update company error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET /companies/:id/obras-sociales-en-uso
 *
 * Por cada obra social, a cuántos contratos de ESTA empleadora alcanza. Es lo que hay que saber antes
 * de sacar una de su lista de registradas: quitarla deja esas altas con un RNOS que ARCA va a
 * rechazar, y hoy eso pasaba en silencio.
 *
 * Cuenta las dos formas en que un contrato termina usándola:
 *  - `contratos`: la tiene FIJADA en el contrato (constatada o manual).
 *  - `convenios`: la hereda de un CCT que esta empleadora registró — sea la sindical del convenio o
 *    el convenio que ella registró. Acá se devuelven los códigos de esos CCT, porque el número de
 *    contratos afectados depende de qué categoría tenga cada uno y eso se resuelve en el cliente.
 */
router.get("/:id/obras-sociales-en-uso", authenticateToken, async (req, res) => {
    try {
        const empresa = await Company.findById(req.params.id).select("convenioIds").lean();
        if (!empresa)
            return res.status(404).json({ error: "Empresa no encontrada" });
        const filas = await UserProject.aggregate([
            { $unwind: "$contracts" },
            { $match: { "contracts.empresaContratoId": new Types.ObjectId(req.params.id), "contracts.obraSocialId": { $ne: null } } },
            { $group: { _id: "$contracts.obraSocialId", total: { $sum: 1 } } },
        ]);
        const contratos = {};
        for (const f of filas)
            if (f._id != null)
                contratos[String(f._id)] = f.total;
        // Convenios registrados por la empleadora y la obra social sindical de cada uno.
        const convenios = await Convenio.find({ _id: { $in: empresa.convenioIds || [] } })
            .select("externalId obraSocialDefaultId")
            .lean();
        const porConvenio = {};
        for (const cv of convenios) {
            const osId = cv.obraSocialDefaultId;
            if (osId == null)
                continue;
            const k = String(osId);
            porConvenio[k] = [...(porConvenio[k] || []), String(cv.externalId || "")];
        }
        res.json({ contratos, convenios: porConvenio });
    }
    catch (error) {
        console.error("Obras sociales en uso error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /companies/:id
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const deleted = await Company.findByIdAndDelete(req.params.id);
        if (!deleted)
            return res.status(404).json({ error: "Empresa no encontrada" });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Delete company error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as companyRoutes };
