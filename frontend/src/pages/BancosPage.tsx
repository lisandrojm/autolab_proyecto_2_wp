import React, { useCallback, useEffect, useMemo, useState } from "react";
import { faBuildingColumns, faTags } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager, CatalogExtraField } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
import { tiposEntidadAPI, TipoEntidadFinanciera } from "../api/tiposEntidadFinanciera";
import { TiposEntidadFinancieraTab } from "../components/bancos/TiposEntidadFinancieraTab";

const bancosApi = createSimpleCatalogApi("/bancos");

/**
 * Los tipos de siempre, mientras cargan los del ABM (o si el server todavía no tiene la ruta): la
 * columna y el selector no quedan mostrando claves ni sin opciones.
 */
const TIPOS_DE_RESPALDO = [
  { value: "banco", label: "Banco" },
  { value: "billetera_virtual", label: "Billetera Virtual" },
  { value: "compania_financiera", label: "Compañía Financiera" },
  { value: "caja_credito", label: "Caja de Crédito" },
  { value: "otro", label: "Otro" },
];

export const BancosPage: React.FC = () => {
  /*
    LOS TIPOS SALEN DEL ABM (pestaña «Tipos de entidad»), no de una lista fija.

    Todos van a las opciones —también los inactivos—, para que la columna y el filtro sigan diciendo
    «Billetera Virtual» en las entidades que ya lo tienen. Los inactivos van marcados `oculta`: el
    formulario no los ofrece, salvo en la entidad que ya lo tiene puesto.
  */
  const [tipos, setTipos] = useState<TipoEntidadFinanciera[] | null>(null);
  const cargarTipos = useCallback(() => {
    tiposEntidadAPI
      .list()
      .then(setTipos)
      .catch(() => setTipos(null));
  }, []);
  useEffect(() => {
    cargarTipos();
  }, [cargarTipos]);

  const opcionesTipo = useMemo(() => (tipos ? tipos.map((t) => ({ value: t.clave, label: t.nombre, oculta: !t.activo })) : TIPOS_DE_RESPALDO), [tipos]);

  const extraFields = useMemo<CatalogExtraField[]>(
    () => [
      {
        key: "tipoEntidad",
        label: "Tipo de Entidad",
        type: "select",
        required: true,
        showColumn: true,
        columnLabel: "Tipo",
        filtrable: true,
        // Sin tipo cargado se ofrece como banco en el registro y en la ficha: filtrar por «Banco» la trae.
        valorPorDefecto: "banco",
        options: opcionesTipo,
      },
      {
        /*
          ACTIVA O INACTIVA: si se ofrece en los selectores (registro y datos bancarios del usuario).
          Apagar no borra: quien ya la tiene cargada la conserva, pero nadie nuevo la puede elegir.
        */
        key: "activo",
        label: "Estado",
        type: "estado",
        showColumn: true,
        filtrable: true,
        options: [
          { value: "true", label: "Activa" },
          { value: "false", label: "Inactiva" },
        ],
        ayuda: "Las inactivas no se ofrecen al registrarse ni al cargar datos bancarios. Quien ya la tiene cargada la conserva.",
      },
    ],
    [opcionesTipo],
  );

  return (
    <SimpleCatalogManager
      title="Entidades Financieras"
      subtitle="Catálogo de entidades financieras. Cargá registros manualmente o importá un Excel."
      icon={faBuildingColumns}
      entityLabel="entidad financiera"
      api={bancosApi}
      templateBaseName="entidades_financieras"
      helpKey="bancos"
      extraFields={extraFields}
      pestanas={[{ id: "tipos", label: "Tipos de entidad", icon: faTags, render: (items) => <TiposEntidadFinancieraTab entidades={items} onCambio={cargarTipos} /> }]}
    />
  );
};
