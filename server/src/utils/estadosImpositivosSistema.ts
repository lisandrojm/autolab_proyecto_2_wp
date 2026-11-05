/**
 * LOS DOS ESTADOS IMPOSITIVOS SON DEL SISTEMA. Siempre existen y no se pueden borrar.
 *
 * Todo contrato declara uno de los dos trámites: o es un alta temprana ante ARCA, o es una locación
 * de servicios. No es una preferencia de cada productora — es cómo se declara el vínculo ante el
 * organismo—, así que no puede depender de que alguien se acuerde de crearlos en el ABM.
 *
 * El problema real era ese: si alguien los borraba, o si un tenant nuevo arrancaba sin ellos, el
 * wizard se quedaba sin ningún estado que ofrecer y las altas entraban sin trámite declarado. Y eso
 * no se nota en la pantalla: se nota cuando el TXT de ARCA sale mal.
 *
 * SE CREAN SIN TIPOS DE CONTRATO ASOCIADOS, a propósito. Qué tipo de contrato lleva cuál lo decide
 * cada productora en el ABM; el sistema garantiza que los dos estados estén, no a qué se aplican.
 *
 * SE RECONOCEN POR SU TRÁMITE, NO POR EL NOMBRE (05/11/2026). Se buscaban sólo por nombre: alguien
 * renombró «Pedido de AFIP» a «AFIP» y, como esto corre cada vez que se lista, al instante se creó otro
 * «Pedido de AFIP» al lado. Ahora un estado de sistema con ese `tipoImpositivo` ya cuenta, se llame como
 * se llame. Renombrarlo es legítimo: el PATCH de `routes/info.ts` lleva el nombre nuevo a los contratos.
 *
 * ADOPTA, NO DUPLICA. Si ya hay un estado con la misma clave canónica —«Falta pedido de AFIP» es el
 * mismo que «Pedido de AFIP»— se lo marca como de sistema y se le completa SOLO lo que le falte.
 * Nunca se pisa un valor ya configurado: el color, la etiqueta o los tipos que cargó alguien quedan
 * como están. Crear uno nuevo al lado dejaría dos estados para el mismo trámite, que es peor que el
 * problema que esto resuelve.
 *
 * Se llaman AFIP y SERVICIOS desde el 05/11/2026 (pedido del usuario). «Pedido de AFIP», «Falta pedido
 * de AFIP» y «Pedido de Servicios» son alias de esos dos (`claveEstado`): un contrato que llegue con un
 * nombre viejo cae en el mismo estado.
 */

import { Info } from "../models/Info.js";
import { SemillaAplicada } from "../models/SemillaAplicada.js";
import { claveEstado } from "./estadoClave.js";

export const ESTADO_TYPE = "estado-empleado";

/** El paso de los estados impositivos: el 1 es «Solicitud pendiente». El ABM y el editor lo fijan. */
export const PASO_IMPOSITIVOS = 2;

/** Dónde se guarda el `.json` de cada solicitud, si nadie configuró otra carpeta (`espejoDropboxSolicitudes.ts`). */
export const CARPETA_SOLICITUDES = "/WEPRODU/Solicitudes";

/** Los ids de FRAME son bajos; los locales arrancan bien arriba para no pisarlos nunca. */
const LOCAL_ESTADO_ID_BASE = 100000;

export interface EstadoImpositivoSistema {
  /** Nombre con el que se crea si no existe ninguno con su clave. */
  name: string;
  tipoImpositivo: "alta_temprana_afip" | "constancia_cuit";
  /** Texto del badge secundario en las tarjetas de Contrato. */
  etiquetaSecundaria: string;
  color: string;
  orden: number;
}

export const ESTADOS_IMPOSITIVOS_SISTEMA: EstadoImpositivoSistema[] = [
  { name: "AFIP", tipoImpositivo: "alta_temprana_afip", etiquetaSecundaria: "Alta ARCA", color: "#b91c1c", orden: 0 },
  { name: "SERVICIOS", tipoImpositivo: "constancia_cuit", etiquetaSecundaria: "Alta Servicios", color: "#c2410c", orden: 1 },
];

