import React from "react";
import { SimpleCatalogItem } from "../../api/simpleCatalog";
import { CatalogoMultiSelector } from "./CatalogoMultiSelector";
import { formatRnos } from "../../utils/rnos";

interface Props {
  obrasSociales: SimpleCatalogItem[];
  cargando?: boolean;
  /** Ids de las obras sociales registradas para esta empleadora. */
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Obras Sociales REGISTRADAS ante ARCA para el CUIT de la empleadora.
 *
 * No es "la obra social de la empresa": es el CONJUNTO que el organismo tiene declarado para ese
 * CUIT ("obras sociales relacionadas a su actividad"), y solo acepta altas con una de ellas. Cuál se
 * usa por defecto cuando la persona no tiene una propia es otro campo, `obraSocialDefaultId`, que se
 * elige en la ficha de la empresa (ARCA → Obras Sociales) o en el catálogo global.
 */
export const ObraSocialSelector: React.FC<Props> = ({ obrasSociales, cargando, value, onChange }) => (
  <CatalogoMultiSelector items={obrasSociales} cargando={cargando} value={value} onChange={onChange} entidadPlural="obras sociales" placeholder="Buscar por nombre o RNOS…" formatCodigo={formatRnos} />
);
