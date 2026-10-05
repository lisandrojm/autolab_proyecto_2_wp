/**
 * ABM de fuentes de paritarias, lectura de lo detectado y descarga del PDF guardado.
 *
 * DETECTA Y GUARDA. NO LEE.
 *
 * El archivo se conserva y se puede descargar, pero ningún endpoint lo ABRE: no se extrae texto, no
 * se leen importes y no se toca ninguna escala. Son tres capas con confiabilidad distinta —el
 * archivo es evidencia, la lectura es interpretación, la aplicación es una decisión humana— y
 * mezclarlas es exactamente lo que haría que un número inventado por un parser termine declarado
 * ante ARCA. Si alguna vez aparece acá un endpoint que lea el PDF, se fue de alcance.
 */
declare const router: import("express-serve-static-core").Router;
export { router as paritariasRoutes };
