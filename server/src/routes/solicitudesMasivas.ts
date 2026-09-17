import { Router } from "express";
import multer from "multer";
import { Types } from "mongoose";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyPermission } from "../middleware/permissions.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { MOBILE_USERS } from "../utils/permisosMobile.js";
import { alcanceDeResponsable } from "../utils/visibilidadResponsable.js";
import { Role } from "../models/Role.js";
import { NOVEDAD_SOLICITUD, nombreDePersona, notificar, responsablesDeProyectos } from "../services/novedadesNotificaciones.js";
import { cargarCatalogos, construirPlantilla, crearSolicitud, ErrorFila, filasDelArchivo, FilaValidada, MAX_FILAS, soloDigitos, validarFila } from "../services/solicitudesMasivas.js";

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

/*
  QUIÉN PUEDE HACER ESTO: quien administra solicitudes, y quien las pide desde la app.

  El coordinador que carga las altas de a una en el teléfono es el que tiene el equipo entero para
  dar de alta, así que es el primer interesado en subir una planilla. Lo que lo acota no es el
  permiso sino el ALCANCE: su plantilla trae sólo sus proyectos (ver `proyectosVisibles`), y una fila
  con un proyecto que no es suyo se rechaza como «no existe» —que es lo que ese proyecto es para él—.
*/
const PERMISOS = ["admin_users:view", MOBILE_USERS];

/**
 * A qué proyectos alcanza la carga de esta persona. `null` = todos (un admin).
 *
 * Es la misma regla que el resto de la plataforma (`GET /projects`): lo asignado más lo que tiene a
 * cargo como responsable. No se inventa un criterio propio: si la carga masiva viera más que el
 * listado de proyectos, sería una puerta de atrás a los datos de otros equipos.
 */
const proyectosVisibles = async (req: AuthenticatedRequest & TenantRequest): Promise<Types.ObjectId[] | null> => {
  const roles = (req.user?.roles || []).map((r) => String(r).toLowerCase());
  const principal = String(req.user?.primaryRole || "").toLowerCase();
  if (roles.includes("admin") || roles.includes("superadmin") || principal === "admin" || principal === "superadmin") return null;

  const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user!.userId);
  const asignados = await Project.find({ tenantId: req.tenantObjectId, assignedUsers: new Types.ObjectId(req.user!.userId) }).distinct("_id");
  const ids = [...new Set([...proyectos, ...asignados].map((id: any) => String(id)))];
  return ids.map((id) => new Types.ObjectId(id));
};

/**
 * Las personas de la planilla que YA están en la plataforma, buscadas por CUIT o documento.
 *
 * Se piden sólo los de la planilla y no todos los usuarios del tenant: son 1.575 fichas con toda su
 * metadata, y de cada una hacen falta cuatro campos.
 */
const usuariosDeLaPlanilla = async (tenantId: Types.ObjectId, cuils: string[]): Promise<Map<string, any>> => {
  const numeros = [...new Set(cuils.filter(Boolean))];
  if (numeros.length === 0) return new Map();
  // El documento es el CUIL sin el prefijo ni el dígito verificador: se busca por las dos formas,
  // porque una ficha vieja puede tener sólo el DNI cargado.
  const documentos = numeros.map((n) => (n.length === 11 ? n.slice(2, 10) : n));
  const encontrados = await User.find({
    tenantId,
    $or: [{ "metadata.cuit": { $in: numeros } }, { "metadata.documento": { $in: [...numeros, ...documentos] } }],
  })
    .select("firstName lastName email metadata.fullName metadata.cuit metadata.documento metadata.id")
    .lean();

  const mapa = new Map<string, any>();
  for (const u of encontrados as any[]) {
    const cuit = soloDigitos(u?.metadata?.cuit);
    const doc = soloDigitos(u?.metadata?.documento);
    if (cuit) mapa.set(cuit, u);
    if (doc) mapa.set(doc, u);
    // Una ficha con CUIT permite encontrarla también por su documento, que es lo que a veces se tipea.
    if (cuit.length === 11) mapa.set(cuit.slice(2, 10), u);
  }
  return mapa;
};

