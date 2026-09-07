import React from "react";
import { faBriefcaseMedical } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
// El "ID Externo" de Obras Sociales siempre fue el código RNOS. El formato oficial vive en un solo
// lugar porque lo comparten este catálogo, la ficha de la empresa y el ABM de Empresas.
import { formatRnos } from "../utils/rnos";
import { DefaultArcaStar } from "../components/arca/DefaultArcaStar";

const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

const sanitizeRnos = (v: string): string => v.replace(/\D/g, "");

/**
 * Obras Sociales: el catálogo, y la que se OFRECE PRIMERO. Acá no se decide qué se declara.
 *
 * LA ★ NO ES LA OBRA SOCIAL GLOBAL QUE SE ELIMINÓ, y la diferencia es todo el punto.
 *
 * Aquella era un cuarto escalón de la cascada: cuando nada resolvía, se usaba igual. Solo entraba si
 * faltaba configurar algo aguas arriba —casi siempre un convenio sin obra social—, así que rellenaba
 * el campo con un valor sin fundamento. ARCA acepta el alta lo mismo, y el error se descubre cuando
 * ya está presentado. Ese escalón sigue eliminado: si la cascada real (la propia de la persona → la
 * del convenio → la de excluidos) no resuelve, el checklist marca FALTANTE y no se genera el TXT.
 *
 * Esta ★ solo ordena: es la que aparece primero en los selectores. Cambiarla no cambia ni un
 * carácter del archivo de altas.
 *
 * Lo que sí se decide vive donde corresponde: la obra social del convenio, en Convenios; la de los
 * excluidos de convenio y las excepciones por CCT, en la ficha de cada empleadora.
 */
export const ObrasSocialesPage: React.FC = () => (
  <SimpleCatalogManager
    columnasCalculadas={[
      {
        label: "Por defecto",
        render: (item) => <DefaultArcaStar campo="obraSocial" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="la obra social que se ofrece primero" />,
      },
    ]}
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
