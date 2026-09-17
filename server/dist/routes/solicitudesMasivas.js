import { Router } from "express";
import multer from "multer";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { NOVEDAD_SOLICITUD, nombreDePersona, notificar, responsablesDeProyectos } from "../services/novedadesNotificaciones.js";
import { cargarCatalogos, construirPlantilla, crearSolicitud, filasDelArchivo, MAX_FILAS, soloDigitos, validarFila } from "../services/solicitudesMasivas.js";
/*
  CARGA MASIVA DE SOLICITUDES: bajar la planilla, probarla y subirla.

  Tres endpoints y un solo camino: la plantilla se arma con los catálogos del tenant, y lo que se
  sube se valida con esos mismos catálogos (ver `services/solicitudesMasivas.ts`).

  PREVISUALIZAR Y IMPORTAR SON EL MISMO CÓDIGO, con una bandera. No es ahorro de líneas: es que la
  vista previa prometa exactamente lo que va a pasar. Con dos validaciones distintas, la previa dice
  «23 listas» y el import crea 21, y nadie sabe cuál de las dos tenía razón.

  EL ARCHIVO SE VUELVE A VALIDAR AL IMPORTAR, no se confía en lo que devolvió la previa: entre una y
  otra pueden haber pasado minutos —y un proyecto, un turno o una categoría pueden haber cambiado—.
*/
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
/** Quién puede hacer esto: el mismo permiso con el que se ven y se aprueban las solicitudes. */
const PERMISO = "admin_users:view";
/**
 * Las personas de la planilla que YA están en la plataforma, buscadas por CUIT o documento.
 *
 * Se piden sólo los de la planilla y no todos los usuarios del tenant: son 1.575 fichas con toda su
 * metadata, y de cada una hacen falta cuatro campos.
 */
