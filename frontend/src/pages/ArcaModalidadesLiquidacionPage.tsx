import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../components/ui/Modal";
import { encabezadoDeAmbito } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar, LimpiarDefaultArca } from "../components/arca/DefaultArcaStar";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
import { CAMPOS_RETRIBUCION, TEXTO_SIN_CAMPO, rotuloCampoRetribucion } from "@compartido/arca/retribucionPactada";

const api = createSimpleCatalogApi("/arca/modalidades-liquidacion");

/** El código de ARCA se guarda con ceros a la izquierda: es lo que espera el TXT de alta (1 díg.). */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(1, "0").slice(-1) : "";
};

export const ArcaModalidadesLiquidacionPage: React.FC = () => {
  /** La modalidad cuya explicación de «Sin definir» está abierta. */
  const [sinDefinir, setSinDefinir] = useState<string | null>(null);

  return (
  <>
  <SimpleCatalogManager
    extraFields={[
      {
        // Qué importe del contrato va al TXT de alta como retribución pactada (pos. 58-72) con esta modalidad.
        key: "retribucionPactada",
        label: "Retribución pactada",
        type: "select",
        options: [{ value: "", label: "Sin definir" }, ...CAMPOS_RETRIBUCION.map((c) => ({ value: c.value, label: c.label }))],
        showColumn: true,
        // Sin definir no es un valor más: saca a la modalidad del selector del tipo de contrato. Se dice en la celda.
        renderColumna: (item) => {
          const campo = String((item as { retribucionPactada?: string }).retribucionPactada || "").trim();
          if (campo) return rotuloCampoRetribucion(campo);
          return (
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              Sin definir
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSinDefinir(`${item.externalId || ""} — ${item.name}`);
                }}
                title="No se ofrece en los tipos de contrato. Tocá para ver por qué."
                aria-label={`${item.name}: retribución pactada sin definir, ver qué significa`}
                className="text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
              >
                <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        },
      },
    ]}
    columnasCalculadas={[
      {
        label: "Por defecto",
        encabezado: (
          <span className="inline-flex items-center gap-2">
            Por defecto
            <LimpiarDefaultArca campo="modalidadLiquidacion" queEs="la modalidad de liquidación" />
          </span>
        ),
        render: (item) => <DefaultArcaStar campo="modalidadLiquidacion" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="la modalidad de liquidación" />,
      },
    ]}
    title="Modalidades de Liquidación"
    {...encabezadoDeAmbito("modalidades-liquidacion")}
    icon={faClock}
    entityLabel="modalidad de liquidación"
    api={api}
    templateBaseName="arca_modalidades_liquidacion"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 1"
    formatExternalId={formatCodigo}
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
    helpKey="arcaModalidadLiquidacion"
  />

  {sinDefinir && (
    <Modal isOpen onClose={() => setSinDefinir(null)} title="Retribución pactada sin definir" subtitle={sinDefinir} size="md" footer={<div className="flex justify-end w-full"><button type="button" onClick={() => setSinDefinir(null)} className="btn-primary">Entendido</button></div>}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
        <p>
          Esta modalidad <strong>no se muestra como opción en los tipos de contrato</strong>, porque no tiene definido qué importe del contrato se carga en ARCA como retribución pactada (posiciones 58-72 del TXT de alta).
        </p>
        <p>
          Para ofrecerla, editala con el lápiz y elegí en «Retribución pactada» el importe que corresponde: por jornada, semanal, mensual, neto o bruto.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Un tipo de contrato que ya la tenga cargada la conserva. En ese caso, el alta declara el {TEXTO_SIN_CAMPO.charAt(0).toLowerCase() + TEXTO_SIN_CAMPO.slice(1)}.
        </p>
      </div>
    </Modal>
  )}
  </>
  );
};
