import React from "react";
import { faEarthAmericas } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { paisesResidenciaApi } from "../api/paisesResidencia";

/**
 * Países de residencia: la lista de países que se ofrece para el DOMICILIO de una persona (registro,
 * ficha del usuario, Mi Perfil y la app).
 *
 * No es el catálogo de países de FRAME: ese sigue siendo el de la nacionalidad y el país de nacimiento.
 * Ver `server/src/models/PaisResidencia.ts`.
 */
export const PaisesResidenciaPage: React.FC = () => (
  <SimpleCatalogManager
    title="Países de residencia"
    subtitle="Países que se ofrecen para el domicilio de una persona. Cargá registros manualmente o importá un Excel."
    icon={faEarthAmericas}
    entityLabel="país de residencia"
    api={paisesResidenciaApi}
    templateBaseName="paises_residencia"
    helpKey="paisesResidencia"
    /*
      El ID queda a la vista porque es lo que se guarda en cada persona: cambiarle el ID a un país que ya
      se usa hace que esas personas dejen de verlo. Vacío al crear = el server le asigna uno.
    */
    externalIdLabel="ID"
    externalIdPlaceholder="Vacío = se asigna solo"
    externalIdNumerico
    extraFields={[
      {
        /*
          ACTIVO O INACTIVO: si se ofrece en los formularios de domicilio. Apagar no borra: quien ya
          lo tiene cargado lo conserva y lo sigue viendo, pero nadie nuevo lo puede elegir.
        */
        key: "activo",
        label: "Estado",
        type: "estado",
        showColumn: true,
        filtrable: true,
        options: [
          { value: "true", label: "Activo" },
          { value: "false", label: "Inactivo" },
        ],
        ayuda: "Los inactivos no se ofrecen al registrarse ni al cargar el domicilio. Quien ya lo tiene cargado lo conserva.",
      },
    ]}
  />
);
