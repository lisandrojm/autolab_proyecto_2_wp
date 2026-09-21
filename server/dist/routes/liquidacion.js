import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { MemosoftConcepto } from "../models/MemosoftConcepto.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { efectosVigentesEn, validarEfecto, reemplazarVigentes } from "../utils/liquidacion/efectos.js";
import { armarPadron } from "../services/liquidacion/padron.js";
import { correrLiquidacion } from "../services/liquidacion/corrida.js";
import { LiquidacionCorrida } from "../models/LiquidacionCorrida.js";
import { generarImportMemosoft, generarAnexoDeExcepciones, generarPlanillaDeControl } from "../services/liquidacion/exportar.js";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIQUIDACIÓN — fase 0: el padrón y el catálogo de conceptos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Todavía no calcula un solo concepto. Lo que contesta es la pregunta previa: para este período,
 * quién entra, con qué legajo, en qué empresa, en qué centro de costo y bajo qué régimen —y qué
 * queda sin resolver.
 *
 * Pide `admin_contracts:view` porque de eso habla: son contratos, empresas y sueldos. Que el
 * permiso sea el mismo que el de Gestión de Contratos no es pereza, es que quien puede ver un
 * contrato puede ver de qué empresa es.
 */
export const liquidacionRouter = Router();
liquidacionRouter.use(requireTenant, authenticateToken);
const filtrosSchema = z.object({
    periodo: z.string().regex(/^\d{4}-\d{2}$/, "El período va como AAAA-MM."),
    empresaId: z.string().optional(),
    ccCodigo: z.string().optional(),
    tipoContratoId: z.coerce.number().optional(),
    projectId: z.string().optional(),
    rolFrame: z.string().optional(),
    regimen: z.enum(["mensual", "jornalero"]).optional(),
});
/**
 * EL PADRÓN DEL PERÍODO.
 *
 * Devuelve las filas resueltas y, por separado, lo que no se pudo resolver. Las dos cosas siempre:
 * un padrón que sólo muestra lo que salió bien esconde exactamente lo que hay que ir a arreglar.
 */
