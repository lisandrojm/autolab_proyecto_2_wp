import React, { useEffect, useMemo, useState } from "react";
import { faFileContract } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../api/simpleCatalog";
import { companiesAPI } from "../api/companies";
import { formatRnos } from "../utils/rnos";
import { ConveniosTable } from "../components/convenios/ConveniosTable";
import type { ConvenioFila } from "../components/convenios/ConveniosTable";

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
  /** En cuántas empresas está registrado cada convenio, por `_id`. */
  const [empresasPorConvenio, setEmpresasPorConvenio] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    obrasSocialesApi
      .list()
      .then(setObrasSociales)
      .catch(() => setObrasSociales([]));
  }, []);

  useEffect(() => {
    companiesAPI
      .list()
      .then((empresas) => {
        const conteo = new Map<string, number>();
        // SIEMPRE por `_id`, nunca por `externalId`: 1.555 de los 2.669 convenios llevan sufijo " E"
        // y "0131/75" y "0131/75 E" son registros distintos y legítimos del nomenclador.
        for (const e of empresas) for (const id of e.convenioIds || []) conteo.set(String(id), (conteo.get(String(id)) || 0) + 1);
        setEmpresasPorConvenio(conteo);
      })
      .catch(() => setEmpresasPorConvenio(new Map()));
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

  /** La obra social sindical del convenio, resuelta contra el catálogo por `data.id`. */
  const porDataId = (id?: number | null) => (id == null ? undefined : obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));

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
      // El nomenclador tiene 2.669 convenios y solo importan los que alguna empresa registró:
      // cargarle la obra social a uno que nadie usa es trabajo perdido, y los 2.664 restantes
      // llenaban la columna de guiones como si faltaran 2.664 configuraciones.
      filtroDestacado={{ etiqueta: 'Registrados por alguna empresa', aplica: (c) => (empresasPorConvenio.get(c._id) || 0) > 0 }}
      // LA MISMA tabla que usa la ficha de empresa: eran dos, con encabezados distintos para los
      // mismos datos ("Nombre" vs "Actividad", el código al final vs primero) y ya habían divergido.
      // Acá se le suma la columna "Empresas" y las acciones de ABM que aporta el manager.
      tablaPropia={({ items, renderAcciones }) => (
        <ConveniosTable
          convenios={items as ConvenioFila[]}
          obraSocialDe={(c) => ({ os: porDataId(c.obraSocialDefaultId) })}
          renderEmpresas={(c) => {
            const n = empresasPorConvenio.get(c._id) || 0;
            return n === 0 ? <span className="text-gray-400 dark:text-gray-600">—</span> : <span className="font-bold tabular-nums">{n}</span>;
          }}
          renderAcciones={renderAcciones}
          ayudaSinObraSocial="Se carga con el lápiz de esta fila."
        />
      )}
      // Sin `showColumn`: las columnas las dibuja `ConveniosTable`. Estos descriptores quedan solo
      // para el formulario de alta/edición, que sigue siendo el genérico del manager.
      extraFields={[
        { key: "signatario", label: "Signatario", placeholder: "Ej: FAECYS" },
        { key: "obraSocialDefaultId", label: "Obra social del convenio", type: "select", options: opcionesObraSocial },
      ]}
    />
  );
};