/** Lee el archivo, lo valida entero y devuelve las filas listas y los errores, sin crear nada. */
const revisarArchivo = async (buffer: Buffer, tenantId: Types.ObjectId, visibles: Types.ObjectId[] | null): Promise<{ listas: FilaValidada[]; errores: ErrorFila[]; total: number }> => {
  const filas = filasDelArchivo(buffer);
  if (filas.length === 0) return { listas: [], errores: [], total: 0 };
  if (filas.length > MAX_FILAS) throw new Error(`La planilla tiene ${filas.length} filas y el máximo es ${MAX_FILAS}. Partila en tandas.`);

  const { catalogos, proyectos, turnosPorId } = await cargarCatalogos(tenantId, visibles);
  const usuariosPorCuil = await usuariosDeLaPlanilla(tenantId, filas.flatMap((f) => [soloDigitos(f.valores.cuil), soloDigitos(f.valores.reemplazaA)]));

  const listas: FilaValidada[] = [];
  const errores: ErrorFila[] = [];
  for (const cruda of filas) {
    const { ok, errores: suyos } = validarFila(cruda, { catalogos, proyectos, turnosPorId, usuariosPorCuil });
    if (ok) listas.push(ok);
    errores.push(...suyos);
  }
  return { listas, errores, total: filas.length };
};

/*
  GET /solicitudes-masivas/plantilla — el .xlsx con los desplegables y los catálogos del tenant.

  Se genera en cada descarga y no se guarda: los proyectos, los turnos y las categorías cambian, y
  una plantilla guardada es una lista de opciones vencida que igual se completa.
*/
router.get("/plantilla", requireTenant, authenticateToken, requireAnyPermission(...PERMISOS), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { catalogos } = await cargarCatalogos(req.tenantObjectId!, await proyectosVisibles(req));
    const buffer = await construirPlantilla(catalogos);
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="solicitudes_${fecha}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error("Plantilla de solicitudes error:", error);
    res.status(500).json({ error: "No se pudo generar la plantilla." });
  }
});

/** POST /solicitudes-masivas/previsualizar — qué se va a crear y qué filas están mal. No crea nada. */
router.post("/previsualizar", requireTenant, authenticateToken, requireAnyPermission(...PERMISOS), upload.single("archivo"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Falta el archivo." });
      return;
    }
    const revision = await revisarArchivo(req.file.buffer, req.tenantObjectId!, await proyectosVisibles(req));
    res.json(revision);
  } catch (error: any) {
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
router.post("/importar", requireTenant, authenticateToken, requireAnyPermission(...PERMISOS), upload.single("archivo"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Falta el archivo." });
      return;
    }
    const { listas, errores, total } = await revisarArchivo(req.file.buffer, req.tenantObjectId!, await proyectosVisibles(req));
    if (listas.length === 0) {
      res.status(400).json({ error: "Ninguna fila de la planilla se puede importar.", errores, total });
      return;
    }

    // El rol con el que entran las personas nuevas: el mismo que reciben las altas por link de registro.
    const rolPorDefecto: any = await Role.findOne({ tenantId: req.tenantObjectId, isDefault: true }).select("_id").lean();

    let creadas = 0;
    let personasCreadas = 0;
    const creadasPorProyecto = new Map<string, string[]>();
    const fallidas: ErrorFila[] = [];

    for (const fila of listas) {
      try {
        const { solicitudId, personaCreada } = await crearSolicitud(fila.datos, req.tenantObjectId!, req.user!.userId, rolPorDefecto?._id || null);
        creadas++;
        if (personaCreada) personasCreadas++;
        const delProyecto = creadasPorProyecto.get(fila.datos.projectId) || [];
        delProyecto.push(solicitudId);
        creadasPorProyecto.set(fila.datos.projectId, delProyecto);
      } catch (e: any) {
        console.error(`[CARGA MASIVA] fila ${fila.fila}:`, e);
        fallidas.push({ fila: fila.fila, campo: "General", motivo: e?.message || "No se pudo crear la solicitud." });
      }
    }

    /*
      UN AVISO POR PROYECTO, no uno por solicitud.

      Quien aprueba recibe la misma novedad que cuando entra una solicitud suelta, pero treinta altas
      importadas son treinta avisos idénticos en la campanita: se manda uno que dice cuántas entraron.
    */
    const quien = nombreDePersona(await User.findById(req.user!.userId).select("firstName lastName metadata.fullName").lean());
    for (const [projectId, ids] of creadasPorProyecto) {
      await notificar({
        tenantId: req.tenantObjectId!,
        destinatarios: await responsablesDeProyectos(req.tenantObjectId!, [projectId]),
        type: NOVEDAD_SOLICITUD,
        title: ids.length === 1 ? "Nueva solicitud de contratación" : `${ids.length} solicitudes de contratación`,
        // Sin `refId`: el aviso habla de una tanda, no de una fila. Con uno solo se apunta a esa.
        refId: ids.length === 1 ? ids[0] : null,
        message: `Carga masiva de ${quien}`,
        excepto: req.user!.userId,
      });
    }

    res.json({ creadas, personasCreadas, total, errores: [...errores, ...fallidas] });
  } catch (error: any) {
    console.error("Importar solicitudes error:", error);
    res.status(400).json({ error: error?.message || "No se pudo importar la planilla." });
  }
});

export default router;
