import React, { useEffect, useState } from "react";
import { faListCheck } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager, CatalogExtraField } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar } from "../components/arca/DefaultArcaStar";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/tipos-servicio");
const gruposApi = createSimpleCatalogApi("/arca/grupos-tipo-servicio");

/** El código de ARCA se guarda con ceros a la izquierda: es lo que espera el TXT de alta (3 díg.). */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(3, "0").slice(-3) : "";
};

export const ArcaTiposServicioPage: React.FC = () => {
  /*
   * Las opciones del grupo salen del catálogo `l_GTS` y no de una lista escrita acá: si alguien
   * renombra un grupo en su ABM, este selector tiene que seguirlo. Son 2 registros, así que el
   * request es intrascendente.
   */
  const [grupos, setGrupos] = useState<SimpleCatalogItem[]>([]);
  useEffect(() => {
    gruposApi
      .list()
      .then(setGrupos)
      .catch(() => setGrupos([]));
  }, []);

  const extraFields: CatalogExtraField[] = [
    {
      key: "grupo",
      label: "Grupo",
      type: "select",
      showColumn: true,
      columnLabel: "Grupo",
      options: [
        // El vacío va primero y es el default: sin clasificar no es lo mismo que continuo, y
        // asumirlo escribiría un código de las posiciones 107-109 sin fundamento.
        { value: "", label: "Sin clasificar" },
        ...grupos.map((g) => ({ value: String(g.externalId || ""), label: `${g.externalId} — ${g.name}` })),
      ],
    },
  ];

  return (
    <SimpleCatalogManager
    columnasCalculadas={[
      {
        label: "Por defecto",
        render: (item) => <DefaultArcaStar campo="tipoServicio" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="el tipo de servicio" />,
      },
    ]}
      title="Tipos de Servicio"
      subtitle="Tabla oficial de ARCA. Clasifica el servicio prestado (comunes continuos, insalubres, etc.). Hay 49 nombres repetidos: el Grupo es lo que los separa."
      icon={faListCheck}
      entityLabel="tipo de servicio"
      api={api}
      templateBaseName="arca_tipos_servicio"
      externalIdLabel="Código"
      externalIdPlaceholder="Ej: 000"
      formatExternalId={formatCodigo}
      sanitizeExternalId={(v) => v.replace(/\D/g, "")}
      extraFields={extraFields}
      helpKey="arcaTipoServicio"
    />
  );
};
