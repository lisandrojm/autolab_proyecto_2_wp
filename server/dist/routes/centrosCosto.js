import { Router } from "express";
import multer from "multer";
import xlsx from "xlsx";
import mongoose from "mongoose";
import { CentroCosto, sincronizarCamposDerivados } from "../models/CentroCosto.js";
import { CentroCostoRespaldo } from "../models/CentroCostoRespaldo.js";
import { Project } from "../models/Project.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
import { construirRemapeo, decidirRemapeo, validarPayload } from "../services/centrosCostoImport.js";
/*
  CENTROS DE COSTO: EL AUXILIAR DE TANGO, CON SU PROPIO ABM.

  Dejó de ser un «catálogo simple» —nombre + id externo— el día que pasó a tener los cuatro campos de
  Tango (`idAuxiliar`, `codAuxiliar`, `descAuxiliar`, `habilitado`), un import de 806 registros que
  reemplaza todo y un remapeo de los proyectos. Nada de eso cabe en el router genérico sin torcerlo
  para un caso, y ese router lo comparten otros diez catálogos.

  Así que acá se definen los endpoints propios —create, update, plantilla, import de Excel y el import
  JSON— y al final se monta el genérico, que aporta lo que no cambia: listar y borrar. Lo que se
  registra primero gana, así que estos pisan a los del genérico sin tocarlo.

  EL CATÁLOGO ES GLOBAL, no por tenant: así está el modelo y así lo usa el router genérico (todos los
  tenants comparten los centros de costo de Tango). El REMAPEO de proyectos sí filtra por tenant,
  porque los proyectos son de cada uno.
*/
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
/** El permiso de la pantalla de Centros de Costos, para lo que escribe el catálogo entero. */
const PERMISO = "config_centros_costo:view";
const COLUMNAS = { id: "ID_AUXILIAR", cod: "COD_AUXILIAR", desc: "DESC_AUXILIAR", hab: "HABILITADO" };
/** Lee un valor de una fila de Excel aceptando el encabezado en cualquier capitalización. */
const celda = (fila, encabezado) => {
    const buscado = encabezado.toLowerCase().replace(/[\s_]/g, "");
    for (const clave of Object.keys(fila)) {
        if (clave.toLowerCase().replace(/[\s_]/g, "") === buscado)
            return fila[clave];
    }
    return undefined;
};
/**
 * Valida un centro suelto (alta y edición) con las mismas reglas que el import.
 *
 * Devuelve el mensaje del primer problema, o null. El 409 por repetido NO se decide acá: hace falta
 * consultar la base y eso es de la ruta.
 */
