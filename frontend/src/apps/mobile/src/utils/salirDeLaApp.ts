import { useAuthStore } from "../../../../stores/authStore";
import { sweetAlert } from "./sweetAlert";

/**
 * SALIR DE LA APLICACIÓN, el mismo en todas las pantallas (21/11/2026).
 *
 * El ícono rojo de arriba a la derecha está al alcance del pulgar y cierra la sesión: antes se tocaba
 * sin querer y había que volver a loguearse. Ahora pregunta primero, con el mismo texto en todos lados.
 */
export async function salirDeLaApp() {
  const r = await sweetAlert.confirm("¿Querés salir de la aplicación?", "Se va a cerrar tu sesión. Para volver a entrar vas a tener que ingresar de nuevo.", "Salir", "Cancelar");
  if (!r.isConfirmed) return;
  useAuthStore.getState().logout();
  window.location.href = "/login";
}
