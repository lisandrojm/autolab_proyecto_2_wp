import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faSearch } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../Modal";
import { EstadoBadge } from "../../../../../components/EstadoSelect";
import { InfoItem } from "../../../../../api/info";
import { estadoImpositivoPorTipo, TipoImpositivo } from "../../../../../utils/tramiteImpositivo";

/*
  EL TIPO DE CONTRATO, COMO SE ELIGE EN EL ALTA INDIVIDUAL: el campo y su ventana.

  Vivían adentro de `UserRegistrationModal`. Las plantillas de equipo piden lo mismo —en el equipo, al
  contratar y por persona— y lo dibujaban de otra manera: pastillas sueltas, sin el trámite al lado.
  Es la misma plataforma y la misma decisión, así que es el mismo componente: quien ya eligió un
  contrato para una persona reconoce la pantalla cuando lo elige para catorce.

  EL TRÁMITE VA AL LADO, de sólo lectura, con el badge del ABM que usa el escritorio: el trámite no
  es una opción independiente, lo declara el tipo de contrato a través de sus plantillas.
*/

export interface ContratoParaElegir {
  _id: string;
  name: string;
}

interface Comun {
  contratos: ContratoParaElegir[];
  contratoId: string;
  /** El trámite que declara cada tipo de contrato («constancia_cuit» = servicios). */
  tramitePorContrato: Map<string, TipoImpositivo>;
  /** Los estados del ABM: de ahí salen el nombre y el color del badge del trámite. */
  estados: InfoItem[];
}

const estadoDelTramite = ({ estados, tramitePorContrato }: Pick<Comun, "estados" | "tramitePorContrato">, contratoId: string) => {
  const tipo = tramitePorContrato.get(contratoId);
  return tipo ? estadoImpositivoPorTipo(estados, tipo) : null;
};

/** El campo: lo elegido con su trámite, o «Elegí el tipo de contrato…». Toca y abre la ventana. */
export function CampoTipoContrato({ contratos, contratoId, tramitePorContrato, estados, onAbrir, obligatorio = true, marca }: Comun & { onAbrir: () => void; obligatorio?: boolean; /** Algo al lado del rótulo (ej. «distinto» en un puesto). */ marca?: React.ReactNode }) {
  const elegido = contratos.find((c) => c._id === contratoId) || null;
  const estado = elegido ? estadoDelTramite({ estados, tramitePorContrato }, elegido._id) : null;
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <FontAwesomeIcon icon={faFileContract} className="text-[10px] text-blue-500" />
        Tipo de contrato {obligatorio && <span className="text-red-500">*</span>}
        {marca}
      </label>
      {contratos.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">No hay tipos de contrato configurados. Avisale a administración: sin esto la solicitud no dice qué se va a firmar.</p>
      ) : (
        <button type="button" onClick={onAbrir} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left dark:border-slate-700 dark:bg-slate-900">
          {elegido ? (
            <>
              <span className="flex-1 text-sm font-medium text-slate-900 dark:text-white">{elegido.name}</span>
              {estado ? <EstadoBadge name={estado.name} /> : <span className="text-[10px] italic text-slate-400">sin trámite configurado</span>}
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faSearch} className="text-[10px] text-slate-400" />
              <span className="flex-1 text-sm text-slate-400">Elegí el tipo de contrato…</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * La ventana: una fila por tipo, con su radio y su badge de trámite. Tocar una elige y cierra; «Listo»
 * cierra sin cambiar. Va en ventana propia porque son catorce tipos con su badge al lado, y esa lista
 * adentro del formulario tapa el resto en un teléfono.
 */
export function ModalTipoContrato({ abierto, onCerrar, contratos, contratoId, tramitePorContrato, estados, onElegir, zIndex = 80 }: Comun & { abierto: boolean; onCerrar: () => void; onElegir: (contratoId: string) => void; zIndex?: number }) {
  return (
    <Modal
      isOpen={abierto}
      onClose={onCerrar}
      title="Tipo de contrato"
      subtitle="El trámite ante ARCA sale de lo que elijas"
      size="md"
      zIndex={zIndex}
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <button type="button" onClick={onCerrar} className="rounded-lg bg-blue-500 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
            Listo
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-2 py-2">
        {contratos.map((c) => {
          const elegido = contratoId === c._id;
          const estado = estadoDelTramite({ estados, tramitePorContrato }, c._id);
          return (
            <button
              key={c._id}
              type="button"
              onClick={() => {
                onElegir(c._id);
                onCerrar();
              }}
              aria-pressed={elegido}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${elegido ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400" : "border-slate-100 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}
            >
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${elegido ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>{elegido && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</div>
              <span className="flex-1 text-sm font-medium">{c.name}</span>
              {/* El badge sale del ABM: respeta el nombre y el color configurados, incluido el renombre de AFIP a ARCA. */}
              {estado ? <EstadoBadge name={estado.name} /> : <span className="text-[10px] italic text-slate-400">sin trámite</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
