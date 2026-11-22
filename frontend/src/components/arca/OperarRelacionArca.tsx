import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLandmark } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { OperacionArcaModal } from "../contratos/OperacionArcaModal";
import type { ComoSeOperaArca, ContratoDeRelacionArca, ReferenciaContratoArca } from "../../api/arcaOperaciones";

/*
  EL ÍCONO «RELACIÓN EN ARCA» PARA UNA FILA QUE ES UNA RELACIÓN DE ARCA, no un contrato (22/11/2026). Lo usan
  Documentos › Antigüedad ARCA y Gestión › A.R.C.A Bajas. Abre el MISMO panel que la bandeja Contratos
  (`OperacionArcaModal`); lo único que cambia es cómo se llega a él:

   - un contrato con esa persona, empleadora y fecha de alta → el panel abre con ese contrato;
   - varios → primero se elige cuál;
   - ninguno → el panel abre «sin contrato» y lo avisa: el resultado no se guarda en ningún contrato.

  Si no hay nada que operar (`operar.puede` en false) no dibuja nada: la decisión viene del server, de la misma
  regla que el panel y la bandeja Contratos (`compartido/arca/relacionParaOperar.ts`).
*/

const fechaCorta = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

const refDeContrato = (c: ContratoDeRelacionArca): ReferenciaContratoArca => ({ userProjectId: c.userProjectId, contratoKey: c.contratoKey, contractIndex: c.posicion });

export const BotonOperarRelacionArca: React.FC<{
  relacion: { empleadoraCuit: string; cuil: string; inicio: string };
  operar: ComoSeOperaArca | null | undefined;
  /** Después de una operación real que terminó (para volver a leer la lista). */
  onHecho?: () => void;
  /** Con el rótulo al lado del ícono (la cola); sin él, sólo el ícono (una tabla apretada). */
  conTexto?: boolean;
  zIndex?: number;
}> = ({ relacion, operar, onHecho, conTexto = false, zIndex = 80 }) => {
  const [eligiendo, setEligiendo] = useState(false);
  // Se guarda el objeto: el panel vuelve a leer cuando cambia la referencia, y un objeto nuevo en cada render lo haría leer sin parar.
  const [ref, setRef] = useState<ReferenciaContratoArca | null>(null);
  if (!operar?.puede || !operar.modo) return null;

  const operables = operar.contratos.filter((c) => c.relacionArca.puede);
  const abrir = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (operar.modo === "sin_contrato") setRef({ userProjectId: "", relacion: { empleadoraCuit: relacion.empleadoraCuit, cuil: relacion.cuil, fechaInicio: relacion.inicio } });
    else if (operar.modo === "contrato" && operables[0]) setRef(refDeContrato(operables[0]));
    else setEligiendo(true);
  };
  const titulo =
    operar.modo === "sin_contrato"
      ? "Baja, modificación o anulación de la relación en ARCA. No tiene contrato en WeProdu: el resultado no se guarda en ningún contrato."
      : operar.modo === "elegir"
        ? `Baja, modificación o anulación de la relación en ARCA. Hay ${operables.length} contratos de WeProdu con esa alta: hay que elegir cuál.`
        : "Baja, modificación o anulación de la relación en ARCA";

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={abrir} title={titulo} className="inline-flex items-center gap-1.5 p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 transition-colors text-xs font-semibold">
        <FontAwesomeIcon icon={faLandmark} className="h-4 w-4" />
        {conTexto && (operar.modo === "sin_contrato" ? "Operar sin contrato" : operar.modo === "elegir" ? "Elegir contrato" : "Relación en ARCA")}
      </button>

      {eligiendo && (
        <Modal isOpen onClose={() => setEligiendo(false)} title="¿Con qué contrato se opera?" size="md" zIndex={zIndex}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            La relación de ARCA que empieza el {fechaCorta(relacion.inicio)} coincide con {operables.length} contratos de WeProdu (misma persona, empleadora y fecha de alta). El resultado de la operación se guarda en el que elijas.
          </p>
          <ul className="space-y-2">
            {operables.map((c) => (
              <li key={`${c.userProjectId}-${c.posicion}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-sm">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{c.proyecto || "(sin proyecto)"}</p>
                  <p className="text-gray-600 dark:text-gray-400">
                    {c.contrato || "Contrato"} · {fechaCorta(c.alta)} → {c.baja ? fechaCorta(c.baja) : "sin baja"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEligiendo(false);
                    setRef(refDeContrato(c));
                  }}
                  className="btn-primary text-sm shrink-0"
                >
                  Operar con este
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {ref && <OperacionArcaModal isOpen onClose={() => setRef(null)} ref_={ref} zIndex={zIndex} onHecho={onHecho} />}
    </span>
  );
};

export default BotonOperarRelacionArca;
