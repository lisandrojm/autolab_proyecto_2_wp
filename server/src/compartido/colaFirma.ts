/**
 * LA COLA DE ENVÍO A LA FIRMA, COMO SE LA EXPLICA A LA PERSONA (25/10/2026). Lógica pura: sin base ni
 * Dropbox, para poder probarla.
 *
 *  · `categoriaDeTrabado`: un documento frenado («requiere revisión») por UNA razón, y cada razón con su
 *    salida. Antes era una lista plana con el motivo repetido y sólo «Previsualizar» al lado.
 *  · `estadoDelPanel`: en qué estado está el envío y qué va a pasar, en castellano. Antes el único
 *    mensaje era «Todavía no pasaron 4 h desde la última corrida», que no decía cuándo ni qué hacer.
 */

export type TipoTrabado = "sin_regla" | "ancla" | "pagina_intermedia" | "sin_firmante" | "pdf_cambiado" | "fuera_outbox" | "sin_codigo" | "otro";

export interface AccionTrabado {
  texto: string;
  /** Adónde lleva: una ruta de la app, o «previsualizar» (la previsualización del bot sobre ese archivo). */
  destino: string;
}

export interface CategoriaTrabado {
  tipo: TipoTrabado;
  /** En una línea, qué pasó. */
  titulo: string;
  /** Qué hacer. */
  accion: AccionTrabado;
}

const CATEGORIAS: Record<TipoTrabado, Omit<CategoriaTrabado, "tipo">> = {
  sin_regla: { titulo: "sin regla de colocación de la firma (y el PDF no trae posición declarada)", accion: { texto: "Definir regla", destino: "/dropbox-sign?tab=envio#reglas" } },
  ancla: { titulo: "la regla existe pero su rótulo no aparece en el PDF", accion: { texto: "Ver el PDF y ajustar la regla", destino: "previsualizar" } },
  pagina_intermedia: { titulo: "la firma cae en una página del medio (el bot sólo coloca en la primera o la última)", accion: { texto: "Abrir la plantilla", destino: "/contratos-frame" } },
  sin_firmante: { titulo: "sin firmante: falta el nombre o el email en la base", accion: { texto: "Completar en la ficha", destino: "/users" } },
  pdf_cambiado: { titulo: "el PDF del Outbox no es el que se generó con la plantilla", accion: { texto: "Ver el PDF", destino: "previsualizar" } },
  fuera_outbox: { titulo: "ya no está en el Outbox (se movió a Pendbox o se borró)", accion: { texto: "Sacar de la lista", destino: "descartar" } },
  sin_codigo: { titulo: "el nombre no trae el código del documento (ID-NNNNNN)", accion: { texto: "Ver el archivo", destino: "previsualizar" } },
  otro: { titulo: "otro motivo", accion: { texto: "Ver el PDF", destino: "previsualizar" } },
};

/** De qué tipo es un motivo de «requiere revisión» (los textos los arman el bot y las reglas). */
export function categoriaDeTrabado(motivo: string): CategoriaTrabado {
  const m = String(motivo || "");
  const tipo: TipoTrabado = /sin regla de colocaci[oó]n/i.test(m)
    ? "sin_regla"
    : /p[aá]gina (del medio|\d+ de \d+:)|una del medio|s[oó]lo (sabe colocar|navega|coloca) (en|a) la primera/i.test(m)
      ? "pagina_intermedia"
      : /no es el que se gener[oó] con la plantilla/i.test(m)
        ? "pdf_cambiado"
        : /ya no est[aá] en Outbox|^No est[aá] en Outbox/i.test(m)
          ? "fuera_outbox"
          : /firmante|no tiene nombre o email|No hay usuario para el c[oó]digo|no trae c[oó]digo ni email/i.test(m)
            ? "sin_firmante"
            : /no trae el c[oó]digo del documento/i.test(m)
              ? "sin_codigo"
              : /Ancla .* no encontrada|no pasa las validaciones|No se pudo leer el texto del PDF/i.test(m)
                ? "ancla"
                : "otro";
  return { tipo, ...CATEGORIAS[tipo] };
}

/** Los trabados agrupados por motivo, de más a menos. */
export function agruparTrabados<T extends { detalle: string }>(items: T[]): Array<CategoriaTrabado & { cantidad: number; items: T[] }> {
  const grupos = new Map<TipoTrabado, CategoriaTrabado & { cantidad: number; items: T[] }>();
  for (const it of items) {
    const c = categoriaDeTrabado(it.detalle);
    const g = grupos.get(c.tipo) || { ...c, cantidad: 0, items: [] };
    g.cantidad++;
    g.items.push(it);
    grupos.set(c.tipo, g);
  }
  return [...grupos.values()].sort((a, b) => b.cantidad - a.cantidad);
}

export type TipoEstadoPanel = "enviando" | "enfriamiento" | "sin_sesion" | "tope" | "fuera_de_horario" | "nada" | "lista" | "manual";

