import { usersAPI } from "../../api/users";
import { sweetAlert } from "../../utils/sweetAlert";
import { emitPendientesChanged } from "../../utils/navbarEvents";
import { resultadoEliminarSolicitud, textoEliminarSolicitud, type SolicitudVista } from "./SolicitudesTable";

/**
 * RECHAZAR Y ELIMINAR UNA SOLICITUD, iguales desde donde se hagan: Solicitudes y el padrón de Contratos,
 * que muestra las pendientes con los mismos botones (15/11/2026, pedido del usuario).
 *
 * Cada una pregunta, hace el cambio, avisa y devuelve si se hizo; refrescar la lista es de quien llama.
 */

/*
  RECHAZAR PIDE EL MOTIVO, y es obligatorio.

  Una solicitud rechazada vuelve a quien la cargó, que tiene que saber qué corregir: sin el motivo,
  la pregunta se termina haciendo por teléfono y la solicitud se vuelve a mandar igual. Queda
  guardado en la solicitud y se ve en la tabla y en el detalle.
*/
export const rechazarSolicitudConMotivo = async (s: { _id: string; nombre: string }): Promise<boolean> => {
  const r = await sweetAlert.prompt("¿Rechazar solicitud?", {
    text: `Contale a quien pidió el alta de ${s.nombre} por qué no se aprueba.`,
    placeholder: "Ej.: falta el CUIT, o la categoría no corresponde al rol",
    multilinea: true,
    confirmText: "Rechazar",
    mensajeVacio: "Escribí el motivo del rechazo.",
  });
  if (!r.isConfirmed) return false;
  try {
    await usersAPI.setSolicitudStatus(s._id, "rechazada", String(r.value || "").trim());
    sweetAlert.success("Solicitud rechazada", "La solicitud quedó marcada como rechazada.");
    emitPendientesChanged();
    return true;
  } catch (error: any) {
    sweetAlert.error("Error", error.response?.data?.error || "No se pudo cambiar el estado de la solicitud.");
    return false;
  }
};

export const eliminarSolicitudConfirmando = async (s: Pick<SolicitudVista, "_id" | "nombre" | "estado">): Promise<boolean> => {
  const r = await sweetAlert.confirm("¿Eliminar solicitud?", textoEliminarSolicitud(s), "Sí, eliminar");
  if (!r.isConfirmed) return false;
  try {
    const resultado = resultadoEliminarSolicitud(await usersAPI.eliminarSolicitud(s._id));
    if (resultado.encontrado) sweetAlert.success("Solicitud eliminada", resultado.texto);
    else sweetAlert.warning("Solicitud eliminada", resultado.texto);
    emitPendientesChanged();
    return true;
  } catch (error: any) {
    sweetAlert.error("Error", error.response?.data?.error || "No se pudo eliminar la solicitud.");
    return false;
  }
};
