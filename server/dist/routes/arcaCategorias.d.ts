/**
 * ABM de Categorías profesionales de ARCA, en la forma en la que ARCA las modela:
 *
 *   Convenio (0634/11)
 *     └── Grupo 1..12        ← acá vive la ESCALA salarial
 *           └── Categoría    ← acá solo el código de 6 dígitos y el nombre
 *
 * Es la contracara de `/categorias-sat`, que quedó como una vista PLANA de solo lectura para los
 * consumidores viejos (TXT de ARCA, chequeo de completitud, Funciones FRAME, PDFs). Toda la
 * ESCRITURA pasa por acá, y por eso acá viven las reglas: convenio obligatorio, código de 6 dígitos,
 * y la escala se edita en el grupo — nunca fila por fila.
 *
 * Lo que desapareció respecto del ABM viejo:
 *  - "Actualizar por Categoría" (`PUT /categorias-sat/global/:n`): era el parche para editar de una
 *    vez las N filas que compartían Nº de categoría. Editar el grupo ES eso, sin el parche.
 *  - "Nº Cat." como atributo de la categoría: era el grupo disfrazado.
 */
declare const router: import("express-serve-static-core").Router;
export { router as arcaCategoriasRoutes };
