import { Tenant } from "../../models/Tenant.js";
import { CandadoArcaOcupado, quienTiene } from "./candadoArca.js";
import { arrancarDescargaConstancias, descargaConstanciasDe } from "./constanciasAltas.js";
import { ubicarDespuesDeBajar } from "./descargaConstanciasAutomatica.js";
import { crearColaEncadenada, hayPresentacionesEnFila, type ResultadoEncadenada, type TandaPresentada } from "./colaEncadenada.js";

/**
 * BAJAR LAS CONSTANCIAS AL PRESENTARSE EL ALTA (11/11/2026): el cableado real de `colaEncadenada.ts`.
 *
 * `encadenarDescarga` la llama cada corrida de altas al terminar (`corridaAltas.ts`), con las altas que
 * ARCA aceptó. La descarga es la de siempre (`arrancarDescargaConstancias`: una persona por vez, con
 * pausa, una pestaña por descarga), sólo de esas altas y sin el tope diario.
 *
 * LA SESIÓN. No se reutiliza el navegador de la presentación: esa corrida guarda la sesión y cierra, y
 * la descarga abre el suyo con la sesión guardada (no vuelve a loguearse). Compartir el navegador
 * obligaba a tocar el motor de altas, que es lo más delicado que hay acá, para ahorrar unos segundos.
 */

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** «Bajar constancias al presentar»: prendido salvo que el tenant lo haya apagado. */
export const bajaAlPresentar = (descargaConstancias: { alPresentar?: boolean } | null | undefined): boolean => descargaConstancias?.alPresentar !== false;

const cola = crearColaEncadenada({
  activa: async (tenantId) => {
    const t: any = await Tenant.findById(tenantId).select("integrations.arcaSimplificacion.descargaConstancias.alPresentar").lean();
    return bajaAlPresentar(t?.integrations?.arcaSimplificacion?.descargaConstancias);
  },
  libre: (tenantId) => !quienTiene(tenantId) && !hayPresentacionesEnFila(tenantId),
  arrancar: (t) =>
    arrancarDescargaConstancias({
      tenantId: t.tenantId,
      tenantObjectId: t.tenantObjectId,
      // La carpeta del tenant en el storage es su id (ver `middleware/tenant.ts`).
      tenantCarpeta: t.tenantId,
      empresaId: t.empresaId,
      soloItems: t.items,
      usuarioId: t.usuarioId,
      automatica: true,
      encadenada: { terminadaEl: t.terminadaEl, logId: t.logId || null, automatica: t.automatica },
    }),
  esOcupado: (e) => e instanceof CandadoArcaOcupado,
  corriendo: (tenantId) => {
    const d = descargaConstanciasDe(tenantId);
    return !!d && !d.terminada;
  },
  esperar,
  alVaciarse: ubicarDespuesDeBajar,
  alTerminar: (t: TandaPresentada, r: ResultadoEncadenada) =>
    console.log(`[descarga-encadenada] ${t.tenantId} · ${t.empresaRazonSocial}: ${r.resultado === "bajada" ? `${r.pedidas} pedida(s)` : `${r.resultado} — ${r.detalle}`}`),
});

/** Encola la descarga de las altas recién presentadas. Nunca tira: si no se puede, las levanta el barrido. */
export async function encadenarDescarga(t: TandaPresentada): Promise<void> {
  try {
    const r = await cola.encolar(t);
    if (r === "encolada") console.log(`[descarga-encadenada] ${t.tenantId} · ${t.empresaRazonSocial}: ${t.items.length} alta(s) presentada(s), se bajan sus constancias`);
  } catch (e: any) {
    console.error("[descarga-encadenada] no se pudo encolar:", e?.message || e);
  }
}

/** Lo que espera o se baja ahora, para «A.R.C.A Descargas Automáticas». */
export const encadenadasEnFila = (tenantId: string) => cola.enFila(tenantId);
