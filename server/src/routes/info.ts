import { Router } from "express";
import { Info } from "../models/Info.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { PROPOSITOS, esProposito } from "../utils/propositosCarpeta.js";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, listFolder } from "../services/dropboxService.js";
import { ESTADO_TYPE, esEstadoDeSistema, ensureEstadosImpositivosSistema } from "../utils/estadosImpositivosSistema.js";

const router = Router();

const normalizarNombre = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Semilla de `data.orden` para los Estados que ya existían antes de este campo (portada del mapa
 * `ESTADO_ORDER` que tenía hardcodeado el frontend en `EstadoSelect.tsx`). Un estado no reconocido
 * queda en 999 (al final) hasta que alguien lo reordene a mano desde el ABM.
 */
const ORDEN_SEMILLA: Record<string, number> = {
  "pedido de afip": 0,
  "falta pedido de afip": 0,
  "pedido servicios": 1,
  "envio de documentacion": 2,
  "firma pendiente": 3,
  disponible: 4,
};
const ORDEN_NO_RECONOCIDO = 999;

/**
 * Backfill idempotente: a todo Estado que todavía no tenga `data.orden` (documentos de antes de
 * este campo) le asigna un valor inicial, para no pisar en silencio el orden que el usuario ya
 * conocía por `ESTADO_ORDER`. Se dispara solo (no hace falta correr un script en el VPS), mismo
 * patrón que `ensureContratosBackfilled()` en `routes/contratos.ts`.
 */
async function ensureEstadosOrdenBackfilled(): Promise<void> {
  const sinOrden = await Info.find({ type: ESTADO_TYPE, "data.orden": { $exists: false } });
  if (sinOrden.length === 0) return;

  const ops = sinOrden.map((estado) => ({
    updateOne: {
      filter: { _id: estado._id },
      update: { $set: { "data.orden": ORDEN_SEMILLA[normalizarNombre(estado.name)] ?? ORDEN_NO_RECONOCIDO } },
    },
  }));
  await Info.bulkWrite(ops);
}

/**
 * GET /api/v1/info
 * Query: ?type=sede
 */
/**
 * GET /info/propositos-carpeta — para qué puede servir una carpeta vigilada.
 *
 * Existe para que el desplegable del modal NO tenga su propia lista. La fuente es
 * `utils/propositosCarpeta.ts`, del lado del server, que es donde también viven la validación, el
 * backfill y la resolución: un array escrito a mano en el componente sería una segunda verdad sobre
 * lo mismo, y ya sabemos cómo termina eso.
 *
 * Devuelve etiqueta Y descripción: si el front compusiera los textos por su cuenta, la etiqueta
 * volvería a ser una segunda verdad por otro camino.
 *
 * Es estático: no toca la base. El front lo cachea por sesión.
 */
router.get("/propositos-carpeta", requireTenant, authenticateToken, async (_req: AuthenticatedRequest & TenantRequest, res) => {
  res.json({ propositos: PROPOSITOS.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta, descripcion: p.descripcion })) });
});

