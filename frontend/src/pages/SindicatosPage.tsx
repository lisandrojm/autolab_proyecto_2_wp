import React from "react";
import { Link } from "react-router-dom";
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
    /*
      SUS CONVENIOS: un link a /convenios ya filtrado por este gremio, y no una vista de detalle.

      Este ABM es una fila por registro, sin pantalla propia. Construirle una para listar convenios
      significaría rehacer ahí las columnas, el buscador y la edición que /convenios ya tiene — y
      quien mira los convenios de un gremio casi siempre quiere hacer algo con ellos, que es
      justamente lo que esa pantalla permite y una lista de solo lectura no.

      Sin recuento al lado: saberlo obligaría a traer los 2.669 convenios para contar por sindicato,
      en una pantalla que hoy no los pide. El link lleva a donde el número está a la vista.
    */
    columnasCalculadas={[
      {
        label: "Convenios",
        render: (item) => (
          <Link
            to={`/convenios?sindicatoId=${item._id}`}
            title={`Ver los convenios firmados por ${item.name}`}
            className="text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            Ver convenios
          </Link>
        ),
      },
    ]}
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
