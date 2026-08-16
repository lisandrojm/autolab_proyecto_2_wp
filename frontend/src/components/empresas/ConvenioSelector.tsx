import React from "react";
import { SimpleCatalogItem } from "../../api/simpleCatalog";
import { CatalogoMultiSelector } from "./CatalogoMultiSelector";

interface Props {
  convenios: SimpleCatalogItem[];
  cargando?: boolean;
  /** Ids de los convenios asociados. */
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Convenios Colectivos registrados por la empleadora.
 *
 * La interacción vive en `CatalogoMultiSelector`, compartida con Obras Sociales: son el mismo gesto
 * —buscar en el nomenclador y quedarse con los propios— y tienen que verse igual.
 */
export const ConvenioSelector: React.FC<Props> = ({ convenios, cargando, value, onChange }) => (
  <CatalogoMultiSelector
    items={convenios}
    cargando={cargando}
    value={value}
    onChange={onChange}
    entidadPlural="convenios"
    placeholder="Buscar por código, actividad o signatario…"
    detalle={(c) => (c as { signatario?: string }).signatario}
  />
);
