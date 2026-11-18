import { sweetAlert } from "./sweetAlert";

/*
  ANULAR UN CONTRATO EN VEZ DE ELIMINARLO (etapa 2b, 18/11/2026).

  El botón «Eliminar» de cada pantalla ahora anula: el contrato queda guardado entero (con quién, cuándo
  y el motivo) y en la lista deja de aparecer, pero no se corre la posición de los demás contratos. El
  motivo es obligatorio. Lo que el server rechace —p. ej. un alta ya presentada en ARCA, que primero
  necesita la baja— se muestra tal cual.
*/

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

/** El mensaje del server, o uno genérico. */
export const errorDeAnulacion = (err: any): string => err?.response?.data?.error || err?.message || "No se pudo anular el contrato.";
