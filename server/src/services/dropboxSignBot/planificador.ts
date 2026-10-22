import { leerAnclas } from "../../utils/anclasNombre.js";
import { tipoDeDocumento } from "./reglas.js";

/**
 * QUÉ SE ENVÍA EN LA PRÓXIMA TANDA, y si corresponde enviar ahora. Lógica pura (sin Dropbox ni base):
 * recibe el listado del Outbox ya leído, los envíos ya registrados y el estado del throttle, y
 * devuelve la tanda, lo que requiere revisión y por qué no se corre si no se corre.
 *
 * Orden: por nombre de archivo, ascendente. Dedupe duro por código: lo que ya figura `enviado` no
 * vuelve a salir aunque siga en Outbox (el IMAP lo mueve a los ~2 min).
 */

export interface ConfigEnvio {
  activo: boolean;
  tamanoTanda: number;
  intervaloHoras: number;
  topeDiario: number;
  enfriamientoHoras: number;
  horaDesde: number;
  horaHasta: number;
}

export const CONFIG_POR_DEFECTO: ConfigEnvio = { activo: false, tamanoTanda: 10, intervaloHoras: 4, topeDiario: 40, enfriamientoHoras: 6, horaDesde: 8, horaHasta: 22 };

export interface EstadoThrottle {
  contadorDia: { fecha: string; enviados: number };
  enfriadoHasta: Date | null;
  ultimaCorridaAt: Date | null;
}

/** Un archivo del Outbox ya resuelto contra la base (o no). */
export interface ArchivoResuelto {
  archivo: string;
  /** Email y nombre del firmante, ya decididos (la base manda sobre el nombre de archivo). `null` si no se pudo resolver. */
  firmante: { nombre: string; email: string } | null;
  /** Por qué no se pudo resolver, para el log. */
  motivoSinFirmante?: string;
}

export interface Candidato {
  archivo: string;
  codigo: string;
  tipo: string;
  email: string;
  firmante: string;
}

export interface RequiereRevision {
  archivo: string;
  codigo: string;
  motivo: string;
}

export interface Plan {
  tanda: Candidato[];
  requiereRevision: RequiereRevision[];
  /** Ya enviados (en Outbox todavía porque el IMAP no los movió). */
  yaEnviados: string[];
  /** Cuántos quedan para tandas siguientes. */
  pendientesDespues: number;
  /** Cupo que queda hoy. */
  cupoHoy: number;
}

/** La fecha (YYYY-MM-DD) y la hora (0-23) en Argentina. */
export function fechaYHoraArgentina(ahora: Date): { fecha: string; hora: number } {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(ahora);
  const de = (t: string) => partes.find((p) => p.type === t)?.value || "";
  return { fecha: `${de("year")}-${de("month")}-${de("day")}`, hora: Number(de("hour")) % 24 };
}

export const cupoDelDia = (config: ConfigEnvio, estado: EstadoThrottle, ahora: Date): number => {
  const { fecha } = fechaYHoraArgentina(ahora);
  const enviadosHoy = estado.contadorDia?.fecha === fecha ? estado.contadorDia.enviados || 0 : 0;
  return Math.max(0, config.topeDiario - enviadosHoy);
};

/**
 * ¿Le toca correr al scheduler ahora? Devuelve el motivo si no. (El botón «Enviar tanda ahora» no
 * pasa por acá salvo por el enfriamiento y el cupo: es una decisión de la persona.)
 */
export function puedeCorrer(config: ConfigEnvio, estado: EstadoThrottle, ahora: Date, opciones: { manual?: boolean } = {}): { ok: boolean; motivo?: string } {
  if (estado.enfriadoHasta && estado.enfriadoHasta.getTime() > ahora.getTime()) {
    return { ok: false, motivo: `Enfriamiento por el freno de Dropbox Sign hasta las ${estado.enfriadoHasta.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}.` };
  }
  if (cupoDelDia(config, estado, ahora) <= 0) return { ok: false, motivo: `Se alcanzó el tope diario (${config.topeDiario}).` };
  if (opciones.manual) return { ok: true };
  if (!config.activo) return { ok: false, motivo: "El envío automático está desactivado." };
  const { hora } = fechaYHoraArgentina(ahora);
  if (hora < config.horaDesde || hora >= config.horaHasta) return { ok: false, motivo: `Fuera de la ventana horaria (${config.horaDesde} a ${config.horaHasta} h).` };
  if (estado.ultimaCorridaAt && ahora.getTime() - estado.ultimaCorridaAt.getTime() < config.intervaloHoras * 3600_000) {
    return { ok: false, motivo: `Todavía no pasaron ${config.intervaloHoras} h desde la última corrida.` };
  }
  return { ok: true };
}

/** La tanda a enviar y lo que queda afuera, a partir del Outbox resuelto. */
export function planificar(archivos: ArchivoResuelto[], codigosEnviados: Set<string>, config: ConfigEnvio, estado: EstadoThrottle, ahora: Date): Plan {
  const ordenados = [...archivos].filter((a) => /\.pdf$/i.test(a.archivo)).sort((a, b) => a.archivo.localeCompare(b.archivo));
  const tanda: Candidato[] = [];
  const requiereRevision: RequiereRevision[] = [];
  const yaEnviados: string[] = [];
  let pendientesDespues = 0;
  const cupoHoy = cupoDelDia(config, estado, ahora);
  const tope = Math.max(0, Math.min(config.tamanoTanda, cupoHoy));
  const vistos = new Set<string>();

  for (const a of ordenados) {
    const { codigo } = leerAnclas(a.archivo);
    if (!codigo) {
      requiereRevision.push({ archivo: a.archivo, codigo: "", motivo: "El nombre no trae el código del documento (ID-NNNNNN): no se puede garantizar que no se envíe dos veces." });
      continue;
    }
    if (vistos.has(codigo)) {
      requiereRevision.push({ archivo: a.archivo, codigo, motivo: `Hay otro archivo en Outbox con el mismo código ${codigo}.` });
      continue;
    }
    vistos.add(codigo);
    if (codigosEnviados.has(codigo)) {
      yaEnviados.push(a.archivo);
      continue;
    }
    const tipo = tipoDeDocumento(a.archivo);
    if (!tipo) {
      requiereRevision.push({ archivo: a.archivo, codigo, motivo: "Tipo de documento sin regla de colocación de la firma: no se envía hasta que se defina." });
      continue;
    }
    if (!a.firmante) {
      requiereRevision.push({ archivo: a.archivo, codigo, motivo: a.motivoSinFirmante || "No se pudo resolver al firmante." });
      continue;
    }
    if (tanda.length < tope) tanda.push({ archivo: a.archivo, codigo, tipo, email: a.firmante.email, firmante: a.firmante.nombre });
    else pendientesDespues++;
  }
  return { tanda, requiereRevision, yaEnviados, pendientesDespues, cupoHoy };
}
