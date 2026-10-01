import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark, faArrowRight } from "@fortawesome/free-solid-svg-icons";
import type { SimpleCatalogItem } from "../../api/simpleCatalog";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { contratosAPI, ContratoItem, tiposDeContratoActivos } from "../../api/contratos";
import { cachedFetch } from "../../utils/refCache";
import { ChipValoracion } from "./ChipValoracion";

export interface ValoracionDeRolForm {
  /** `RoleFrame.data.rol.id`: el mismo número que guarda el contrato en `rol_frame_id`. */
  rolFrameId: number;
  /** `_id` del Contrato (tipo de contrato). Vacío = cualquier tipo (solo filas de antes: la pantalla lo pide). */
  contratoId?: string | null;
  valoracionId: string;
}

const claveDe = (x: { rolFrameId: number; contratoId?: string | null }) => `${x.rolFrameId}|${x.contratoId || ""}`;

/**
 * EXCEPCIONES DE VALORACIÓN POR ROL EMPRESA + TIPO DE CONTRATO, dentro de un proyecto.
 *
 * El proyecto tiene una valoración (la del margen, o forzada). Esto permite decir «en ESTE proyecto,
 * al Camarógrafo con contrato Jornada, siempre Oro», aunque al proyecto le toque Plata o Bronce: al
 * contratar a alguien con ese rol y ese tipo de contrato se ofrecen las categorías de la valoración
 * elegida acá. Todo lo demás sigue con la del proyecto. La regla que lo aplica es `valoracionParaRol` (`@compartido/valoracionPorRol`), la
 * misma en el server, la web y la app.
 *
 * Se agrega con un botón explícito, como forzar la valoración: es una excepción, no un ajuste más.
 */
