import React, { useMemo } from "react";
import { faMoneyBillTransfer } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager, CatalogExtraField } from "../components/catalog/SimpleCatalogManager";
import { formasPagoAPI } from "../api/formasPago";
import { codigoDesdeNombre, DESCRIPCION_MAX, errorDeCampos, normalizarCodigo } from "@compartido/formasPago";

/**
 * Formas de pago (Efectivo, Transferencia bancaria, Cheque…). El mismo ABM que Entidades Financieras; el
 * código es el `externalId`. Cada tipo de contrato elige cuáles habilita (Configuración → Contratos).
 * Las reglas, compartidas con el server, en `server/src/compartido/formasPago.ts`.
 */
export const FormasPagoPage: React.FC = () => {
  const extraFields = useMemo<CatalogExtraField[]>(
    () => [
      { key: "descripcion", label: "Descripción", showColumn: true, enTarjeta: "ocultar", multilinea: true, maxLength: DESCRIPCION_MAX, placeholder: "Ej.: se paga por transferencia a la cuenta que la persona tiene cargada." },
      {
        key: "requiereDatosBancarios",
        label: "Requiere datos bancarios",
        type: "estado",
        marcaInactivo: false,
        valorInicial: "false",
        enTarjeta: "siEncendido",
        options: [
          { value: "true", label: "Requiere datos bancarios" },
          { value: "false", label: "No requiere datos bancarios" },
        ],
        ayuda: "Al elegirla en un contrato, la persona tiene que tener CBU o alias y entidad financiera cargados.",
      },
      {
        key: "requiereComprobante",
        label: "Requiere comprobante",
        type: "estado",
        marcaInactivo: false,
        valorInicial: "false",
        enTarjeta: "siEncendido",
        options: [
          { value: "true", label: "Requiere comprobante" },
          { value: "false", label: "No requiere comprobante" },
        ],
      },
      {
        // Activa = se ofrece en los selectores. Apagarla no le cambia nada a los contratos que ya la tienen.
        key: "activo",
        label: "Estado",
        type: "estado",
        showColumn: true,
        filtrable: true,
        filtroInicial: ["true"],
        options: [
          { value: "true", label: "Activa" },
          { value: "false", label: "Inactiva" },
        ],
        ayuda: "Las inactivas no se ofrecen al contratar. Los contratos que ya la tienen la conservan.",
      },
    ],
    [],
  );

  return (
    <SimpleCatalogManager
      title="Formas de pago"
      subtitle="Cómo se le paga a una persona. Cada tipo de contrato elige cuáles habilita y cuál se precarga."
      icon={faMoneyBillTransfer}
      entityLabel="forma de pago"
      api={formasPagoAPI}
      templateBaseName="formas_de_pago"
      helpKey="formasPago"
      permiteImportExcel={false}
      externalIdLabel="Código"
      externalIdPlaceholder="EFECTIVO"
      externalIdObligatorio
      externalIdDesdeNombre={codigoDesdeNombre}
      sanitizeExternalId={normalizarCodigo}
      ordenable={{ campo: "orden", ayuda: "Arriba = primera en los selectores." }}
      extraFields={extraFields}
      subtituloTarjeta={(item) => (item.descripcion ? String(item.descripcion) : undefined)}
      estadoEnTarjeta="activo"
      columnasCalculadas={[
        {
          label: "Requisitos",
          despuesDe: "descripcion",
          render: (item) => (
            <div className="flex flex-wrap gap-1">
              {item.requiereDatosBancarios === true && <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Requiere datos bancarios</span>}
              {item.requiereComprobante === true && <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Requiere comprobante</span>}
              {item.requiereDatosBancarios !== true && item.requiereComprobante !== true && <span className="text-xs text-gray-400">—</span>}
            </div>
          ),
        },
      ]}
      validarFormulario={({ nombre, externalId, extras }) => {
        const errores: Record<string, string> = {};
        const eNombre = errorDeCampos({ nombre });
        if (eNombre) errores.nombre = eNombre;
        const eCodigo = errorDeCampos({ codigo: normalizarCodigo(externalId) });
        if (eCodigo) errores.externalId = eCodigo;
        const eDescripcion = errorDeCampos({ descripcion: extras.descripcion ?? "" });
        if (eDescripcion) errores.descripcion = eDescripcion;
        return errores;
      }}
    />
  );
};
