import { createSimpleCatalogApi } from "./simpleCatalog";

/** Modalidad del contrato (Presencial/Remoto/Híbrido), ABM por tenant: `esDefault` marca la que rige sin dato. */
export const modalidadesApi = createSimpleCatalogApi("/modalidades");
