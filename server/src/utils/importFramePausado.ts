/**
 * LA IMPORTACIÓN DE FRAME ESTÁ PAUSADA, Y ESO QUEDA ESCRITO (19/11/2026).
 *
 * Qué se sabe:
 *  - El cron automático (`importconfigs.isEnabled`) está apagado desde el 12/06/2026. No hay commit de
 *    esa fecha que lo explique: se apagó desde la configuración y no se sabe quién ni por qué.
 *  - La última sincronización (manual) fue el 21/09/2026.
 *  - El 18/11/2026 se limpiaron contratos duplicados app/FRAME (372 grupos, ver la memoria
 *    «duplicados-app-frame»): el import no reconocía los contratos de la app por la categoría. El import
 *    ya se arregló (identidad por proyecto, persona, alta y tipo; diferencias → `discrepancias_frame`),
 *    pero una sincronización después de meses trae TODO FRAME de nuevo sobre la base.
 *
 * Por eso sincronizar es una OPERACIÓN, no una prueba: copia fresca de la base, el log a mano y revisión
 * después. Para que no pase por accidente, tanto disparar la sincronización como prender el cron exigen
 * escribir la fecha de la última sincronización (`confirmacionValida`). Sin eso, 428.
 *
 * Mientras no se sincronice, `discrepancias_frame` queda vacía y `stats.discrepanciasFrame` no aparece:
 * no es que no haya diferencias, es que nadie las está mirando. El código está y sirve si se reactiva.
 */
export const IMPORT_FRAME_PAUSADO = {
  cronApagadoDesde: "12/06/2026",
  motivo: "No se sabe quién la apagó ni por qué: no hay cambio de código; se apagó desde la configuración.",
  advertencia:
    "Sincronizar trae todo FRAME de nuevo sobre la base. Es una operación, no una prueba: hacerla con una copia fresca de la base, el log a mano y revisión después.",
  discrepancias: "Mientras no se sincronice, el registro de discrepancias con FRAME queda vacío: no registra nada.",
};

/**
 * Y DESDE NOVIEMBRE DE 2026 ESTÁ DEPRECADA (decisión del usuario, 22/11/2026): ya no se importa de FRAME.
 *
 * Por qué queda escrito acá y en la pantalla: el cron estuvo apagado «desde el 12/06 y nadie sabe por qué», y el
 * botón «Sincronizar Ahora» seguía ahí para que alguien lo apretara un año después. Ahora:
 *  - disparar la sincronización y prender la automática contestan 410, sin confirmación que valga;
 *  - el cron no corre aunque la configuración diga otra cosa, y la deja en `isEnabled: false` con esta nota
 *    (`deprecadoDesde` y `nota` en `importconfigs`);
 *  - la pantalla muestra el botón deshabilitado y dice desde cuándo y por qué.
 * Lo ya importado no se toca. Las diferencias que quedaron entre lo importado y ARCA son un conjunto histórico
 * cerrado (ver el Glosario de ARCA y `services/arca/auditoriaArca.ts`). Reactivarla es cambiar este archivo.
 */
/*
  PARA REVISAR AL PUBLICAR (Lisandro): el texto de `nota` es el que se ve en la pantalla de importación y el que queda
  guardado en `importconfigs`. La decisión de deprecar es del 22/11/2026; la RAZÓN que dice la nota la redactó Claude
  y falta que la confirme Lisandro. Si es otra, se corrige acá: el cron la vuelve a escribir sola en la configuración.
*/
export const IMPORT_FRAME_DEPRECADO = {
  deprecado: true,
  desde: "22/11/2026",
  desdeTexto: "noviembre de 2026",
  nota:
    "Deprecada desde noviembre de 2026 (decisión del 22/11/2026): ya no se importa de FRAME. Los contratos se cargan en WeProdu y las altas de ARCA se presentan desde acá. Volver a sincronizar traería todo FRAME de nuevo sobre la base.",
};

/** La fecha de una corrida como la muestra la pantalla y como hay que escribirla: DD/MM/AAAA, hora argentina. */
export function fechaDeCorrida(fecha: Date | string | null | undefined): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * ¿Lo escrito es la fecha de la última sincronización? Sin ninguna previa, hay que escribir «PRIMERA».
 * Se toleran espacios y guiones en vez de barras; nada más.
 */
export function confirmacionValida(ultima: Date | string | null | undefined, escrita: unknown): boolean {
  const texto = String(escrita ?? "").trim().replace(/-/g, "/");
  if (!texto) return false;
  const esperada = fechaDeCorrida(ultima);
  return esperada ? texto === esperada : texto.toUpperCase() === "PRIMERA";
}
