/**
 * ESCALAS SALARIALES VERSIONADAS, ADICIONALES DEL CONVENIO, CAPÍTULO DE PEQUEÑAS EMPRESAS Y ACUERDOS.
 *
 * Es lo que le faltaba al ABM de `/arca/categorias` para reflejar un acuerdo paritario completo: ahí sólo se
 * puede cargar UN juego de importes por grupo, sin historia, sin los adicionales del acta y sin saber de qué
 * acuerdo salió cada número.
 *
 * Va en un router aparte y no dentro de `arcaCategorias.ts` (863 líneas) porque son entidades nuevas con su
 * propio ciclo de vida. Lo que NO cambia: `ConvenioGrupo` sigue siendo lo vigente y lo que leen los contratos,
 * los PDFs y el TXT de ARCA. Acá se escribe la historia y se ESPEJA el vigente — ver `services/escalasConvenio`.
 *
 * Autenticación igual que en el resto del módulo ARCA: `authenticateToken`. El permiso fino lo aplica la
 * pantalla (`config_holidays:view`, que es el que ya usa Categorías), no este router; cambiarlo acá sería
 * inventar una regla distinta para la misma pantalla.
 */
declare const router: import("express-serve-static-core").Router;
export { router as escalasConvenioRoutes };