router.get("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { type } = req.query;
    const filter: any = {};

    if (type) {
      filter.type = type;
    }

    if (type === ESTADO_TYPE) {
      // Mismo patrón que el backfill de orden: se dispara solo, sin correr nada en el VPS. El seed
      // del arranque también lo hace; acá cubre el caso de una base que ya estaba levantada.
      await ensureEstadosImpositivosSistema();
      await ensureEstadosOrdenBackfilled();
      const items = await Info.find(filter)
        .sort({ "data.orden": 1, name: 1 })
        .lean();
      res.json(items);
      return;
    }

    const items = await Info.find(filter).sort({ name: 1 }).lean();
    res.json(items);
  } catch (error) {
    console.error("Get info error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ------------------------------- ABM de Estados -------------------------------
 * Los estados del contrato son `infos` con type "estado-empleado" (los sincroniza FRAME).
 * El ABM de Configuración agrega los campos propios en `data`: color del badge, tipos de
 * contrato en los que se ofrece y el nombre que lleva dentro del contrato.
 * Los contratos guardan `estado_id` (data.id numérico), así que a los estados creados a mano
 * hay que darles un id que no colisione con los de FRAME.
 */

// Los ids de FRAME son bajos; los locales arrancan bien arriba para no pisarlos nunca.
const LOCAL_ESTADO_ID_BASE = 100000;

/** Trámite impositivo que representa un estado impositivo. Excluyentes: siempre uno solo. */
const TIPOS_IMPOSITIVO = ["alta_temprana_afip", "constancia_cuit"] as const;

/** Único evento que puede disparar una transición automática hacia un estado: aparece un archivo
 *  en una carpeta de Dropbox. */
const EVENTOS_TRANSICION_AUTOMATICA = ["dropbox_carpeta"] as const;

/**
 * ¿El estado (con el `data` que va a quedar guardado tras este request) tiene `ordenDependencia`?
 * En POST no hay `estadoActual` (todavía no existe); en PATCH hace falta para cubrir el caso en que
 * el request no toca `ordenDependencia` pero el estado ya lo tenía asignado de antes.
 */
function tieneOrdenDependencia(parsedData: any, estadoActual?: any): boolean {
  const valor = parsedData.ordenDependencia !== undefined ? parsedData.ordenDependencia : estadoActual?.data?.ordenDependencia;
  return typeof valor === "number";
}

function parseEstadoBody(body: any, estadoActual?: any): { error?: string; name?: string; data?: any } {
  const name = String(body?.name ?? "").trim();
  if (!name) return { error: "El nombre es obligatorio" };

  const color = String(body?.color ?? "").trim();
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) return { error: "El color debe ser hexadecimal, por ejemplo #16a34a" };

  const contratoFrameIds = Array.isArray(body?.contratoFrameIds) ? body.contratoFrameIds.map((id: any) => String(id)).filter(Boolean) : [];

  /*
    UN ESTADO DE SISTEMA ES IMPOSITIVO SIEMPRE, aunque el formulario mande lo contrario.

    Existe justamente para representar uno de los dos trámites; destildarle la casilla lo dejaría
    como un estado común y el siguiente arranque se lo volvería a marcar (`ensureEstadosImpositivos
    Sistema`). En vez de ese ida y vuelta, acá no se puede apagar.
  */
  const esDeSistema = estadoActual?.data?.esSistema === true;
  const esImpositivo = esDeSistema || body?.esImpositivo === true || body?.esImpositivo === "true";

  /*
    Un estado impositivo sin tipos aplicaría a TODOS y chocaría con cualquier otro impositivo, así
    que se le exige elegir a cuáles corresponde.

    LOS DE SISTEMA ESTÁN EXENTOS: nacen sin ningún tipo de contrato asociado —el sistema garantiza
    que los dos trámites existan, no a qué se aplican— y con esta regla no se los podría ni guardar
    ni editar hasta asignarles uno. Sin tipos no chocan con nadie (`conflictoImpositivo` compara
    justamente esa lista) y el wizard no los elige solo, así que la exención no abre ningún agujero.
  */
  if (esImpositivo && contratoFrameIds.length === 0 && !esDeSistema) {
    return { error: "Un estado impositivo tiene que indicar a qué tipos de contrato corresponde" };
  }

  // El badge secundario (texto + color) solo tiene sentido para estados impositivos: si se destilda
  // "Estado impositivo" se descarta, para no dejar un badge secundario huérfano configurado. Si está
  // tildado, el texto es obligatorio: sin él no se puede mostrar el badge en las tarjetas.
  const colorEtiquetaSecundaria = String(body?.colorEtiquetaSecundaria ?? "").trim();
  if (colorEtiquetaSecundaria && !/^#[0-9a-f]{6}$/i.test(colorEtiquetaSecundaria)) return { error: "El color del badge secundario debe ser hexadecimal, por ejemplo #16a34a" };
  const etiquetaSecundaria = esImpositivo ? String(body?.etiquetaSecundaria ?? "").trim() : "";
  if (esImpositivo && !etiquetaSecundaria) {
    return { error: "Un estado impositivo tiene que tener un texto de badge secundario" };
  }

  // Todo estado impositivo tiene que ser exactamente uno de estos dos trámites (nunca los dos ni
  // ninguno): "Alta temprana de ARCA" o "Constancia de CUIT".
  const tipoImpositivo = esImpositivo ? String(body?.tipoImpositivo ?? "").trim() : "";
  if (esImpositivo && !TIPOS_IMPOSITIVO.includes(tipoImpositivo as any)) {
    return { error: "Un estado impositivo tiene que ser 'Alta temprana de ARCA' o 'Constancia de CUIT'" };
  }

  const data: any = {
    nombre: name,
    color: color || undefined,
    contratoFrameIds,
    esImpositivo,
    etiquetaSecundaria: etiquetaSecundaria || undefined,
    colorEtiquetaSecundaria: esImpositivo ? colorEtiquetaSecundaria || undefined : undefined,
    tipoImpositivo: esImpositivo ? tipoImpositivo : undefined,
    // Convivencia con gente sin CUIT: solo aplica a estados impositivos.
    aceptaSinCuit: esImpositivo ? body?.aceptaSinCuit === true : undefined,
  };
  // Los estados impositivos van por defecto al Paso 1 del flujo de dependencias. Solo se toca
  // `ordenDependencia` cuando es impositivo; en los no impositivos NO se incluye la clave, para que
  // el update (spread `{ ...estado.data, ...parsed.data }`) preserve el paso que tengan en el flujo.
  if (esImpositivo) data.ordenDependencia = 1;

  // Transición automática: se maneja aparte (se edita desde "Orden de dependencias", no desde este
  // formulario) y es opcional en el body. Igual que con `ordenDependencia`: si el caller NO manda la
  // clave, no se toca acá — para que el merge del PATCH preserve lo que ya estaba configurado. Si la
  // manda, `null`/`{}`/sin carpetas la borra; un objeto con `evento` + al menos una carpeta la setea.
  // Puede tener VARIAS carpetas: cualquiera de ellas dispara la misma transición.
  if (Object.prototype.hasOwnProperty.call(body || {}, "transicionAutomatica")) {
    const rawTransicion = body.transicionAutomatica;
    const rawCarpetas = Array.isArray(rawTransicion?.carpetas) ? rawTransicion.carpetas : [];
    if (rawTransicion && typeof rawTransicion === "object" && rawTransicion.evento && rawCarpetas.length > 0) {
      const evento = String(rawTransicion.evento).trim();
      if (!EVENTOS_TRANSICION_AUTOMATICA.includes(evento as any)) {
        return { error: "El evento de transición automática no es válido" };
      }
      // Nota libre de quien configura la transición (ej. qué significa esta carpeta en su flujo):
      // el contenido lo define el usuario, así que no hay más validación que un límite de largo.
      const vistas = new Set<string>();
      const carpetas: { dropboxCarpeta: string; detalle?: string; proposito?: string }[] = [];
      for (const c of rawCarpetas) {
        const dropboxCarpeta = String(c?.dropboxCarpeta ?? "").trim();
        if (!dropboxCarpeta || vistas.has(dropboxCarpeta)) continue;
        vistas.add(dropboxCarpeta);
        const detalle = String(c?.detalle ?? "").trim().slice(0, 500) || undefined;
        /*
          El propósito se CONSERVA. Si no se lo copiara acá, cualquier guardado desde el modal
          borraría en silencio lo que cargó el backfill: la carpeta volvería a resolverse por su
          nombre sin que nadie lo pidiera.

          Un valor que no está en la lista se descarta en vez de guardarse: mejor sin propósito
          —resuelve por nombre y se reporta— que con uno inventado que no resuelve nunca.
        */
        const proposito = esProposito(c?.proposito) ? c.proposito : undefined;
        carpetas.push({ dropboxCarpeta, detalle, proposito });
      }
      if (carpetas.length === 0) return { error: "La transición por carpeta de Dropbox necesita indicar al menos una carpeta a vigilar" };
      data.transicionAutomatica = { evento, carpetas };
    } else {
      data.transicionAutomatica = undefined; // null / {} / sin carpetas → se borra
    }
  }

  return { name, data };
}

/**
 * Cada tipo de contrato puede tener un solo estado impositivo: si otro ya lo tomó, no se puede
 * guardar. Devuelve el mensaje de error, o null si no hay conflicto.
 */
async function conflictoImpositivo(data: any, excluirId?: string): Promise<string | null> {
  if (!data?.esImpositivo) return null;

  const otros = await Info.find({ type: ESTADO_TYPE, "data.esImpositivo": true, ...(excluirId ? { _id: { $ne: excluirId } } : {}) }).lean();
  const tomados = new Map<string, string>();
  for (const otro of otros as any[]) {
    for (const id of otro.data?.contratoFrameIds || []) tomados.set(String(id), otro.name);
  }

  const chocan = (data.contratoFrameIds || []).filter((id: string) => tomados.has(String(id)));
  if (chocan.length === 0) return null;

  const porEstado = [...new Set(chocan.map((id: string) => tomados.get(String(id))))];
  return `Esos tipos de contrato ya tienen un estado impositivo: ${porEstado.join(", ")}`;
}

// POST /info/estados - crear estado
router.post("/estados", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const parsed = parseEstadoBody(req.body);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    if (parsed.data.transicionAutomatica && !tieneOrdenDependencia(parsed.data)) {
      res.status(400).json({ error: "Antes de configurar una transición automática, el estado tiene que estar asignado a un paso del flujo de dependencias" });
      return;
    }

    const existente = await Info.findOne({ type: ESTADO_TYPE, name: parsed.name }).lean();
    if (existente) {
      res.status(409).json({ error: "Ya existe un estado con ese nombre" });
      return;
    }

    const conflicto = await conflictoImpositivo(parsed.data);
    if (conflicto) {
      res.status(409).json({ error: conflicto });
      return;
    }

    const ultimoLocal = await Info.findOne({ type: ESTADO_TYPE, "data.id": { $gte: LOCAL_ESTADO_ID_BASE } })
      .sort({ "data.id": -1 })
      .lean();
    const nuevoId = Math.max(LOCAL_ESTADO_ID_BASE, Number((ultimoLocal as any)?.data?.id ?? 0) + 1);

    // Nuevo estado al final del orden visual actual (arrastrarlo después es lo que lo reubica).
    const ultimoOrden = await Info.findOne({ type: ESTADO_TYPE }).sort({ "data.orden": -1 }).lean();
    const nuevoOrden = Number((ultimoOrden as any)?.data?.orden ?? -1) + 1;

    const creado = await Info.create({
      type: ESTADO_TYPE,
      externalId: `local-${nuevoId}`,
      name: parsed.name,
      data: { ...parsed.data, id: nuevoId, orden: nuevoOrden },
    });

    res.status(201).json(creado.toObject());
  } catch (error) {
    console.error("Create estado error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /info/estados/reorder - guardar el orden visual tras arrastrar en el ABM.
// Tiene que registrarse ANTES de "/estados/:id": si no, Express matchea "reorder" como si fuera
// un :id y este endpoint nunca se alcanza (mismo cuidado que ya toma /shifts/reorder).
router.patch("/estados/reorder", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const items: Array<{ id: string; orden: number }> = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      res.status(400).json({ error: "Se requiere un array de items" });
      return;
    }

    // `Info` es una colección compartida por varios `type`: hay que confirmar que todos los ids
    // sean Estados de verdad antes de aplicar el bulk, para no corromper documentos de otro tipo.
    const ids = items.map((it) => String(it.id));
    const existentes = await Info.find({ _id: { $in: ids }, type: ESTADO_TYPE }).select("_id").lean();
    if (existentes.length !== ids.length) {
      res.status(400).json({ error: "Alguno de los estados no existe" });
      return;
    }

    const ops = items.map((it) => ({
      updateOne: { filter: { _id: it.id, type: ESTADO_TYPE }, update: { $set: { "data.orden": Number(it.orden) } } },
    }));
    await Info.bulkWrite(ops);

    res.json({ ok: true });
  } catch (error) {
    console.error("Reorder estados error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /info/estados/reorder-dependencia - guardar el "orden de dependencias" (flujo de pasos).
// Independiente del orden visual: cada estado lleva un número de paso; los que comparten número son
// alternativas del mismo paso. `ordenDependencia: null` saca al estado del flujo (se hace $unset).
// Igual que /estados/reorder, tiene que registrarse ANTES de "/estados/:id".
router.patch("/estados/reorder-dependencia", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const items: Array<{ id: string; ordenDependencia: number | null }> = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      res.status(400).json({ error: "Se requiere un array de items" });
      return;
    }

    // `Info` es compartida por varios `type`: confirmar que todos sean Estados antes del bulk.
    const ids = items.map((it) => String(it.id));
    const existentes = await Info.find({ _id: { $in: ids }, type: ESTADO_TYPE }).select("_id").lean();
    if (existentes.length !== ids.length) {
      res.status(400).json({ error: "Alguno de los estados no existe" });
      return;
    }

    const ops = items.map((it) => {
      const n = it.ordenDependencia;
      // Fuera del flujo → sin ordenDependencia. Una transición automática requiere estar en el flujo
      // (necesita saber su paso para calcular "hacia adelante"), así que si se saca del flujo se borra
      // junto con el paso, para no dejar una carpeta de Dropbox vigilada "huérfana" y bloqueada.
      const update =
        n === null || n === undefined
          ? { $unset: { "data.ordenDependencia": "", "data.transicionAutomatica": "" } }
          : { $set: { "data.ordenDependencia": Number(n) } };
      return { updateOne: { filter: { _id: it.id, type: ESTADO_TYPE }, update } };
    });
    await Info.bulkWrite(ops as any);

    res.json({ ok: true });
  } catch (error) {
    console.error("Reorder estados dependencia error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /info/estados/:id - editar estado
router.patch("/estados/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    // El estado se busca ANTES de parsear: las reglas de un estado de sistema dependen de lo que ya
    // está guardado, no de lo que manda el formulario (que no puede convertir uno en otro).
    const estado = await Info.findOne({ _id: req.params.id, type: ESTADO_TYPE });
    if (!estado) {
      res.status(404).json({ error: "Estado no encontrado" });
      return;
    }

    const parsed = parseEstadoBody(req.body, estado);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    if (parsed.data.transicionAutomatica && !tieneOrdenDependencia(parsed.data, estado)) {
      res.status(400).json({ error: "Antes de configurar una transición automática, el estado tiene que estar asignado a un paso del flujo de dependencias" });
      return;
    }

    const duplicado = await Info.findOne({ type: ESTADO_TYPE, name: parsed.name, _id: { $ne: estado._id } }).lean();
    if (duplicado) {
      res.status(409).json({ error: "Ya existe un estado con ese nombre" });
      return;
    }

    const conflicto = await conflictoImpositivo(parsed.data, String(estado._id));
    if (conflicto) {
      res.status(409).json({ error: conflicto });
      return;
    }

    // Se preserva `data.id`: es lo que referencian los contratos ya guardados (estado_id).
    //
    // El merge se hace sobre un objeto PLANO: al hacer spread del subdocumento de Mongoose se
    // arrastran las claves declaradas en el schema pero sin valor (ej. `transicionAutomatica`) como
    // `undefined`, y al reasignarlas Mongoose intenta castear ese `undefined` y tira
    // "Cast to Object failed" — el estado no se podía guardar (500) si no tenía transición
    // configurada. Por eso también se descartan las claves sin valor antes de asignar.
    const dataActual: any = typeof (estado.data as any)?.toObject === "function" ? (estado.data as any).toObject() : { ...((estado.data as any) || {}) };
    // `transicionAutomatica: undefined` con la clave PRESENTE significa "borrarla" (ver
    // parseEstadoBody); si la clave no vino, se preserva la que ya estaba.
    const borrarTransicion = Object.prototype.hasOwnProperty.call(parsed.data, "transicionAutomatica") && parsed.data.transicionAutomatica === undefined;

    const nuevaData: any = { ...dataActual, ...parsed.data, id: dataActual?.id };
    for (const k of Object.keys(nuevaData)) {
      if (nuevaData[k] === undefined) delete nuevaData[k];
    }
    if (borrarTransicion) delete nuevaData.transicionAutomatica;

    estado.name = parsed.name!;
    estado.data = nuevaData;
    estado.markModified("data");
    await estado.save();

    /*
      SE GUARDA PRIMERO Y SE VERIFICA DESPUÉS, a propósito.

      Que una carpeta no exista todavía en Dropbox es un aviso, no un error: se la puede configurar
      antes de crearla, y bloquear el guardado por eso obligaría a hacer las dos cosas en un orden
      que nadie pidió. Pero callarlo es lo que hoy hace que una ruta mal escrita no produzca ningún
      síntoma hasta que alguien nota que los contratos dejaron de avanzar.

      Si Dropbox no responde, no se avisa nada: un aviso disparado por un problema de red diría algo
      falso sobre la configuración.
    */
    const avisos: string[] = [];
    try {
      const cfg = getTenantDropboxConfig(await Tenant.findById(req.tenantObjectId).lean());
      if (cfg) {
        for (const c of (nuevaData.transicionAutomatica?.carpetas || []) as Array<{ dropboxCarpeta?: string }>) {
          if (!c.dropboxCarpeta) continue;
          try {
            await listFolder(String(req.tenantObjectId), cfg, c.dropboxCarpeta, true);
          } catch {
            avisos.push(`La carpeta «${c.dropboxCarpeta}» no existe en Dropbox. Se guardó igual, pero mientras no exista no va a llegar ningún archivo ahí y este estado no se va a disparar.`);
          }
        }
      }
    } catch {
      /* Dropbox no disponible: se guardó bien, no hay nada verificable que decir. */
    }

    res.json({ ...estado.toObject(), avisos });
  } catch (error) {
    console.error("Update estado error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* --------- ABM de Sedes (Info type "sede") ---------
 * Las sedes también llegan por la sincronización de FRAME (con su `externalId`/`data.id`), pero se
 * permite crearlas/editarlas/eliminarlas a mano. Las creadas localmente usan un `externalId` "local:N"
 * y un `data.id` incremental para distinguirlas y no chocar con las de FRAME. `data.codigoSucursal`
 * (5 díg.) es el código AFIP para el TXT de Alta masiva. */
const SEDE_TYPE = "sede";

/** Próximo `data.id` disponible para una sede nueva (evita colisión con las de FRAME). */
const nextSedeId = async (): Promise<number> => {
  const last = await Info.findOne({ type: SEDE_TYPE }).sort({ "data.id": -1 }).lean();
  return (Number((last as any)?.data?.id) || 0) + 1;
};

// POST /info/sede — crear sede manual
router.post("/sede", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    if (!nombre) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }
    const codigoSucursal = req.body?.codigoSucursal != null ? String(req.body.codigoSucursal).trim() : "";
    const externalIdIn = req.body?.externalId != null ? String(req.body.externalId).trim() : "";
    const id = await nextSedeId();
    const created = await Info.create({
      type: SEDE_TYPE,
      name: nombre,
      externalId: externalIdIn || `local:${id}`,
      data: { id, nombre, codigoSucursal },
    });
    res.status(201).json(created.toObject());
  } catch (error) {
    console.error("Create sede error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /info/sede/:id — editar sede (nombre, ID externo, código de sucursal)
router.patch("/sede/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const update: Record<string, any> = {};
    if (req.body?.nombre !== undefined) {
      const nombre = String(req.body.nombre).trim();
      if (!nombre) {
        res.status(400).json({ error: "El nombre es obligatorio" });
        return;
      }
      update.name = nombre;
      update["data.nombre"] = nombre;
    }
    if (req.body?.externalId !== undefined) {
      const ext = String(req.body.externalId).trim();
      if (ext) update.externalId = ext;
    }
    if (req.body?.codigoSucursal !== undefined) {
      update["data.codigoSucursal"] = req.body.codigoSucursal == null ? "" : String(req.body.codigoSucursal).trim();
    }
    const sede = await Info.findOneAndUpdate({ _id: req.params.id, type: SEDE_TYPE }, { $set: update }, { new: true }).lean();
    if (!sede) {
      res.status(404).json({ error: "Sede no encontrada" });
      return;
    }
    res.json(sede);
  } catch (error) {
    console.error("Update sede error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /info/sede/:id — eliminar sede
router.delete("/sede/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const borrado = await Info.findOneAndDelete({ _id: req.params.id, type: SEDE_TYPE }).lean();
    if (!borrado) {
      res.status(404).json({ error: "Sede no encontrada" });
      return;
    }
    res.json({ message: "Sede eliminada correctamente" });
  } catch (error) {
    console.error("Delete sede error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /info/estados/:id
router.delete("/estados/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    /*
      LOS DE SISTEMA NO SE BORRAN, y el corte va acá y no solo en el botón.

      Ocultarlo en el ABM alcanza para que no se toque por accidente, pero el endpoint sigue siendo
      un DELETE con un id: cualquier cosa que lo llame —una pestaña vieja abierta, un script— dejaría
      a la instalación sin uno de los dos trámites, y eso no se ve hasta que sale mal un TXT de ARCA.
    */
    const actual = await Info.findOne({ _id: req.params.id, type: ESTADO_TYPE }).lean();
    if (actual && esEstadoDeSistema((actual as any).data)) {
      res.status(409).json({ error: "Este estado es del sistema: se puede editar, pero no eliminar." });
      return;
    }

    const borrado = await Info.findOneAndDelete({ _id: req.params.id, type: ESTADO_TYPE }).lean();
    if (!borrado) {
      res.status(404).json({ error: "Estado no encontrado" });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete estado error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as infoRoutes };
