import fs from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { Types } from "mongoose";
import { Info } from "../models/Info.js";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import { Contrato } from "../models/Contrato.js";
import { Tenant } from "../models/Tenant.js";
import { IUserProject } from "../models/UserProject.js";
import { leerConstanciaTrabajador, leerConstanciaTrabajadorPdf, problemasDeConstancia } from "../utils/constanciaTrabajadorPdf.js";
import { getTenantDropboxConfig, uploadFile } from "./dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
import { aplicarTransicion, cargarEstadosPorEvento } from "./estadoTransicionAutomaticaService.js";
import { nombreArchivoDocumento } from "./nomenclaturaService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * EL PDF DEL ALTA DE UN CONTRATO: validarlo, guardarlo y mandarlo a donde corresponde.
 *
 * Un solo camino para las dos entradas del PDF —la subida a mano y la descarga desde ARCA
 * (`arca/constanciasAltas.ts`)—, así las dos validan y rutean igual.
 *
 * SI ES EL ALTA TEMPRANA, SE VALIDA ANTES DE GUARDAR. El PDF tiene que ser la «Constancia del
 * trabajador» de ARCA, decir Alta, y traer el CUIL, el CUIT de la empleadora y la fecha de inicio de
 * ESTE contrato. ARCA entrega por la misma impresora la constancia de BAJA cuando la relación ya
 * terminó, y un PDF de otra persona con el nombre de este contrato saldría a firmar igual. Si no
 * coincide no se guarda, no se archiva y no se envía: se devuelve por qué.
 *
 * La subida a mano también recibe la Constancia de CUIT (contratos de Servicios): esos no se tocan.
 * Se valida cuando el contrato está en el trámite de alta temprana, o cuando el PDF ES una
 * constancia del trabajador (aunque el contrato ya haya avanzado de estado).
 *
 * POR DÓNDE SIGUE EL ALTA YA VALIDADA. Un archivo, un lugar:
 *
 *   · el tipo de contrato la manda a firmar → va YA al Outbox de HelloSign, sola, y queda marcada
 *     como enviada (`altaEnviadaAFirmarEl`): el envío del contrato no la vuelve a mandar;
 *   · el tipo de contrato no la firma → se archiva en «Alta temprana de Arca/No firmar».
 *
 * Las dos con la nomenclatura de Altas de ARCA. Y en los dos casos el alta ya está: el contrato pasa
 * al estado que la carpeta de altas alimenta («Envío de documentación»), sin esperar ninguna firma.
 * Se avanza acá y no por el proceso de carpetas porque ese solo lee la raíz de cada una, y porque la
 * que va al Outbox no pasa por la de altas. El proceso, a su vez, sabe que el alta en el Outbox no
 * es el contrato (`esElAltaEnviada`).
 */
export interface RuteoAlta {
  vaAFirma: boolean;
  /** El path de Dropbox donde quedó. Sin esto, no se subió (ver `aviso`). */
  archivadaEn?: string;
  aviso?: string;
  /** El estado al que pasó el contrato, si avanzó. */
  estado?: string;
}

export type ResultadoAlta = { ok: false; problemas: string[] } | { ok: true; altaDocumentoUrl: string; altaDocumentoNombre: string; ruteo?: RuteoAlta };