export const ValoracionesPorRol: React.FC<{
  valoraciones: SimpleCatalogItem[];
  value: ValoracionDeRolForm[];
  onChange: (v: ValoracionDeRolForm[]) => void;
  className?: string;
}> = ({ valoraciones, value, onChange, className = "" }) => {
  const [roles, setRoles] = useState<RoleFrameItem[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [rolNuevo, setRolNuevo] = useState("");
  const [contratoNuevo, setContratoNuevo] = useState("");
  const [contratos, setContratos] = useState<ContratoItem[]>([]);

  useEffect(() => {
    cachedFetch("roleFrames:all", () => roleFrameAPI.list())
      .then((r) => setRoles(Array.isArray(r) ? r : []))
      .catch(() => setRoles([]));
    cachedFetch("contratos:all", () => contratosAPI.list())
      .then((c) => setContratos(Array.isArray(c) ? c : []))
      .catch(() => setContratos([]));
  }, []);
  const nombreContrato = (id?: string | null) => (id ? contratos.find((c) => c._id === id)?.name || "Tipo de contrato" : "Cualquier tipo de contrato");

  const activas = useMemo(() => [...valoraciones].filter((v) => v.activo !== false).sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0)), [valoraciones]);
  const rolDe = (id: number) => roles.find((r) => Number(r.data?.rol?.id) === id);
  const nombreRol = (id: number) => rolDe(id)?.name || rolDe(id)?.data?.rol?.nombre || `Rol ${id}`;
  /** Qué valoraciones tiene el rol entre sus categorías: forzar una que no tiene no ofrecería ninguna. */
  const cubre = (id: number, valoracionId: string) => (rolDe(id)?.data?.categoriasSat || []).some((c) => String(c.valoracionId || "") === valoracionId);
  const rolesOrdenados = useMemo(() => roles.filter((r) => r.data?.rol?.id != null).sort((a, b) => String(a.name).localeCompare(String(b.name), "es", { sensitivity: "base" })), [roles]);
  // Para agregar una excepción, sólo los tipos activos; las filas ya cargadas muestran su nombre igual (`nombreContrato`).
  const contratosOrdenados = useMemo(() => tiposDeContratoActivos(contratos).sort((a, b) => String(a.name).localeCompare(String(b.name), "es", { sensitivity: "base" })), [contratos]);
  /** Ese rol con ese tipo ya tiene excepción: no se ofrece de nuevo (se cambia en su fila). */
  const yaEsta = (rolFrameId: number, contratoId: string) => value.some((x) => claveDe(x) === claveDe({ rolFrameId, contratoId }));

  const poner = (fila: ValoracionDeRolForm) => onChange([...value.filter((x) => claveDe(x) !== claveDe(fila)), fila]);
  const quitar = (fila: ValoracionDeRolForm) => onChange(value.filter((x) => claveDe(x) !== claveDe(fila)));

  /** Los badges de las valoraciones para elegir. Las que el rol no tiene van apagadas, con el porqué. */
  const selector = (rolFrameId: number, elegida: string, alElegir: (id: string) => void) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {activas.map((v) => {
        const tiene = !rolFrameId || cubre(rolFrameId, v._id);
        return (
          <button
            key={v._id}
            type="button"
            onClick={() => alElegir(v._id)}
            title={tiene ? `Siempre ${v.name} para este rol` : `Este rol no tiene categorías ${v.name}: al contratar no se ofrecería ninguna de ese nivel.`}
            className={`rounded transition-shadow ${v._id === elegida ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900" : "hover:ring-2 hover:ring-blue-300"} ${tiene ? "" : "opacity-40"}`}
          >
            <ChipValoracion nombre={String(v.name)} color={String(v.color || "")} />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Valoración por rol empresa y tipo de contrato</label>
        {value.length > 0 && <span className="text-[11px] text-gray-400">({value.length})</span>}
        {!agregando && (
          <button type="button" onClick={() => setAgregando(true)} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
            Fijar valoración de un rol por tipo de contrato
          </button>
        )}
      </div>

      {value.length === 0 && !agregando && <p className="text-[11px] text-gray-500 dark:text-gray-400">Todos los roles y tipos de contrato usan la valoración del proyecto.</p>}

      {value.length > 0 && (
        <ul className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
          {[...value]
            .sort((a, b) => nombreRol(a.rolFrameId).localeCompare(nombreRol(b.rolFrameId), "es", { sensitivity: "base" }) || nombreContrato(a.contratoId).localeCompare(nombreContrato(b.contratoId), "es", { sensitivity: "base" }))
            .map((x) => {
              const v = valoraciones.find((o) => o._id === x.valoracionId);
              return (
                <li key={claveDe(x)} className="px-3 py-2 flex flex-wrap items-center gap-2">
                  <span className="min-w-[12rem]">
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{nombreRol(x.rolFrameId)}</span>
                    <span className={`block text-[11px] ${x.contratoId ? "text-gray-500 dark:text-gray-400" : "text-amber-700 dark:text-amber-400"}`}>{nombreContrato(x.contratoId)}</span>
                  </span>
                  <FontAwesomeIcon icon={faArrowRight} className="h-2.5 w-2.5 text-gray-400" />
                  {/*
                    SÓLO LA ELEGIDA. Con los tres niveles en cada fila no se leía cuál regía: parecían
                    opciones abiertas. Para cambiarla se quita con la ✕ y se vuelve a fijar.
                  */}
                  {v ? <ChipValoracion nombre={String(v.name)} color={String(v.color || "")} /> : <span className="text-[11px] text-gray-400">Valoración borrada</span>}
                  {v && !cubre(x.rolFrameId, x.valoracionId) && roles.length > 0 && <span className="text-[11px] text-amber-700 dark:text-amber-400">Este rol no tiene categorías {v.name}.</span>}
                  <button type="button" onClick={() => quitar(x)} title="Quitar: vuelve a usar la valoración del proyecto. Para cambiar el nivel, quitala y volvé a fijarla." aria-label={`Quitar ${nombreRol(x.rolFrameId)}`} className="ml-auto text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                    <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
        </ul>
      )}

      {/*
        AGREGAR ES EXPLÍCITO Y SE EXPLICA: sin esto, un nivel distinto para un rol se lee como un error
        de la valoración del proyecto, cuando es una decisión puntual.
      */}
      {agregando && (
        <div className="mt-2 rounded-lg border border-blue-200 dark:border-blue-800/70 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2.5 space-y-2">
          <p className="text-[11.5px] text-blue-900 dark:text-blue-200">
            <strong>Valoración fija para un rol y un tipo de contrato.</strong> En este proyecto, al contratar a alguien con ese rol empresa y ese tipo de contrato se ofrecen las categorías de la valoración que elijas, en lugar de la del proyecto. No depende del margen. El mismo rol con otro tipo de contrato, y los demás roles, siguen con la del proyecto.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input-field py-1.5 text-sm max-w-[16rem]" value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value)}>
              <option value="">Elegí el rol empresa…</option>
              {rolesOrdenados.map((r) => (
                <option key={r._id} value={r.data.rol.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select className="input-field py-1.5 text-sm max-w-[16rem]" value={contratoNuevo} onChange={(e) => setContratoNuevo(e.target.value)} disabled={!rolNuevo}>
              <option value="">Elegí el tipo de contrato…</option>
              {contratosOrdenados.map((c) => (
                <option key={c._id} value={c._id} disabled={!!rolNuevo && yaEsta(Number(rolNuevo), c._id)}>
                  {c.name}
                  {rolNuevo && yaEsta(Number(rolNuevo), c._id) ? " (ya tiene)" : ""}
                </option>
              ))}
            </select>
            {rolNuevo &&
              contratoNuevo &&
              selector(Number(rolNuevo), "", (id) => {
                poner({ rolFrameId: Number(rolNuevo), contratoId: contratoNuevo, valoracionId: id });
                setRolNuevo("");
                setContratoNuevo("");
                setAgregando(false);
              })}
            <button
              type="button"
              onClick={() => {
                setAgregando(false);
                setRolNuevo("");
                setContratoNuevo("");
              }}
              className="ml-auto text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
