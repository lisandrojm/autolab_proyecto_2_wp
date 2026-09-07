import React from "react";
import { faIndustry } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
import { DefaultArcaStar } from "../components/arca/DefaultArcaStar";

const api = createSimpleCatalogApi("/arca/actividades");

/** El código de ARCA se guarda con ceros a la izquierda: es lo que espera el TXT de alta (6 díg.). */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(6, "0").slice(-6) : "";
};

/**
 * Diccionario de actividades del nomenclador de ARCA.
 *
 * NO es la lista de lo que un contrato puede declarar: eso lo define, y solo, lo que ARCA tiene
 * declarado para ese domicilio de explotación. Un código válido en otra sucursal es rechazado por el
 * organismo, así que si algún día un selector de contrato ofrece este catálogo, eso es un bug.
 *
 * Sirve para no tipear el código a mano al cargar una actividad en un domicilio y para que la
 * descripción salga siempre idéntica. Se llena solo: el importador de Domicilios de Explotación da de
 * alta cada código nuevo que trae el padrón.
 */
export const ArcaActividadesPage: React.FC = () => (
  <SimpleCatalogManager
    columnasCalculadas={[
      {
        label: "Por defecto",
        // Ordena el selector al cargar actividades en un domicilio. NO es la actividad del alta: esa
        // la define lo que ARCA tenga declarado para ese domicilio, y nada más.
        render: (item) => <DefaultArcaStar campo="actividad" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="la actividad que se ofrece primero" />,
      },
    ]}
    title="Actividades"
    subtitle="Diccionario de actividades económicas de ARCA. Se usa al cargar una actividad en un domicilio, para que el código y la descripción salgan siempre iguales."
    icon={faIndustry}
    entityLabel="actividad"
    api={api}
    templateBaseName="arca_actividades"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 921430"
    formatExternalId={formatCodigo}
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
    helpKey="arcaActividades"
  />
);