export const NOMBRE_ESTADO_SOLICITUD = "Solicitud pendiente";
/** El ámbar del tag «SOLICITUD PENDIENTE» de la tabla de Solicitudes: es lo mismo y se ve igual. */
const COLOR_ESTADO_SOLICITUD = "#b45309";
const SEMILLA_SOLICITUD = "estado-solicitud-de-contratacion";
const SEMILLA_NOMBRE_SOLICITUD = "estado-solicitud-pendiente";

/**
 * EL PRIMER PASO DEL CIRCUITO: «SOLICITUD PENDIENTE» (05/11/2026, pedido del usuario: tiene que
 * ser un estado como los demás). Es de sistema y va en el Paso 1, con su carpeta de Dropbox, donde cada
 * solicitud deja su `.json` (`espejoDropboxSolicitudes.ts`).
 *
 * NINGÚN CONTRATO ESTÁ EN ESTE ESTADO: el contrato recién nace al aprobar la solicitud, ya en su trámite.
 * Por eso lleva `esSolicitud` además de `esSistema`: no es impositivo (`parseEstadoBody`) y el escaneo de
 * Dropbox no lo mira (`cargarEstadosPorEvento`), porque en su carpeta no hay nada que mueva contratos.
 *
 * CORRE LOS PASOS UNA SOLA VEZ: todo estado del flujo baja uno (los impositivos quedan en el 2). Los
 * contratos no se tocan: guardan el estado, no el número, y sólo importa el orden relativo. Con
 * `SemillaAplicada` de candado, porque esto corre en cada listado y dos a la vez correrían dos veces.
 */
async function ensureEstadoSolicitud(): Promise<boolean> {
  if (await Info.exists({ type: ESTADO_TYPE, "data.esSolicitud": true })) return false;
  const marca = await SemillaAplicada.updateOne({ clave: SEMILLA_SOLICITUD }, { $setOnInsert: { clave: SEMILLA_SOLICITUD, aplicadaEl: new Date() } }, { upsert: true });
  if (marca.upsertedCount === 0) return false;
  try {
    await Info.updateMany({ type: ESTADO_TYPE, "data.ordenDependencia": { $type: "number" } }, { $inc: { "data.ordenDependencia": 1 } });
    const ultimoLocal = await Info.findOne({ type: ESTADO_TYPE, "data.id": { $gte: LOCAL_ESTADO_ID_BASE } }).sort({ "data.id": -1 }).lean();
    const id = Math.max(LOCAL_ESTADO_ID_BASE, Number((ultimoLocal as any)?.data?.id ?? 0) + 1);
    await Info.create({
      type: ESTADO_TYPE,
      externalId: `local-${id}`,
      name: NOMBRE_ESTADO_SOLICITUD,
      data: {
        id,
        nombre: NOMBRE_ESTADO_SOLICITUD,
        esSistema: true,
        esSolicitud: true,
        color: COLOR_ESTADO_SOLICITUD,
        contratoFrameIds: [],
        orden: -1,
        ordenDependencia: 1,
        transicionAutomatica: { evento: "dropbox_carpeta", carpetas: [{ dropboxCarpeta: CARPETA_SOLICITUDES, proposito: "solicitudes" }] },
      },
    });
    return true;
  } catch (error) {
    await SemillaAplicada.deleteOne({ clave: SEMILLA_SOLICITUD });
    throw error;
  }
}

/**
 * Nació como «Solicitud de contratación» y la tabla de Solicitudes decía «SOLICITUD PENDIENTE»: dos
 * nombres para lo mismo. Quedó el del tag (05/11/2026). UNA SOLA VEZ, con candado, porque el nombre es
 * editable: si alguien después lo cambia, esto no se lo pisa. El color, sólo si seguía el violeta original.
 * Ningún contrato guarda este nombre (ninguno está en este estado), así que no hay nada que propagar.
 */
async function renombrarEstadoSolicitud(): Promise<void> {
  const marca = await SemillaAplicada.updateOne({ clave: SEMILLA_NOMBRE_SOLICITUD }, { $setOnInsert: { clave: SEMILLA_NOMBRE_SOLICITUD, aplicadaEl: new Date() } }, { upsert: true });
  if (marca.upsertedCount === 0) return;
  try {
    const delEstado = { type: ESTADO_TYPE, "data.esSolicitud": true };
    await Info.updateOne({ ...delEstado, name: "Solicitud de contratación" }, { $set: { name: NOMBRE_ESTADO_SOLICITUD, "data.nombre": NOMBRE_ESTADO_SOLICITUD } });
    await Info.updateOne({ ...delEstado, "data.color": "#6d28d9" }, { $set: { "data.color": COLOR_ESTADO_SOLICITUD } });
  } catch (error) {
    await SemillaAplicada.deleteOne({ clave: SEMILLA_NOMBRE_SOLICITUD });
    throw error;
  }
}

