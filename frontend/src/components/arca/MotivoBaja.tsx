import React, { useState } from "react";
import { Modal } from "../ui/Modal";
import { esRenuncia } from "@compartido/arca/motivoBaja";
import { arcaOperacionesAPI, type ReferenciaContratoArca } from "../../api/arcaOperaciones";

/*
  EL MOTIVO DE BAJA DEL CONTRATO PARA ARCA (22/11/2026). Dos campos que viven en el contrato: el motivo (el código de
  la tabla de situaciones de baja de ARCA) y, SÓLO si es renuncia, la fecha del telegrama. Con cualquier otro motivo
  ese campo ni aparece. No hay motivo por defecto, tampoco «vencimiento de plazo» para un plazo fijo: lo elige una
  persona. Las reglas son las de `compartido/arca/motivoBaja.ts`, las mismas que valida el server.

  `CamposMotivoBaja` son los dos campos (los usan el formulario del contrato, junto a la fecha de baja, y el modal de
  la fila de Bajas ARCA); `MotivoBajaModal` los guarda en el contrato desde Bajas ARCA, sin tocar ARCA.
*/

export interface SituacionDeBaja {
  codigo: string;
  descripcion: string;
}

export const CamposMotivoBaja: React.FC<{
  situaciones: SituacionDeBaja[];
  motivo: string;
  telegrama: string;
  onCambiar: (v: { motivo: string; telegrama: string }) => void;
  disabled?: boolean;
  /** Clases de las etiquetas: cada formulario tiene las suyas. */
  claseEtiqueta?: string;
}> = ({ situaciones, motivo, telegrama, onCambiar, disabled, claseEtiqueta = "block text-xs font-semibold text-gray-600 dark:text-gray-400" }) => (
  <>
    <div className="space-y-1.5">
      <label className={claseEtiqueta}>Motivo de baja (ARCA)</label>
      {/* Cambiar a un motivo que no es renuncia se lleva la fecha de telegrama: con otro motivo no existe. */}
      <select value={motivo} disabled={disabled} onChange={(e) => onCambiar({ motivo: e.target.value, telegrama: esRenuncia(e.target.value) ? telegrama : "" })} className="input-field w-full text-sm">
        <option value="">Sin motivo cargado</option>
        {/* Un código guardado que ya no está en la tabla se sigue viendo, para no borrarlo sin querer. */}
        {motivo && !situaciones.some((s) => s.codigo === motivo) && <option value={motivo}>{motivo} · (no está en la tabla de ARCA)</option>}
        {situaciones.map((s) => (
          <option key={s.codigo} value={s.codigo}>
            {s.codigo} · {s.descripcion}
          </option>
        ))}
      </select>
    </div>
    {esRenuncia(motivo) && (
      <div className="space-y-1.5">
        <label className={claseEtiqueta}>Fecha del telegrama de renuncia</label>
        <input type="date" value={telegrama} disabled={disabled} onChange={(e) => onCambiar({ motivo, telegrama: e.target.value })} className="input-field w-full text-sm" />
      </div>
    )}
  </>
);

export const MotivoBajaModal: React.FC<{
  onClose: () => void;
  onGuardado: () => void;
  ref_: ReferenciaContratoArca;
  /** De quién y de qué contrato es, para el subtítulo. */
  titulo: string;
  situaciones: SituacionDeBaja[];
  motivoInicial: string;
  telegramaInicial: string;
}> = ({ onClose, onGuardado, ref_, titulo, situaciones, motivoInicial, telegramaInicial }) => {
  const [v, setV] = useState({ motivo: motivoInicial, telegrama: telegramaInicial });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const sinCambios = v.motivo === motivoInicial && v.telegrama === telegramaInicial;

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      await arcaOperacionesAPI.guardarMotivoBaja(ref_, { motivo: v.motivo, fechaTelegrama: v.telegrama });
      onGuardado();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "No se pudo guardar el motivo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Motivo de baja"
      subtitle={titulo}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={guardando}>
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} className="btn-primary" disabled={guardando || sinCambios}>
            {guardando ? "Guardando…" : "Guardar en el contrato"}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Se guarda en el contrato de WeProdu; no manda nada a ARCA. Es el motivo con el que después se presenta la baja, y el panel lo trae precargado. No hay un motivo por defecto: si no lo elige una persona, queda sin cargar.
        </p>
        <CamposMotivoBaja situaciones={situaciones} motivo={v.motivo} telegrama={v.telegrama} onCambiar={setV} disabled={guardando} />
        {esRenuncia(v.motivo) && !v.telegrama && <p className="text-xs text-amber-700 dark:text-amber-300">Se puede guardar sin la fecha del telegrama, pero la fila va a quedar como «Falta la fecha de telegrama».</p>}
        {situaciones.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">La tabla de situaciones de baja de ARCA está vacía: sin ella no hay motivos para elegir.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};