const usuariosDeLaPlanilla = async (tenantId, cuils) => {
    const numeros = [...new Set(cuils.filter(Boolean))];
    if (numeros.length === 0)
        return new Map();
    // El documento es el CUIL sin el prefijo ni el dígito verificador: se busca por las dos formas,
    // porque una ficha vieja puede tener sólo el DNI cargado.
    const documentos = numeros.map((n) => (n.length === 11 ? n.slice(2, 10) : n));
    const encontrados = await User.find({
        tenantId,
        $or: [{ "metadata.cuit": { $in: numeros } }, { "metadata.documento": { $in: [...numeros, ...documentos] } }],
    })
        .select("firstName lastName email metadata.fullName metadata.cuit metadata.documento metadata.id")
        .lean();
    const mapa = new Map();
    for (const u of encontrados) {
        const cuit = soloDigitos(u?.metadata?.cuit);
        const doc = soloDigitos(u?.metadata?.documento);
        if (cuit)
            mapa.set(cuit, u);
        if (doc)
            mapa.set(doc, u);
        // Una ficha con CUIT permite encontrarla también por su documento, que es lo que a veces se tipea.
        if (cuit.length === 11)
            mapa.set(cuit.slice(2, 10), u);
    }
    return mapa;
};
/** Lee el archivo, lo valida entero y devuelve las filas listas y los errores, sin crear nada. */
const revisarArchivo = async (buffer, tenantId) => {
    const filas = filasDelArchivo(buffer);
    if (filas.length === 0)
        return { listas: [], errores: [], total: 0 };
    if (filas.length > MAX_FILAS)
        throw new Error(`La planilla tiene ${filas.length} filas y el máximo es ${MAX_FILAS}. Partila en tandas.`);
    const { catalogos, proyectos, turnosPorId } = await cargarCatalogos(tenantId);
    const usuariosPorCuil = await usuariosDeLaPlanilla(tenantId, filas.flatMap((f) => [soloDigitos(f.valores.cuil), soloDigitos(f.valores.reemplazaA)]));
    const listas = [];
    const errores = [];
    for (const cruda of filas) {
        const { ok, errores: suyos } = validarFila(cruda, { catalogos, proyectos, turnosPorId, usuariosPorCuil });
        if (ok)
            listas.push(ok);
        errores.push(...suyos);
    }
    return { listas, errores, total: filas.length };
};
/*
  GET /solicitudes-masivas/plantilla — el .xlsx con los desplegables y los catálogos del tenant.

  Se genera en cada descarga y no se guarda: los proyectos, los turnos y las categorías cambian, y
  una plantilla guardada es una lista de opciones vencida que igual se completa.
*/
router.get("/plantilla", requireTenant, authenticateToken, requirePermission(PERMISO), async (req, res) => {
    try {
        const { catalogos } = await cargarCatalogos(req.tenantObjectId);
        const buffer = await construirPlantilla(catalogos);
        const fecha = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="solicitudes_${fecha}.xlsx"`);
        res.send(buffer);
    }
    catch (error) {
        console.error("Plantilla de solicitudes error:", error);
        res.status(500).json({ error: "No se pudo generar la plantilla." });
    }
});
/** POST /solicitudes-masivas/previsualizar — qué se va a crear y qué filas están mal. No crea nada. */
router.post("/previsualizar", requireTenant, authenticateToken, requirePermission(PERMISO), upload.single("archivo"), async (req, res) => {
    try {
        if (!req.file?.buffer) {
            res.status(400).json({ error: "Falta el archivo." });
            return;
        }
        const revision = await revisarArchivo(req.file.buffer, req.tenantObjectId);
        res.json(revision);
    }
    catch (error) {
        console.error("Previsualizar solicitudes error:", error);
        res.status(400).json({ error: error?.message || "No se pudo leer la planilla." });
    }
});
/*
  POST /solicitudes-masivas/importar — crea las solicitudes de las filas que están bien.

  LAS FILAS CON ERROR NO FRENAN A LAS DEMÁS: se informan y se crean las otras. Rechazar la tanda
  entera por una fila obliga a rehacer la planilla completa por un CUIL mal tipeado.

  Cada solicitud se crea por separado y con su propio try: una que falle —un índice único, una ficha
  a medio migrar— no puede voltear a las treinta que ya se crearon. Lo que se rompe se informa con su
  número de fila.
*/
router.post("/importar", requireTenant, authenticateToken, requirePermission(PERMISO), upload.single("archivo"), async (req, res) => {
    try {
        if (!req.file?.buffer) {
            res.status(400).json({ error: "Falta el archivo." });
            return;
        }
        const { listas, errores, total } = await revisarArchivo(req.file.buffer, req.tenantObjectId);
        if (listas.length === 0) {
            res.status(400).json({ error: "Ninguna fila de la planilla se puede importar.", errores, total });
            return;
        }
        // El rol con el que entran las personas nuevas: el mismo que reciben las altas por link de registro.
        const rolPorDefecto = await Role.findOne({ tenantId: req.tenantObjectId, isDefault: true }).select("_id").lean();
        let creadas = 0;
        let personasCreadas = 0;
        const creadasPorProyecto = new Map();
        const fallidas = [];
        for (const fila of listas) {
            try {
                const { solicitudId, personaCreada } = await crearSolicitud(fila.datos, req.tenantObjectId, req.user.userId, rolPorDefecto?._id || null);
                creadas++;
                if (personaCreada)
                    personasCreadas++;
                const delProyecto = creadasPorProyecto.get(fila.datos.projectId) || [];
                delProyecto.push(solicitudId);
                creadasPorProyecto.set(fila.datos.projectId, delProyecto);
            }
            catch (e) {
                console.error(`[CARGA MASIVA] fila ${fila.fila}:`, e);
                fallidas.push({ fila: fila.fila, campo: "General", motivo: e?.message || "No se pudo crear la solicitud." });
            }
        }
        /*
          UN AVISO POR PROYECTO, no uno por solicitud.
    
          Quien aprueba recibe la misma novedad que cuando entra una solicitud suelta, pero treinta altas
          importadas son treinta avisos idénticos en la campanita: se manda uno que dice cuántas entraron.
        */
        const quien = nombreDePersona(await User.findById(req.user.userId).select("firstName lastName metadata.fullName").lean());
        for (const [projectId, ids] of creadasPorProyecto) {
            await notificar({
                tenantId: req.tenantObjectId,
                destinatarios: await responsablesDeProyectos(req.tenantObjectId, [projectId]),
                type: NOVEDAD_SOLICITUD,
                title: ids.length === 1 ? "Nueva solicitud de contratación" : `${ids.length} solicitudes de contratación`,
                // Sin `refId`: el aviso habla de una tanda, no de una fila. Con uno solo se apunta a esa.
                refId: ids.length === 1 ? ids[0] : null,
                message: `Carga masiva de ${quien}`,
                excepto: req.user.userId,
            });
        }
        res.json({ creadas, personasCreadas, total, errores: [...errores, ...fallidas] });
    }
    catch (error) {
        console.error("Importar solicitudes error:", error);
        res.status(400).json({ error: error?.message || "No se pudo importar la planilla." });
    }
});
export default router;
