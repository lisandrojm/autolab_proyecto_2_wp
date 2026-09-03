import React from "react";
import { faPeopleGroup } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const sindicatosApi = createSimpleCatalogApi("/sindicatos");

/**
 * Sindicatos: el catálogo de gremios a los que alguien puede estar AFILIADO.
 *
 * Es un catálogo propio y no una lectura de Convenios a propósito. Estar comprendido por un CCT
 * alcanza a todo el personal de la actividad; estar afiliado es voluntario y es lo que habilita el
 * descuento de la cuota sindical. Son dos preguntas distintas y una no se deduce de la otra.
 * Ver `server/src/models/Sindicato.ts`.
 */
export const SindicatosPage: React.FC = () => (
  <SimpleCatalogManager
    title="Sindicatos"
    subtitle="Gremios a los que puede estar afiliada una persona. Cargá registros manualmente o importá un Excel."
    icon={faPeopleGroup}
    entityLabel="sindicato"
    api={sindicatosApi}
    templateBaseName="sindicatos"
    /* Se carga a mano y no lo identifica ningún organismo: el "ID Externo" acá era una columna
       siempre vacía. Ver `showExternalId` en SimpleCatalogManager. */
    showExternalId={false}
    extraFields={[
      {
        key: "sigla",
        label: "Sigla",
        type: "text",
        showColumn: true,
        columnLabel: "Sigla",
        placeholder: "Ej: SATSAID",
      },
    ]}
  />
);