export async function registrarAltaDeContrato(o: {
  tenantObjectId: any;
  up: IUserProject;
  idx: number;
  userId: string;
  buffer: Buffer;
  /** El archivo YA guardado en el storage local (`/storage/...`) y el nombre con el que llegó. */
  altaDocumentoUrl: string;
  altaDocumentoNombre: string;
  /** La descarga desde ARCA solo trae constancias de alta temprana: se valida siempre. */
  exigirConstancia?: boolean;
}): Promise<ResultadoAlta> {
  const { up, idx, userId, tenantObjectId } = o;
  const contratoActual: any = (up.contracts[idx] as any).toObject();
  const constancia = await leerConstanciaTrabajadorPdf(o.buffer).catch(() => leerConstanciaTrabajador(""));
  const estadoActual: any = contratoActual.estado_id != null ? await Info.findOne({ type: "estado-empleado", "data.id": contratoActual.estado_id }).select("data.tipoImpositivo").lean() : null;
  const esAltaTemprana = estadoActual?.data?.tipoImpositivo === "alta_temprana_afip" || !!contratoActual.altaArcaPresentada;
  const validarConstancia = !!o.exigirConstancia || esAltaTemprana || !!constancia.tipo;
  const persona: any = validarConstancia ? await User.findOne({ _id: userId, tenantId: tenantObjectId }).select("firstName lastName email metadata").lean() : null;
  if (validarConstancia) {
    const empresa: any = contratoActual.empresaContratoId ? await Company.findById(contratoActual.empresaContratoId).select("cuit").lean() : null;
    const problemas = problemasDeConstancia(constancia, { cuil: persona?.metadata?.cuit, empleadorCuit: empresa?.cuit, fechaInicio: contratoActual.fecha_alta_contrato });
    if (problemas.length > 0) return { ok: false, problemas };
  }

  // Reemplazo: borrar el archivo anterior del disco (best-effort, no bloquea la respuesta).
  const anterior = contratoActual.altaDocumentoUrl;
  if (anterior && typeof anterior === "string" && anterior !== o.altaDocumentoUrl) {
    fs.promises.unlink(path.join(__dirname, "../..", anterior.replace(/^\/storage\//, "storage/"))).catch(() => {});
  }

  let ruteo: RuteoAlta | undefined;
  let altaConstancia: Record<string, unknown> | undefined;
  if (validarConstancia) {
    const tipoContrato: any = Types.ObjectId.isValid(String(contratoActual.contrato_id || "")) ? await Contrato.findById(contratoActual.contrato_id).select("data.requiereFirmaAlta").lean() : null;
    // Sin el dato, sí: el mismo criterio que la pantalla (`contratoRequiereFirmaAlta`).
    ruteo = { vaAFirma: tipoContrato?.data?.requiereFirmaAlta !== false };
    let enviadaComo: string | undefined;
    try {
      const tenant = await Tenant.findById(tenantObjectId).lean();
      const cfg = getTenantDropboxConfig(tenant);
      const carpeta = await resolverCarpetaPorProposito(ruteo.vaAFirma ? "outbox" : "alta_temprana");
      if (!cfg || !carpeta) {
        ruteo.aviso = !cfg ? "Dropbox no está conectado: el alta quedó cargada en el contrato pero no se subió." : `No hay una carpeta de «${ruteo.vaAFirma ? "Outbox" : "Alta temprana de ARCA"}» configurada: el alta quedó cargada en el contrato pero no se subió.`;
      } else {
        const nombre = `${await nombreArchivoDocumento({ tenantId: tenantObjectId, tipo: "AltaAFIP", user: persona, up, contract: contratoActual, docName: "AltaAFIP" })}.pdf`;
        // Dropbox crea «No firmar» sola la primera vez: subir a un path arma las carpetas que falten.
        const destino = `${carpeta.replace(/\/$/, "")}${ruteo.vaAFirma ? "" : "/No firmar"}/${nombre}`;
        await uploadFile(String(tenantObjectId), cfg, destino, o.buffer, true);
        ruteo.archivadaEn = destino;
        enviadaComo = nombre;
      }
    } catch (e: any) {
      console.error("Alta temprana: no se pudo subir a Dropbox:", e?.message || e);
      ruteo.aviso = "No se pudo subir el alta a Dropbox. Quedó cargada en el contrato: volvé a cargarla para reintentar.";
    }
    altaConstancia = { clave: constancia.clave || undefined, nroTramite: constancia.nroTramite || undefined, validadaEl: new Date(), vaAFirma: ruteo.vaAFirma, archivadaEn: ruteo.archivadaEn, enviadaComo };
  }

  const conAlta: any = { ...(up.contracts[idx] as any).toObject(), altaDocumentoUrl: o.altaDocumentoUrl, altaDocumentoNombre: o.altaDocumentoNombre };
  if (altaConstancia) {
    conAlta.altaConstancia = altaConstancia;
    // Enviada = quedó en el Outbox. Si no se pudo subir, no se marca: viaja con el contrato cuando
    // se lo envíe a firmar, que es el camino de antes, y tampoco sale dos veces.
    conAlta.altaEnviadaAFirmarEl = ruteo?.vaAFirma && ruteo.archivadaEn ? new Date() : undefined;
    // La clave de alta que da ARCA: es la que la presentación no pudo leer de la pantalla.
    if (conAlta.altaArcaPresentada && constancia.clave) conAlta.altaArcaPresentada = { ...conAlta.altaArcaPresentada, cat: constancia.clave };
  }
  up.contracts[idx] = conAlta;
  up.markModified("contracts");
  await up.save();

  if (ruteo) {
    try {
      const destino = (await cargarEstadosPorEvento("dropbox_carpeta")).find((e: any) => (e.data?.transicionAutomatica?.carpetas || []).some((c: any) => ([] as string[]).concat(c.proposito || []).includes("alta_temprana")));
      if (destino) {
        const r = await aplicarTransicion(up, idx, destino);
        if (r.aplicada) ruteo.estado = destino.name;
      }
    } catch (e: any) {
      console.error("Alta temprana: no se pudo avanzar el estado:", e?.message || e);
    }
  }
  return { ok: true, altaDocumentoUrl: o.altaDocumentoUrl, altaDocumentoNombre: o.altaDocumentoNombre, ruteo };
}

/** Guarda en el storage local un PDF que no llegó por formulario (la descarga desde ARCA). Devuelve su URL. */
export async function guardarPdfDeAlta(o: { tenantCarpeta: string; userId: string; buffer: Buffer }): Promise<{ url: string; ruta: string }> {
  const dir = path.join(__dirname, "../../storage", o.tenantCarpeta, o.userId, "contratos");
  await fs.promises.mkdir(dir, { recursive: true });
  const archivo = `constancia-alta-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`;
  const ruta = path.join(dir, archivo);
  await fs.promises.writeFile(ruta, o.buffer);
  return { url: `/storage/${o.tenantCarpeta}/${o.userId}/contratos/${archivo}`, ruta };
}
