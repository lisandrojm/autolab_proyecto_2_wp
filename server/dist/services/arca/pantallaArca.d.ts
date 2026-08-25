/**
 * Qué pantalla de ARCA tenemos delante, a partir de la URL y el texto visible.
 *
 * Está aparte de `navegador.ts` porque es la decisión que se equivocó, y separada se puede probar sin
 * levantar un Chromium ni tener una clave fiscal: son dos strings adentro, un veredicto afuera.
 *
 * EL CASO QUE MOTIVA TODO ESTO: pedir la URL profunda del servicio sin tener sesión DEL SERVICIO no
 * da un 404 ni un login limpio. Comprobado contra el servidor real, y da dos cosas distintas según
 * quién pregunte:
 *
 *   - con navegador →  `.../app/FinSession.aspx`, que trae TODO el decorado del servicio («Simplificación
 *                      registral», «Empleador:», «SALIR», «CUIT:») y recién abajo la frase «Su tiempo de
 *                      sesión ha finalizado, o ud. no ha iniciado su sesión de trabajo».
 *   - sin JavaScript → `.../app/ErrorPage.aspx`, 200, y el único texto es «Ha ocurrido un error».
 *
 * Las dos se quedan en el dominio del servicio y las dos SE PARECEN a estar adentro. Por eso las dos
 * se reconocen POR LA URL además de por el texto: si algún día AFIP le cambia una coma a esa frase, un
 * chequeo que dependa del texto empieza a dar por buena una pantalla muerta, y el motor se pone a
 * buscar CUILs en ella.
 */
export type PantallaArca = "servicio" | "error" | "login" | "otra";
export declare function clasificarPantalla(url: string, texto: string): PantallaArca;
