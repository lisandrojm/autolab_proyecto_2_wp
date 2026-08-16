import React, { useEffect, useMemo, useState } from "react";
import { faFileContract } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../api/simpleCatalog";
import { formatRnos } from "../utils/rnos";

const conveniosApi = createSimpleCatalogApi("/convenios");
const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

/**
 * Catálogo de Convenios Colectivos de Trabajo (CCT), con el nomenclador de ARCA.
 *
 * El "ID Externo" acá es el código CCT con formato "NNNN/AA" (ej. 0130/75). A diferencia del RNOS de
 * Obras Sociales no es numérico —lleva barra y ceros a la izquierda—, así que se guarda tal cual.
 *
 * Además del nomenclador, cada convenio lleva su OBRA SOCIAL: en la Argentina la define el sindicato,
 * y al sindicato lo define el CCT. Quien trabaja bajo el convenio de televisión aporta a la O.S. del
 * Personal de Televisión, no a la que elija la productora que lo contrata. Ese dato NO viene en el
 * nomenclador de ARCA —es propio— y por eso se carga a mano acá.
 */
export const ConveniosPage: React.FC = () => {
  const [obrasSociales, setObrasSociales] = useState<SimpleCatalogItem[]>([]);

  useEffect(() => {
    obrasSocialesApi
      .list()
      .then(setObrasSociales)
      .catch(() => setObrasSociales([]));
  }, []);

  const opcionesObraSocial = useMemo(() => {
    // La primera opción es el vacío y tiene que existir: el formulario genérico preselecciona la
    // primera de la lista, y sin ella todo convenio nuevo nacería con una obra social al azar.
    // Además el vacío es un valor legítimo: "9999/99 — EXCLUIDO DE CONVENIO" no tiene sindicato.
    const vacio = { value: "", label: "— Sin obra social sindical (define la empresa) —" };
    const items = obrasSociales
      .map((o) => ({ value: String((o.data as { id?: number } | undefined)?.id ?? ""), label: `${formatRnos(o.externalId)} — ${o.name}` }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
    return [vacio, ...items];
  }, [obrasSociales]);

  return (
    <SimpleCatalogManager
      title="Convenios"
      subtitle="Convenios Colectivos de Trabajo (CCT). Cada uno define la obra social de quien trabaja bajo él."
      icon={faFileContract}
      entityLabel="convenio"
      api={conveniosApi}
      templateBaseName="convenios"
      externalIdLabel="Código"
      externalIdPlaceholder="Formato NNNN/AA, ej: 0130/75"
      extraFields={[
        { key: "signatario", label: "Signatario", showColumn: true, placeholder: "Ej: FAECYS" },
        {
          key: "obraSocialDefaultId",
          label: "Obra social del convenio",
          columnLabel: "Obra Social",
          type: "select",
          // La columna muestra el label del option (lo resuelve `extraDisplay` del manager).
          options: opcionesObraSocial,
          showColumn: true,
        },
      ]}
    />
  );
};
