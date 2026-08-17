import React from "react";
import { faBriefcaseMedical } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
// El "ID Externo" de Obras Sociales siempre fue el código RNOS. El formato oficial vive en un solo
// lugar porque lo comparten este catálogo, la ficha de la empresa y el ABM de Empresas.
import { formatRnos } from "../utils/rnos";

const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

const sanitizeRnos = (v: string): string => v.replace(/\D/g, "");

/**
 * Obras Sociales: SOLO el catálogo. Acá no se decide nada.
 *
 * Tenía una pestaña "Por defecto" con una obra social global, que se usaba cuando la cascada no
 * resolvía. Se eliminó junto con ese nivel: solo entraba cuando faltaba configurar algo aguas arriba
 * —casi siempre un convenio sin obra social—, así que lo único que hacía era rellenar el campo con un
 * valor sin fundamento. ARCA lo acepta igual, y el alta quedaba presentada con la obra social
 * equivocada. Ahora ese caso se marca como FALTANTE y no se genera el TXT.
 *
 * Lo que sí se decide vive donde corresponde: la obra social del convenio, en Convenios; la de los
 * excluidos de convenio y las excepciones por CCT, en la ficha de cada empleadora.
 */
export const ObrasSocialesPage: React.FC = () => (
  <SimpleCatalogManager
    title="Obras Sociales"
    subtitle="Catálogo de obras sociales de ARCA. Cargá registros manualmente o importá un Excel cuando se actualicen en ARCA."
    icon={faBriefcaseMedical}
    entityLabel="obra social"
    api={obrasSocialesApi}
    templateBaseName="obras_sociales"
    externalIdLabel="RNOS"
    externalIdPlaceholder="6 dígitos, ej: 400905"
    formatExternalId={formatRnos}
    sanitizeExternalId={sanitizeRnos}
    helpKey="obrasSociales"
  />
);