/** ¿Este estado (su `data`) es uno de los dos de sistema? */
export const esEstadoDeSistema = (data: any): boolean => data?.esSistema === true;

/**
 * Deja los dos estados creados. Idempotente: se puede correr en cada arranque.
 *
 * Devuelve qué hizo, para que el log del arranque lo diga en vez de quedar en silencio.
 */
export async function ensureEstadosImpositivosSistema(): Promise<{ creados: string[]; adoptados: string[] }> {
  const creados: string[] = [];
  const adoptados: string[] = [];
  // Antes que los impositivos: corre los pasos, y un impositivo recién creado ya nace en el suyo.
  if (await ensureEstadoSolicitud()) creados.push(NOMBRE_ESTADO_SOLICITUD);
  await renombrarEstadoSolicitud();

  const existentes = await Info.find({ type: ESTADO_TYPE }).lean();
  const porClave = new Map<string, any>();
  for (const e of existentes as any[]) porClave.set(claveEstado(e.name), e);

  for (const semilla of ESTADOS_IMPOSITIVOS_SISTEMA) {
    const yaEsta = (existentes as any[]).find((e) => e.data?.esSistema === true && e.data?.tipoImpositivo === semilla.tipoImpositivo) ?? porClave.get(claveEstado(semilla.name));

    if (yaEsta) {
      /*
        Solo se agrega lo que falta. `esSistema` es lo único que se fuerza —es la marca que hace que
        no se pueda borrar, y es el punto de todo esto—; el resto entra únicamente si el campo está
        vacío, para no pisar lo que configuró la productora.
      */
      const data = yaEsta.data || {};
      const set: Record<string, unknown> = {};
      if (data.esSistema !== true) set["data.esSistema"] = true;
      if (data.esImpositivo !== true) set["data.esImpositivo"] = true;
      if (!data.tipoImpositivo) set["data.tipoImpositivo"] = semilla.tipoImpositivo;
      if (!data.etiquetaSecundaria) set["data.etiquetaSecundaria"] = semilla.etiquetaSecundaria;
      if (!data.color) set["data.color"] = semilla.color;
      // Los impositivos van al Paso 1 del flujo de dependencias (misma regla que el ABM).
      if (typeof data.ordenDependencia !== "number") set["data.ordenDependencia"] = PASO_IMPOSITIVOS;

      if (Object.keys(set).length > 0) {
        await Info.updateOne({ _id: yaEsta._id }, { $set: set });
        adoptados.push(yaEsta.name);
      }
      continue;
    }

    // No existe ninguno con esa clave: se crea. El id local no puede pisar los de FRAME.
    const ultimoLocal = await Info.findOne({ type: ESTADO_TYPE, "data.id": { $gte: LOCAL_ESTADO_ID_BASE } })
      .sort({ "data.id": -1 })
      .lean();
    const nuevoId = Math.max(LOCAL_ESTADO_ID_BASE, Number((ultimoLocal as any)?.data?.id ?? 0) + 1);

    await Info.create({
      type: ESTADO_TYPE,
      externalId: `local-${nuevoId}`,
      name: semilla.name,
      data: {
        id: nuevoId,
        nombre: semilla.name,
        esSistema: true,
        esImpositivo: true,
        tipoImpositivo: semilla.tipoImpositivo,
        etiquetaSecundaria: semilla.etiquetaSecundaria,
        color: semilla.color,
        colorEtiquetaSecundaria: semilla.color,
        // Sin tipos de contrato: a cuáles se aplica lo decide cada productora en el ABM.
        contratoFrameIds: [],
        orden: semilla.orden,
        ordenDependencia: PASO_IMPOSITIVOS,
      },
    });
    creados.push(semilla.name);
    // El siguiente de la vuelta tiene que ver este id: se refresca el mapa por las dudas de que
    // las dos semillas caigan en la misma corrida.
    porClave.set(claveEstado(semilla.name), { name: semilla.name });
  }

  return { creados, adoptados };
}