liquidacionRouter.get("/padron", requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const q = filtrosSchema.parse(req.query);
        const filtros = {
            empresaId: q.empresaId,
            ccCodigo: q.ccCodigo,
            tipoContratoId: q.tipoContratoId,
            projectId: q.projectId,
            rolFrame: q.rolFrame,
            regimen: q.regimen,
        };
        const padron = await armarPadron(req.tenantObjectId, q.periodo, filtros);
        res.json(padron);
    }
    catch (error) {
        if (error instanceof z.ZodError)
            return res.status(400).json({ error: "Filtros inválidos", details: error.errors });
        console.error("Get padrón de liquidación error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * SÓLO LAS EXCEPCIONES: el validador de integridad del período.
 *
 * Es el mismo cálculo que el padrón, agrupado por tipo. Está separado porque es lo que se mira
 * antes de liquidar, y pedirlo no debería obligar a bajarse las 578 filas.
 */
liquidacionRouter.get("/validacion", requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const q = filtrosSchema.parse(req.query);
        const padron = await armarPadron(req.tenantObjectId, q.periodo, { ...q, regimen: q.regimen });
        const porTipo = new Map();
        padron.excepciones.forEach((e) => porTipo.set(e.tipo, [...(porTipo.get(e.tipo) || []), e]));
        res.json({
            periodo: padron.periodo,
            resumen: padron.resumen,
            // Ordenado por cantidad: lo que más duele, arriba.
            porTipo: [...porTipo.entries()].sort((a, b) => b[1].length - a[1].length).map(([tipo, casos]) => ({ tipo, cantidad: casos.length, casos })),
        });
    }
    catch (error) {
        if (error instanceof z.ZodError)
            return res.status(400).json({ error: "Filtros inválidos", details: error.errors });
        console.error("Get validación de liquidación error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/** El catálogo de conceptos de Memosoft, por empresa. */
liquidacionRouter.get("/conceptos", requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const filtro = { tenantId: req.tenantObjectId };
        if (Types.ObjectId.isValid(String(req.query.empresaId)))
            filtro.empresaId = new Types.ObjectId(String(req.query.empresaId));
        if (req.query.soloActivos === "1")
            filtro.activo = true;
        const conceptos = await MemosoftConcepto.find(filtro).sort({ empresaId: 1, codigo: 1 }).lean();
        res.json(conceptos);
    }
    catch (error) {
        console.error("Get conceptos Memosoft error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/* ═══════════════════════ El mapeo motivo → concepto ═══════════════════════ */
/**
 * Se configura desde Novedades y por eso pide su permiso, no el de contratos: quien define qué
 * significa "Enfermedad" es la misma persona que administra los motivos.
 */
const PERMISO_MAPEO = "config_activity_logs:view";
const efectoSchema = z.object({
    conceptoCodigo: z.string().min(1),
    param: z.enum(["par1", "par2"]),
    unidad: z.enum(["cantidad", "importe"]),
    fuente: z.enum(["jornadas", "horas50", "horas100", "fijo", "manual"]),
    valorFijo: z.number().optional(),
    aplicaA: z.enum(["titular", "reemplazante"]),
    soloRegimen: z.enum(["mensual", "jornalero"]).nullable().optional(),
    empresaId: z.string().nullable().optional(),
    nota: z.string().optional(),
});
/**
 * EL MAPEO COMPLETO: cada motivo con lo que genera.
 *
 * Con `?fecha=` devuelve lo que regía ese día; sin fecha, lo que rige hoy. El historial entero
 * viaja siempre en `historial`, porque es lo que hace auditable un cambio y no pesa nada.
 */
liquidacionRouter.get("/mapeo", requirePermission(PERMISO_MAPEO), async (req, res) => {
    try {
        const fecha = String(req.query.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
        const [motivos, conceptos] = await Promise.all([
            RequestConfig.find({ tenantId: req.tenantObjectId }).select("name order isActive requiresReplacement memosoftEffects memosoftNoLiquida").sort({ order: 1 }).lean(),
            MemosoftConcepto.find({ tenantId: req.tenantObjectId }).select("empresaId codigo descripcion usaPar1 usaPar2 unidadPar1 unidadPar2 activo").lean(),
        ]);
        res.json({
            fecha,
            motivos: motivos.map((m) => ({
                _id: String(m._id),
                name: m.name,
                isActive: m.isActive !== false,
                requiresReplacement: !!m.requiresReplacement,
                noLiquida: !!m.memosoftNoLiquida,
                vigentes: efectosVigentesEn(m.memosoftEffects || [], fecha),
                historial: m.memosoftEffects || [],
            })),
            conceptos,
        });
    }
    catch (error) {
        console.error("Get mapeo de liquidación error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * CAMBIAR LO QUE GENERA UN MOTIVO.
 *
 * Reemplaza el conjunto vigente: lo anterior queda cerrado el día previo, no se borra. Si algún
 * efecto no pasa la validación contra el catálogo NO SE GUARDA NINGUNO —guardar la mitad dejaría un
 * mapeo a medias que igual se liquida—, y la respuesta dice cuál y por qué.
 */
liquidacionRouter.put("/mapeo/:motivoId", requirePermission(PERMISO_MAPEO), async (req, res) => {
    try {
        const cuerpo = z.object({ efectos: z.array(efectoSchema), desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), noLiquida: z.boolean().optional() }).parse(req.body);
        const desde = cuerpo.desde || new Date().toISOString().slice(0, 10);
        const motivo = await RequestConfig.findOne({ _id: req.params.motivoId, tenantId: req.tenantObjectId });
        if (!motivo)
            return res.status(404).json({ error: "Motivo no encontrado" });
        const conceptos = await MemosoftConcepto.find({ tenantId: req.tenantObjectId }).lean();
        /* El catálogo es POR EMPRESA, así que un efecto sin empresa se valida contra cualquiera que tenga ese código. */
        const buscarConcepto = (codigo, empresaId) => conceptos.find((c) => c.codigo === codigo && (!empresaId || String(c.empresaId) === String(empresaId))) ||
            (empresaId ? undefined : conceptos.find((c) => c.codigo === codigo));
        const nuevos = cuerpo.efectos.map((e) => ({
            ...e,
            empresaId: e.empresaId ? new Types.ObjectId(e.empresaId) : null,
            soloRegimen: e.soloRegimen ?? null,
            vigenteDesde: desde,
            vigenteHasta: null,
        }));
        const problemas = nuevos
            .map((e) => ({ codigo: e.conceptoCodigo, problema: validarEfecto(e, buscarConcepto(e.conceptoCodigo, e.empresaId ? String(e.empresaId) : null)) }))
            .filter((x) => x.problema);
        if (problemas.length)
            return res.status(400).json({ error: "El mapeo no se puede guardar", problemas });
        motivo.memosoftEffects = reemplazarVigentes((motivo.memosoftEffects || []), nuevos, desde);
        // Sólo si vino: no mandarla no significa desmarcarla.
        if (cuerpo.noLiquida !== undefined)
            motivo.memosoftNoLiquida = cuerpo.noLiquida;
        await motivo.save();
        res.json({ _id: String(motivo._id), name: motivo.name, noLiquida: !!motivo.memosoftNoLiquida, vigentes: efectosVigentesEn(motivo.memosoftEffects, desde), historial: motivo.memosoftEffects });
    }
    catch (error) {
        if (error instanceof z.ZodError)
            return res.status(400).json({ error: "Datos inválidos", details: error.errors });
        console.error("Update mapeo de liquidación error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/* ═══════════════════════════ Las corridas ═══════════════════════════ */
/**
 * CALCULAR EL PERÍODO.
 *
 * Con `?previsualizar=1` calcula y devuelve sin guardar. Sin eso, queda una corrida nueva: nunca se
 * pisa la anterior, así que reliquidar no borra lo que se mandó el mes pasado.
 */
liquidacionRouter.post("/corridas", requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const q = filtrosSchema.extend({ versionMapeo: z.string().optional() }).parse({ ...req.body, ...req.query });
        const previsualizar = String(req.query.previsualizar || req.body?.previsualizar || "") === "1";
        const corrida = await correrLiquidacion(req.tenantObjectId, q.periodo, new Types.ObjectId(req.user.userId), {
            empresaId: q.empresaId,
            ccCodigo: q.ccCodigo,
            tipoContratoId: q.tipoContratoId,
            projectId: q.projectId,
            rolFrame: q.rolFrame,
            regimen: q.regimen,
            versionMapeo: q.versionMapeo,
            persistir: !previsualizar,
        });
        res.status(previsualizar ? 200 : 201).json(corrida);
    }
    catch (error) {
        if (error instanceof z.ZodError)
            return res.status(400).json({ error: "Filtros inválidos", details: error.errors });
        console.error("Correr liquidación error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/** El listado: sólo el resumen de cada corrida. Las líneas se piden una por una. */
liquidacionRouter.get("/corridas", requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const filtro = { tenantId: req.tenantObjectId };
        if (req.query.periodo)
            filtro.periodo = String(req.query.periodo);
        const corridas = await LiquidacionCorrida.find(filtro)
            .select("periodo versionMapeo filtros resumen hashLineas createdBy createdAt")
            .sort({ createdAt: -1 })
            .limit(Math.min(100, Number(req.query.limit) || 25))
            .populate("createdBy", "firstName lastName")
            .lean();
        res.json(corridas);
    }
    catch (error) {
        console.error("Listar corridas error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * UNA CORRIDA ENTERA, con sus líneas y sus excepciones.
 *
 * Con `?hoja=` devuelve sólo una hoja, que es como se la mira cuando hay que revisar un centro de
 * costo puntual sin bajarse las mil líneas del período.
 */
liquidacionRouter.get("/corridas/:id", requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const corrida = await LiquidacionCorrida.findOne({ _id: req.params.id, tenantId: req.tenantObjectId })
            .populate("createdBy", "firstName lastName")
            .lean();
        if (!corrida)
            return res.status(404).json({ error: "Corrida no encontrada" });
        if (req.query.hoja) {
            const hoja = String(req.query.hoja);
            corrida.lineas = (corrida.lineas || []).filter((l) => l.hoja === hoja);
        }
        res.json(corrida);
    }
    catch (error) {
        console.error("Ver corrida error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/* ═══════════════════════════ Los archivos ═══════════════════════════ */
/** Cabeceras de descarga de un XLSX, en un solo lugar para que los tres salgan iguales. */
const mandarXlsx = (res, nombre, contenido) => {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    // Sin esto el navegador no puede leer el nombre del archivo cuando la API está en otro dominio.
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send(contenido);
};
/**
 * EL IMPORT DE MEMOSOFT.
 *
 * NO SE DESCARGA SI HAY EXCEPCIONES BLOQUEANTES. Un archivo con gente sin legajo o sin empresa se
 * importa igual y liquida mal: es peor que no tenerlo, porque parece que está bien.
 *
 * `?forzar=1` lo baja de todos modos, para poder mirarlo mientras se resuelven las excepciones. La
 * respuesta dice cuántas hay para que quien lo fuerce sepa qué está bajando.
 */
liquidacionRouter.get("/corridas/:id/import", requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const corrida = await LiquidacionCorrida.findOne({ _id: req.params.id, tenantId: req.tenantObjectId }).lean();
        if (!corrida)
            return res.status(404).json({ error: "Corrida no encontrada" });
        const bloqueantes = (corrida.excepciones || []).filter((e) => e.bloqueante);
        if (bloqueantes.length > 0 && String(req.query.forzar || "") !== "1") {
            const porMotivo = new Map();
            bloqueantes.forEach((e) => porMotivo.set(e.motivo, (porMotivo.get(e.motivo) || 0) + 1));
            return res.status(409).json({
                error: `Hay ${bloqueantes.length} excepción(es) que impiden generar el import.`,
                ayuda: "Revisalas en el anexo. Se puede descargar igual para mirarlo, pero ese archivo liquida mal.",
                porMotivo: [...porMotivo.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad })),
            });
        }
        mandarXlsx(res, `memosoft-${corrida.periodo}.xlsx`, await generarImportMemosoft(corrida));
    }
    catch (error) {
        console.error("Generar import Memosoft error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/** El anexo de excepciones. Siempre se puede bajar: es la lista de lo que hay que arreglar. */
liquidacionRouter.get("/corridas/:id/anexo", requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const corrida = await LiquidacionCorrida.findOne({ _id: req.params.id, tenantId: req.tenantObjectId }).lean();
        if (!corrida)
            return res.status(404).json({ error: "Corrida no encontrada" });
        mandarXlsx(res, `excepciones-${corrida.periodo}.xlsx`, await generarAnexoDeExcepciones(corrida));
    }
    catch (error) {
        console.error("Generar anexo error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * LA PLANILLA DE CONTROL, un renglón por día × persona.
 *
 * Se calcula en el momento a partir de los partes y NO se guarda: son unas 2.000 filas por mes y
 * sólo hacen falta cuando alguien baja el archivo. Es un reporte de los registros, no de la corrida.
 */
liquidacionRouter.get("/planilla", requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const q = filtrosSchema.parse(req.query);
        const corrida = await correrLiquidacion(req.tenantObjectId, q.periodo, new Types.ObjectId(req.user.userId), {
            empresaId: q.empresaId,
            ccCodigo: q.ccCodigo,
            tipoContratoId: q.tipoContratoId,
            projectId: q.projectId,
            rolFrame: q.rolFrame,
            regimen: q.regimen,
            persistir: false,
            detalle: true,
        });
        mandarXlsx(res, `novedades-${q.periodo}.xlsx`, await generarPlanillaDeControl(corrida.detalle || [], q.periodo));
    }
    catch (error) {
        if (error instanceof z.ZodError)
            return res.status(400).json({ error: "Filtros inválidos", details: error.errors });
        console.error("Generar planilla de control error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/* ═══════════════════════ ABM del catálogo de conceptos ═══════════════════════ */
const conceptoSchema = z.object({
    empresaId: z.string(),
    codigo: z.string().min(1).max(8),
    descripcion: z.string().min(1),
    usaPar1: z.boolean().optional(),
    usaPar2: z.boolean().optional(),
    unidadPar1: z.enum(["cantidad", "importe"]).nullable().optional(),
    unidadPar2: z.enum(["cantidad", "importe"]).nullable().optional(),
    activo: z.boolean().optional(),
});
/**
 * El código se guarda con CUATRO DÍGITOS y ceros a la izquierda.
 *
 * Quien lo carga escribe "17" y quiere decir "0017". Normalizarlo acá y no confiar en cómo lo
 * tipearon evita tener el mismo concepto dos veces con dos escrituras distintas.
 */
const normalizarCodigo = (codigo) => {
    const limpio = String(codigo).trim();
    return /^\d+$/.test(limpio) ? limpio.padStart(4, "0") : limpio.toUpperCase();
};
liquidacionRouter.post("/conceptos", requirePermission(PERMISO_MAPEO), async (req, res) => {
    try {
        const datos = conceptoSchema.parse(req.body);
        if (!Types.ObjectId.isValid(datos.empresaId))
            return res.status(400).json({ error: "Empresa inválida" });
        const concepto = await MemosoftConcepto.create({
            ...datos,
            codigo: normalizarCodigo(datos.codigo),
            empresaId: new Types.ObjectId(datos.empresaId),
            tenantId: req.tenantObjectId,
        });
        res.status(201).json(concepto);
    }
    catch (error) {
        if (error instanceof z.ZodError)
            return res.status(400).json({ error: "Datos inválidos", details: error.errors });
        if (error?.code === 11000)
            return res.status(409).json({ error: "Esa empresa ya tiene un concepto con ese código." });
        console.error("Crear concepto Memosoft error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
liquidacionRouter.patch("/conceptos/:id", requirePermission(PERMISO_MAPEO), async (req, res) => {
    try {
        const datos = conceptoSchema.partial().parse(req.body);
        /*
          EL CÓDIGO Y LA EMPRESA NO SE CAMBIAN. Son la identidad del concepto: los mapeos ya guardados
          lo referencian por código, y moverlo los dejaría apuntando a otra cosa sin avisar. Para
          corregir un código se desactiva el viejo y se crea el nuevo.
        */
        delete datos.codigo;
        delete datos.empresaId;
        const concepto = await MemosoftConcepto.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, { $set: datos }, { new: true });
        if (!concepto)
            return res.status(404).json({ error: "Concepto no encontrado" });
        res.json(concepto);
    }
    catch (error) {
        if (error instanceof z.ZodError)
            return res.status(400).json({ error: "Datos inválidos", details: error.errors });
        console.error("Editar concepto Memosoft error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * NO SE BORRA UN CONCEPTO QUE ALGÚN MOTIVO ESTÁ USANDO.
 *
 * Los efectos lo referencian por código; borrarlo los deja emitiendo algo que ya no existe en el
 * catálogo, y la validación recién lo descubre la próxima vez que alguien guarde ese motivo. Se
 * desactiva, que es lo mismo para el día a día y no rompe lo configurado.
 */
liquidacionRouter.delete("/conceptos/:id", requirePermission(PERMISO_MAPEO), async (req, res) => {
    try {
        const concepto = await MemosoftConcepto.findOne({ _id: req.params.id, tenantId: req.tenantObjectId }).select("codigo").lean();
        if (!concepto)
            return res.status(404).json({ error: "Concepto no encontrado" });
        const enUso = await RequestConfig.countDocuments({ tenantId: req.tenantObjectId, "memosoftEffects.conceptoCodigo": concepto.codigo });
        if (enUso > 0) {
            return res.status(409).json({
                error: `El concepto ${concepto.codigo} lo usan ${enUso} motivo(s) de novedad.`,
                ayuda: "Desactivalo en vez de borrarlo, o sacalo primero del mapeo de esos motivos.",
                sugerencia: "desactivar",
            });
        }
        await MemosoftConcepto.deleteOne({ _id: req.params.id, tenantId: req.tenantObjectId });
        res.json({ message: "Concepto eliminado" });
    }
    catch (error) {
        console.error("Borrar concepto Memosoft error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
