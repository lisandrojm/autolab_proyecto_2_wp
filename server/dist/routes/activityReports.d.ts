declare const router: import("express-serve-static-core").Router;
/** Ids de un filtro que puede traer varios («a,b,c»): los válidos, sin repetir. Uno solo o vacío también. */
export declare const listaIds: (v: unknown) => string[];
export { router as RequestRoutes };
