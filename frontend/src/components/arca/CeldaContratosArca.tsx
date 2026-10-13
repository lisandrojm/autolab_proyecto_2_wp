import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { arcaRelacionesAPI, type RelacionLaboral, type RelacionResumida } from "../../api/arcaRelaciones";
import { Modal } from "../ui/Modal";
import { sweetAlert } from "../../utils/sweetAlert";
import { TablaRelacionesArca, fechaCortaArca } from "./TablaRelacionesArca";

/*
  «CONTRATOS EN ARCA»: las relaciones laborales que ARCA tiene de la persona (la copia local de
  Simplificación Registral, ver «Antigüedad ARCA»), de la más nueva a la más vieja. Es para cruzar con
  los contratos de WeProdu de la misma fila sin salir de la tabla.

  En la celda van las últimas MAX_EN_CELDA; «Ver las N» abre el detalle completo de la persona (todas,
  con modalidad, puesto, obra social, retribución y baja). Lo de ARCA es lo de la última
  sincronización: lo que se dio de alta hoy aparece después de la próxima.
*/
const MAX_EN_CELDA = 3;

export const CeldaContratosArca: React.FC<{
  cuil?: string;
  nombre: string;
  /** `undefined` = todavía cargando; `[]` = ARCA no tiene ninguna. */
  relaciones: RelacionResumida[] | undefined;
  razonSocialDe: (cuit: string) => string;
}> = ({ cuil, nombre, relaciones, razonSocialDe }) => {
  const [detalle, setDetalle] = useState<RelacionLaboral[] | "cargando" | null>(null);
  const cuilLimpio = String(cuil || "").replace(/\D/g, "");

  if (cuilLimpio.length !== 11) return <span className="text-xs text-gray-400">—</span>;
  if (relaciones === undefined) return <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3 text-gray-400" />;
  if (relaciones.length === 0) return <span className="text-xs text-gray-400 whitespace-nowrap">Sin contratos en ARCA</span>;

  const abrirDetalle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDetalle("cargando");
    try {
      setDetalle(await arcaRelacionesAPI.relacionesDe(cuilLimpio));
    } catch (err: any) {
      setDetalle(null);
      sweetAlert.error("No se pudieron cargar las relaciones", err?.response?.data?.error || err?.message || "");
    }
  };

  return (
    <div className="flex flex-col gap-1 min-w-[220px]" onClick={(e) => e.stopPropagation()}>
      {relaciones.slice(0, MAX_EN_CELDA).map((r) => (
        <div key={`${r.empleadoraCuit}|${r.fechaInicio}`} className="text-xs leading-tight">
          <span className="whitespace-nowrap font-medium text-gray-800 dark:text-gray-200">
            {fechaCortaArca(r.fechaInicio)} → {r.fechaFin ? fechaCortaArca(r.fechaFin) : <span className="text-green-600 dark:text-green-400 font-semibold">abierta</span>}
          </span>
          <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[260px]" title={`${razonSocialDe(r.empleadoraCuit)} · ${r.modalidadContrato} · ${r.puestoDesempenado}`}>
            {razonSocialDe(r.empleadoraCuit)}
            {r.puestoDesempenado ? ` · ${r.puestoDesempenado}` : ""}
          </span>
        </div>
      ))}
      <button type="button" onClick={abrirDetalle} className="self-start text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">
        {relaciones.length > MAX_EN_CELDA ? `Ver las ${relaciones.length}` : "Ver detalle"}
      </button>
      <Modal isOpen={detalle !== null} onClose={() => setDetalle(null)} title="Contratos en ARCA" subtitle={`${nombre} · ${relaciones.length} ${relaciones.length === 1 ? "relación" : "relaciones"}, de la más nueva a la más vieja`} size="xl">
        {detalle === "cargando" ? (
          <span className="text-xs text-gray-500">
            <FontAwesomeIcon icon={faSpinner} spin /> Cargando relaciones…
          </span>
        ) : detalle ? (
          <div className="overflow-x-auto">
            <TablaRelacionesArca relaciones={detalle} razonSocialDe={razonSocialDe} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