const validarUno = (body) => {
    const cod = String(body?.codAuxiliar ?? body?.nombre ?? body?.name ?? "").trim();
    if (!cod)
        return "El código (COD_AUXILIAR) es obligatorio: es el número del centro y es lo que se muestra.";
    const idCrudo = body?.idAuxiliar;
    if (idCrudo !== undefined && idCrudo !== null && String(idCrudo).trim() !== "") {
        const id = Number(idCrudo);
        if (!Number.isInteger(id) || id <= 0)
            return "El ID de Tango (ID_AUXILIAR) tiene que ser un número entero mayor a 0.";
    }
    const hab = body?.habilitado;
    if (hab !== undefined && hab !== null && String(hab).trim() !== "" && !["S", "N"].includes(String(hab).trim().toUpperCase())) {
        return 'Habilitado tiene que ser "S" o "N".';
    }
    return null;
};
/** Los campos del body, ya normalizados, listos para guardar. */
const camposDesdeBody = (body) => {
    const cod = String(body?.codAuxiliar ?? body?.nombre ?? body?.name ?? "").trim();
    const id = body?.idAuxiliar === undefined || body?.idAuxiliar === null || String(body.idAuxiliar).trim() === "" ? undefined : Number(body.idAuxiliar);
    const hab = body?.habilitado === undefined || body?.habilitado === null || String(body.habilitado).trim() === "" ? undefined : String(body.habilitado).trim().toUpperCase();
    return {
        codAuxiliar: cod,
        descAuxiliar: body?.descAuxiliar === undefined ? undefined : String(body.descAuxiliar ?? "").trim(),
        idAuxiliar: id,
        habilitado: hab,
    };
};
/** ¿Ya hay otro centro con ese id o ese código? Devuelve el mensaje del choque, o null. */
const buscarChoque = async (campos, excluirId) => {
    const o = [];
    if (campos.idAuxiliar !== undefined)
        o.push({ idAuxiliar: campos.idAuxiliar });
    if (campos.codAuxiliar)
        o.push({ codAuxiliar: campos.codAuxiliar });
    if (o.length === 0)
        return null;
    const filtro = { $or: o };
    if (excluirId)
        filtro._id = { $ne: excluirId };
    const existente = await CentroCosto.findOne(filtro).select("idAuxiliar codAuxiliar").lean();
    if (!existente)
        return null;
    if (campos.idAuxiliar !== undefined && Number(existente.idAuxiliar) === campos.idAuxiliar)
        return `Ya hay un centro de costo con el ID de Tango ${campos.idAuxiliar} (${existente.codAuxiliar || "sin código"}).`;
    return `Ya hay un centro de costo con el código "${campos.codAuxiliar}".`;
};
// POST / - alta. Antes que el genérico: agrega las validaciones de los campos de Tango.
router.post("/", requireTenant, authenticateToken, requirePermission(PERMISO), async (req, res) => {
    try {
        const error = validarUno(req.body);
        if (error) {
            res.status(400).json({ error });
            return;
        }
        const campos = camposDesdeBody(req.body);
        const choque = await buscarChoque(campos);
        if (choque) {
            res.status(409).json({ error: choque });
            return;
        }
        const creado = await CentroCosto.create({ ...campos, habilitado: campos.habilitado || "S", name: campos.codAuxiliar });
        res.status(201).json(creado.toObject());
    }
    catch (error) {
        console.error("Crear centro de costo error:", error);
        res.status(500).json({ error: "No se pudo crear el centro de costo." });
    }
});
// PUT /:id - edición.
router.put("/:id", requireTenant, authenticateToken, requirePermission(PERMISO), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ error: "Id inválido." });
            return;
        }
        const doc = await CentroCosto.findById(req.params.id);
        if (!doc) {
            res.status(404).json({ error: "Centro de costo no encontrado." });
            return;
        }
        const error = validarUno({ ...doc.toObject(), ...req.body });
        if (error) {
            res.status(400).json({ error });
            return;
        }
        const campos = camposDesdeBody({ ...doc.toObject(), ...req.body });
        const choque = await buscarChoque(campos, req.params.id);
        if (choque) {
            res.status(409).json({ error: choque });
            return;
        }
        doc.codAuxiliar = campos.codAuxiliar;
        if (campos.descAuxiliar !== undefined)
            doc.descAuxiliar = campos.descAuxiliar;
        if (campos.idAuxiliar !== undefined)
            doc.idAuxiliar = campos.idAuxiliar;
        if (campos.habilitado !== undefined)
            doc.habilitado = campos.habilitado;
        await doc.save();
        res.json(doc.toObject());
    }
    catch (error) {
        console.error("Editar centro de costo error:", error);
        res.status(500).json({ error: "No se pudo guardar el centro de costo." });
    }
});
/*
  GET /template y POST /import: el Excel con las cuatro columnas de Tango.

  Reemplazan a los del genérico, que arman «ID Externo | Nombre»: en este catálogo el id externo dejó
  de existir como concepto y el nombre es el código. Una plantilla que pide «Nombre» sobre un catálogo
  que muestra «Código» es una invitación a cargarlo mal.
*/
router.get("/template", authenticateToken, async (_req, res) => {
    try {
        const ws = xlsx.utils.aoa_to_sheet([
            [COLUMNAS.id, COLUMNAS.cod, COLUMNAS.desc, COLUMNAS.hab],
            [863, "682", "682_PEGSA_FILMATIC_UNREAL_ON11E", "S"],
            [1, "99", "99-PRODUCTORA", "S"],
            [150, "136", "136-DISNEY - SING ALONG", "N"],
        ]);
        ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 48 }, { wch: 12 }];
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "CentrosCosto");
        const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=plantilla_centros_costo.xlsx");
        res.send(buffer);
    }
    catch (error) {
        console.error("Plantilla centros de costo error:", error);
        res.status(500).json({ error: "No se pudo generar la plantilla" });
    }
});
router.post("/import", requireTenant, authenticateToken, requirePermission(PERMISO), upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "Debe subir un archivo de Excel" });
            return;
        }
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const filas = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        if (filas.length === 0) {
            res.status(400).json({ error: "El archivo de Excel está vacío" });
            return;
        }
        // Se reusa la validación del import JSON: una sola definición de qué es un centro válido.
        const items = filas.map((f) => ({
            idAuxiliar: Number(celda(f, COLUMNAS.id)),
            codAuxiliar: String(celda(f, COLUMNAS.cod) ?? "").trim(),
            descAuxiliar: String(celda(f, COLUMNAS.desc) ?? "").trim(),
            habilitado: String(celda(f, COLUMNAS.hab) ?? "S").trim().toUpperCase(),
        }));
        const validado = validarPayload({ modo: "actualizar", items });
        if (!validado.ok) {
            res.status(400).json({ error: "El archivo tiene errores", errores: validado.errores.slice(0, 50), total: validado.errores.length });
            return;
        }
        const { actualizados, creados } = await upsertPorIdAuxiliar(validado.items);
        res.json({ message: `Se importaron ${validado.items.length} centros de costo`, total: validado.items.length, creados, actualizados });
    }
    catch (error) {
        console.error("Import Excel centros de costo error:", error);
        res.status(500).json({ error: "No se pudo importar el archivo" });
    }
});
/** Upsert por `idAuxiliar`, con los derivados ya calculados (bulkWrite no pasa por los hooks). */
async function upsertPorIdAuxiliar(items) {
    const ops = items.map((i) => {
        const doc = sincronizarCamposDerivados({ ...i });
        return {
            updateOne: {
                filter: { idAuxiliar: i.idAuxiliar },
                update: { $set: { idAuxiliar: doc.idAuxiliar, codAuxiliar: doc.codAuxiliar, descAuxiliar: doc.descAuxiliar, habilitado: doc.habilitado, name: doc.name, externalId: doc.externalId, data: doc.data } },
                upsert: true,
            },
        };
    });
    const r = await CentroCosto.bulkWrite(ops, { ordered: false });
    return { creados: r.upsertedCount || 0, actualizados: r.modifiedCount || 0 };
}
/*
  POST /import-json - el catálogo de Tango, completo.

  `modo: "reemplazar"` (el default) borra TODO el catálogo y lo deja como el archivo; `"actualizar"`
  hace upsert por `idAuxiliar` y no borra nada.

  EL ORDEN IMPORTA Y ESTÁ ELEGIDO: primero se valida el archivo entero, después se lee el catálogo
  viejo y se arma el remapeo —que necesita los códigos de ANTES—, después se respalda, y sólo al final
  se escribe. Cualquier otro orden deja la plataforma sin centros de costo si algo falla en el medio.

  Con `remapearProyectos` se corrigen además los `metadata.centroCostoId` del tenant, que es lo que
  hace que un proyecto que decía «682» siga diciendo «682» después del reemplazo (cambia su id de 1 a
  863). Sin eso, los ids viejos apuntarían a centros nuevos que no tienen nada que ver.
*/
router.post("/import-json", requireTenant, authenticateToken, requirePermission(PERMISO), async (req, res) => {
    try {
        const validado = validarPayload(req.body || {});
        if (!validado.ok) {
            res.status(400).json({
                error: `El archivo tiene ${validado.errores.length} ${validado.errores.length === 1 ? "error" : "errores"}. No se tocó nada.`,
                errores: validado.errores.slice(0, 50),
                total: validado.errores.length,
            });
            return;
        }
        const { items, modo } = validado;
        const remapear = req.body?.remapearProyectos !== false && modo === "reemplazar";
        if (modo === "actualizar") {
            const { creados, actualizados } = await upsertPorIdAuxiliar(items);
            res.json({ message: `Se actualizaron ${items.length} centros de costo`, total: items.length, borrados: 0, creados, actualizados, remapeados: 0 });
            return;
        }
        // 1. El catálogo anterior: es la única fuente del cruce por código, y hay que leerlo antes de borrar.
        const anteriores = await CentroCosto.find({}).lean();
        const remapeo = construirRemapeo(anteriores.map((c) => ({ idViejo: Number(c.idAuxiliar ?? c.data?.id ?? Number(c.externalId)), codigo: String(c.codAuxiliar ?? c.name ?? c.data?.nombre ?? "") })), items);
        // 2. Qué proyectos se tocan (del tenant que pide), decidido antes de escribir nada.
        const proyectos = remapear ? await Project.find({ tenantId: req.tenantObjectId, "metadata.centroCostoId": { $gt: 0 } }).select("name metadata.centroCostoId metadata.centroCostoOrigen").lean() : [];
        const decision = decidirRemapeo(proyectos.map((p) => ({ _id: p._id, nombre: p.name, centroCostoId: p.metadata?.centroCostoId, centroCostoOrigen: p.metadata?.centroCostoOrigen })), remapeo);
        // 3. El respaldo, antes de escribir: el catálogo viejo y el antes/después de cada proyecto.
        await CentroCostoRespaldo.create({
            ejecutadoPor: req.user?.userId,
            origen: "pantalla",
            modo,
            catalogoAnterior: anteriores,
            proyectos: decision.cambios.map((c) => ({ projectId: c.projectId, nombre: c.nombre, antes: c.antes, despues: c.despues })),
            sinEquivalente: decision.omitidos.filter((o) => o.motivo.includes("no existe en Tango")).map((o) => ({ projectId: o.projectId, nombre: o.nombre, centroCostoId: o.centroCostoId, motivo: o.motivo })),
        });
        /*
          4. El reemplazo. Se intenta en una transacción —borrar y crear tienen que pasar juntos o no
          pasar— y, si este Mongo no es replica set (no soporta transacciones), se hace sin ella: el
          respaldo de arriba es lo que permite volver atrás en ese caso.
        */
        let borrados = 0;
        const documentos = items.map((i) => sincronizarCamposDerivados({ ...i }));
        let conTransaccion = true;
        const sesion = await mongoose.startSession().catch(() => null);
        try {
            if (!sesion)
                throw new Error("sin sesión");
            await sesion.withTransaction(async () => {
                borrados = (await CentroCosto.deleteMany({}, { session: sesion })).deletedCount || 0;
                await CentroCosto.insertMany(documentos, { session: sesion, ordered: false });
            });
        }
        catch (e) {
            conTransaccion = false;
            console.warn("[CENTROS-COSTO] Sin transacción (", e?.message, "): se reemplaza con el respaldo como red.");
            borrados = (await CentroCosto.deleteMany({})).deletedCount || 0;
            await CentroCosto.insertMany(documentos, { ordered: false });
        }
        finally {
            await sesion?.endSession();
        }
        // 5. Recién ahora se mueven los proyectos, con el catálogo nuevo ya en su lugar.
        let remapeados = 0;
        if (remapear && decision.cambios.length > 0) {
            const r = await Project.bulkWrite(decision.cambios.map((c) => ({
                updateOne: {
                    filter: { _id: c.projectId, tenantId: req.tenantObjectId },
                    update: { $set: { "metadata.centroCostoId": c.despues, "metadata.centroCostoOrigen": "tango" } },
                },
            })), { ordered: false });
            remapeados = r.modifiedCount || 0;
        }
        console.log(`[CENTROS-COSTO] Reemplazo${conTransaccion ? " (transacción)" : ""}: ${borrados} borrados, ${documentos.length} creados, ${remapeados} proyectos remapeados, ${decision.omitidos.length} sin tocar.`);
        res.json({
            message: `Catálogo reemplazado: ${borrados} borrados, ${documentos.length} creados${remapeados > 0 ? `, ${remapeados} proyectos actualizados` : ""}.`,
            total: documentos.length,
            borrados,
            creados: documentos.length,
            actualizados: 0,
            remapeados,
            sinEquivalente: decision.omitidos.filter((o) => o.motivo.includes("no existe en Tango")),
            omitidos: decision.omitidos.length,
        });
    }
    catch (error) {
        console.error("Import JSON centros de costo error:", error);
        res.status(500).json({ error: "No se pudo importar el catálogo. No se guardó nada a medias: revisá el log del servidor." });
    }
});
/*
  El resto —listar y borrar— sigue siendo el del router genérico. Lo que este archivo define arriba
  tiene prioridad: Express resuelve por orden de registro.
*/
router.use(createSimpleCatalogRouter(CentroCosto, {
    entityLabel: "Centro de Costo",
    sheetName: "CentrosCosto",
    templateFilename: "plantilla_centros_costo.xlsx",
    extraStringFields: [{ key: "codAuxiliar" }, { key: "descAuxiliar" }, { key: "habilitado" }],
    extraNumberFields: [{ key: "idAuxiliar" }],
}));
export { router as centroCostoRoutes };
