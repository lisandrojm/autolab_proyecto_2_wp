import Swal from "sweetalert2";
import { sweetAlert } from "./sweetAlert";
import { projectsAPI, ResumenContrato } from "../api/projects";

/*
  ANULAR UN CONTRATO DESDE EL PANEL (etapa 2b, 18/11/2026).

  El botón «Anular» de cada pantalla ya no borra: el contrato queda guardado entero (con quién, cuándo y
  el motivo) y deja de aparecer en las listas, sin correr la posición de los demás.

  ANTES DE PEDIR EL MOTIVO SE MIRA QUÉ CUELGA DEL CONTRATO (la misma regla del server y del script
  `anularContratos.ts`):
   - un alta ya presentada en ARCA no se anula: necesita la baja;
   - los recibos de sueldo se ofrecen MOVER a otro contrato de la misma persona en el proyecto (el caso
     de un duplicado que se quedó con los recibos del contrato bueno);
   - una renovación pendiente hay que resolverla antes;
   - si es el último contrato de la persona en el proyecto, se avisa: sale del equipo.
*/

const fecha = (f: string) => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : "—");
/** «#8 · Tiempo Indeterminado · FZERO S.R.L · 01/05/2026 → sin baja». */
export const etiquetaContrato = (c: Omit<ResumenContrato, "contratoKey"> & { index?: number }) =>
  `${c.index !== undefined ? `#${c.index} · ` : ""}${c.nombre_contrato || "Sin tipo"} · ${c.nombre_empresa_contrato || "sin empresa"} · ${fecha(c.fecha_alta_contrato)} → ${c.fecha_baja_contrato ? fecha(c.fecha_baja_contrato) : "sin baja"}`;

/** El mensaje del server, o uno genérico. */
export const errorDeAnulacion = (err: any): string => err?.response?.data?.error || err?.message || "No se pudo anular el contrato.";

/** Pide el motivo de la anulación. `null` si se canceló. */
export async function pedirMotivoDeAnulacion(contexto: string): Promise<string | null> {
  const r = await sweetAlert.prompt("¿Anular contrato?", {
    text: `${contexto} El contrato queda guardado con el motivo y deja de aparecer en las listas.`,
    placeholder: "Motivo (p. ej. «cargado dos veces»)",
    confirmText: "Sí, anular",
    multilinea: true,
    mensajeVacio: "Escribí el motivo.",
  });
  return r.isConfirmed ? String(r.value || "").trim() : null;
}

/**
 * Todo el recorrido: revisa, ofrece mover los recibos si hace falta, pide el motivo y anula.
 * Devuelve `true` si el contrato quedó anulado (para refrescar la pantalla).
 */
export async function anularContratoConRevision(o: { projectId: string; userId: string; contractIndex: number; contexto: string }): Promise<boolean> {
  let previa;
  try {
    previa = await projectsAPI.referenciasContrato(o.projectId, o.userId, o.contractIndex);
  } catch (err: any) {
    sweetAlert.error("No se puede anular", err?.response?.status === 403 ? "No tenés permiso para anular contratos (Contratos)." : errorDeAnulacion(err));
    return false;
  }

  if (previa.arca.bloquea) {
    sweetAlert.error("No se puede anular", previa.arca.resultado === "presentando" ? "Este contrato se está presentando en ARCA ahora mismo." : "Este contrato ya tiene el alta presentada en ARCA. Para dejarlo sin efecto hay que darle la baja.");
    return false;
  }

  const b = previa.referencias.bloqueantes;
  if (b.renovaciones > 0 || b.solicitudesDeRenovacion > 0) {
    sweetAlert.error("Primero resolvé la renovación", `De este contrato depende: ${previa.referencias.textoBloqueantes}. Resolvelo desde Renovaciones y después anulalo.`);
    return false;
  }

  // Recibos de sueldo: se ofrecen mover a otro contrato de la misma persona en el proyecto.
  if (b.recibos.length > 0 || b.lotesDeRecibos > 0) {
    if (previa.destinosParaRecibos.length === 0) {
      sweetAlert.error("No se puede anular", `Tiene ${previa.referencias.textoBloqueantes} y la persona no tiene otro contrato en el proyecto al que pasárselos.`);
      return false;
    }
    const opciones = Object.fromEntries(previa.destinosParaRecibos.map((d) => [String(d.index), etiquetaContrato(d)]));
    const r = await Swal.fire({
      title: "Este contrato tiene recibos de sueldo",
      text: `${previa.referencias.textoBloqueantes}. Antes de anularlo hay que pasarlos al contrato que corresponde. ¿A cuál?`,
      icon: "warning",
      input: "select",
      inputOptions: opciones,
      inputValue: String(previa.destinosParaRecibos[previa.destinosParaRecibos.length - 1].index),
      showCancelButton: true,
      confirmButtonText: "Mover los recibos y seguir",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });
    if (!r.isConfirmed) return false;
    try {
      await projectsAPI.moverRecibos(o.projectId, o.userId, o.contractIndex, Number(r.value));
    } catch (err) {
      sweetAlert.error("No se pudieron mover los recibos", errorDeAnulacion(err));
      return false;
    }
  }

  const avisos = [
    `Contrato: ${etiquetaContrato({ ...previa.contrato, index: previa.posicion })}.`,
    o.contexto,
    previa.esUltimoContrato ? "Es el último contrato de esta persona en el proyecto: al anularlo, sale del equipo." : "",
    previa.referencias.textoInformativas ? `Quedan como registro: ${previa.referencias.textoInformativas}.` : "",
  ].filter(Boolean);
  const motivo = await pedirMotivoDeAnulacion(avisos.join(" "));
  if (!motivo) return false;
  try {
    await projectsAPI.anularMemberContract(o.projectId, o.userId, o.contractIndex, motivo);
    sweetAlert.success("Contrato anulado", "El contrato quedó anulado y guardado con el motivo.");
    return true;
  } catch (err) {
    sweetAlert.error("No se pudo anular", errorDeAnulacion(err));
    return false;
  }
}
