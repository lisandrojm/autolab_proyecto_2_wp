import React from "react";
import { SeleccionMultiple } from "./ui/SeleccionMultiple";

interface CompanyOption {
  _id: string;
  razonSocial: string;
}

interface CompanyMultiSelectProps {
  companies: CompanyOption[];
  /** IDs seleccionados */
  value: string[];
  onChange: (ids: string[]) => void;
  /** El nombre del campo (con su ⓘ): va en la cabecera, al lado del [+]. */
  label: React.ReactNode;
  titulo?: string;
  emptyLabel?: string;
}

/**
 * Varias empresas (Empresa del Contrato / del Release): el proyecto puede quedar vinculado a más de una
 * y luego se elige cuál usar al descargar el documento. Mismo patrón que Rol/es Empresa: badges con ✕ y
 * una ventana con buscador para marcar varias (ver `SeleccionMultiple`).
 */
export const CompanyMultiSelect: React.FC<CompanyMultiSelectProps> = ({ companies, value, onChange, label, titulo = "Empresas", emptyLabel = "No hay empresas creadas." }) => (
  <SeleccionMultiple
    label={label}
    titulo={titulo}
    descripcion="el proyecto puede quedar vinculado a más de una"
    opciones={companies.map((c) => ({ id: c._id, nombre: c.razonSocial }))}
    valor={value}
    onChange={onChange}
    placeholder="Elegí una o más empresas…"
    placeholderBusqueda="Buscar empresa..."
    vacio={emptyLabel}
  />
);

export default CompanyMultiSelect;