export interface EntradaPanel {
  corriendo: boolean;
  /** Sólo durante la corrida. */
  progreso?: { hechos: number; total: number; actual: string | null };
  tieneSesion: boolean;
  conexionCaida: boolean;
  enfriadoHasta: Date | null;
  /** Lo que queda en la ventana de 24 h. */
  cupo: number;
  /** Cuándo se libera el próximo lugar de la ventana, si el cupo está en 0. */
  liberaAt: Date | null;
  enCola: number;
  trabados: number;
  envioAutomatico: boolean;
  horaDesde: number;
  horaHasta: number;
  horaActual: number;
  proximaTandaAt: Date | null;
}

const hora = (d: Date) => d.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });

/** En qué estado está el envío, con la razón y qué va a pasar. El primero que aplica manda. */
export function estadoDelPanel(e: EntradaPanel, ahora = new Date()): { tipo: TipoEstadoPanel; texto: string } {
  if (e.corriendo) {
    const p = e.progreso;
    return { tipo: "enviando", texto: p && p.total ? `Enviando ${Math.min(p.hechos + 1, p.total)} de ${p.total}${p.actual ? ` — ${p.actual}` : ""}` : "Enviando…" };
  }
  if (!e.tieneSesion || e.conexionCaida) return { tipo: "sin_sesion", texto: e.conexionCaida ? "La conexión con Dropbox Sign está caída → Conectarse" : "La sesión de Dropbox Sign no está guardada → Conectarse" };
  if (e.enfriadoHasta && e.enfriadoHasta.getTime() > ahora.getTime()) return { tipo: "enfriamiento", texto: `Dropbox Sign frenó los envíos. Pausado: reintenta a las ${hora(e.enfriadoHasta)}` };
  if (e.cupo <= 0) return { tipo: "tope", texto: `Se llegó al tope estimado de las últimas 24 h.${e.liberaAt ? ` Se libera un lugar a las ${hora(e.liberaAt)}` : ""}` };
  if (e.enCola === 0) return { tipo: "nada", texto: e.trabados > 0 ? `No hay documentos en la cola. ${e.trabados} trabado(s) → Revisar` : "No hay documentos en la cola: encolalos desde la lista (o «Encolar todo lo elegible»)." };
  const entran = Math.min(e.enCola, e.cupo);
  if (!e.envioAutomatico) return { tipo: "manual", texto: `${entran} entran ahora · el envío automático está apagado: salen con «Enviar ahora»` };
  if (e.horaActual < e.horaDesde || e.horaActual >= e.horaHasta) return { tipo: "fuera_de_horario", texto: `Fuera de la ventana configurada (${e.horaDesde}–${e.horaHasta} h)${e.proximaTandaAt ? ` · próxima tanda ${hora(e.proximaTandaAt)}` : ""}` };
  return { tipo: "lista", texto: `${entran} entran en las próximas 24 h${e.proximaTandaAt ? ` · próxima tanda ${hora(e.proximaTandaAt)}` : ""}` };
}

/**
 * El cupo de la ventana MÓVIL de 24 h. Dropbox Sign no corta por día calendario: libera de a poco a
 * medida que se cumplen 24 h de cada envío (medido: tras 124 envíos en una jornada, al día siguiente
 * liberó 11 a la 01:00 y 22 más a las 06:00). `enviados` son los instantes de los envíos de las últimas
 * 24 h. Devuelve cuánto queda y cuándo se libera el próximo lugar si no queda nada.
 */
export function cupoVentana24h(tope: number, enviados: Date[], ahora = new Date()): { usados: number; cupo: number; liberaAt: Date | null } {
  const desde = ahora.getTime() - 24 * 3600_000;
  const recientes = enviados.map((d) => new Date(d).getTime()).filter((t) => t > desde).sort((a, b) => a - b);
  const cupo = Math.max(0, tope - recientes.length);
  // Si no queda lugar, se libera cuando el envío número (usados - tope + 1) más viejo cumple 24 h.
  const liberaAt = cupo > 0 || recientes.length === 0 ? null : new Date(recientes[Math.max(0, recientes.length - tope)] + 24 * 3600_000);
  return { usados: recientes.length, cupo, liberaAt };
}

/**
 * EL ORDEN AUTOMÁTICO DE LA COLA: DE MÁS RECIENTE A MENOS RECIENTE (pedido del 26/10/2026). Manda la
 * fecha del archivo en el Outbox (la columna «Fecha» de Para Firmar). Lo que ya no está en el Outbox
 * no tiene fecha y va al final, por encolado más nuevo. A igual fecha, el código más alto primero.
 */
export function ordenPorRecientes<T extends { archivo: string; codigo: string; encoladoAt?: Date | string | null }>(items: T[], fechas: Map<string, Date | string>): T[] {
  const ms = (d: unknown) => (d ? new Date(d as any).getTime() || 0 : 0);
  const num = (c: string) => Number(String(c || "").replace(/\D/g, "")) || 0;
  return [...items].sort((a, b) => {
    const fa = ms(fechas.get(a.archivo));
    const fb = ms(fechas.get(b.archivo));
    if (!!fa !== !!fb) return fa ? -1 : 1;
    return fb - fa || (fa ? 0 : ms(b.encoladoAt) - ms(a.encoladoAt)) || num(b.codigo) - num(a.codigo);
  });
}
