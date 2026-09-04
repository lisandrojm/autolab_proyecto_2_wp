import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faRotate, faCircleInfo } from '@fortawesome/free-solid-svg-icons';

/** Lo que devuelve el backend en `condicionFiscal`. Ver `server/src/services/arca/condicionFiscal.ts`. */
export interface CondicionFiscalArcaData {
  tipo: 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO' | 'EXENTO' | 'NO_ALCANZADO' | 'SIN_ACTIVIDAD' | 'DESCONOCIDO';
  descripcion: string;
  claveInactiva: boolean;
  tipoClave?: string;
  estadoClave?: string;
  monotributo?: {
    categoria?: string;
    descripcionCategoria?: string;
    periodo?: string;
    actividadPrincipal?: { id?: number; descripcion?: string };
  } | null;
  regimenGeneral?: { impuestos: Array<{ id?: number; descripcion?: string; estado?: string; periodo?: string }> } | null;
  error?: string;
  consultadoEn: string;
  fuente: string;
}

/** Un período de ARCA viene como "202601". Se muestra como 01/2026, que es como se lee. */
const periodoLegible = (p?: string): string => {
  const s = String(p || '').trim();
  return /^\d{6}$/.test(s) ? `${s.slice(4)}/${s.slice(0, 4)}` : s;
};

const fechaLegible = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
};

const CHIP: Record<CondicionFiscalArcaData['tipo'], string> = {
  MONOTRIBUTO: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  RESPONSABLE_INSCRIPTO: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  EXENTO: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  NO_ALCANZADO: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  SIN_ACTIVIDAD: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  DESCONOCIDO: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

/** El texto del chip. Monotributo lleva la categoría, que es el dato que se usa. */
const etiqueta = (d: CondicionFiscalArcaData): string => {
  if (d.tipo === 'MONOTRIBUTO') return d.monotributo?.categoria ? `Monotributo · Cat. ${d.monotributo.categoria}` : 'Monotributo';
  if (d.tipo === 'RESPONSABLE_INSCRIPTO') return 'Responsable Inscripto';
  if (d.tipo === 'SIN_ACTIVIDAD') return 'Sin actividad registrada en ARCA';
  if (d.tipo === 'DESCONOCIDO') return 'No se pudo determinar';
  return d.descripcion;
};

interface Props {
  /** `null` mientras no se validó el CUIT: ahí el componente no muestra nada. */
  data: CondicionFiscalArcaData | null;
  cargando?: boolean;
  /** Vuelve a consultar salteando el cache. Sin esto, no se muestra el botón. */
  onActualizar?: () => void;
  /** Texto propio para el formulario público, más explicativo. */
  ayuda?: string;
}

/**
 * La condición fiscal del CUIT, tal como la devolvió ARCA. SIEMPRE de solo lectura.
 *
 * No es un campo del formulario: es lo que el organismo tiene sobre esa persona. Dejarlo editable
 * invitaría a «corregirlo» cuando no coincide con lo que alguien esperaba, y a partir de ahí la
 * plataforma afirmaría una condición fiscal que ARCA no respalda.
 *
 * SIN_ACTIVIDAD no se muestra como un problema, y es la decisión que ordena el resto: en un padrón de
 * talentos, un CUIL de alguien en relación de dependencia es el caso más común. Pintarlo de rojo
 * marcaría como incompletos a cientos de usuarios que están perfectos.
 */
export const CondicionFiscalArca: React.FC<Props> = ({ data, cargando, onActualizar, ayuda }) => {
  if (cargando) {
    return (
      <div className="mt-2 animate-pulse">
        <div className="h-6 w-48 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-64 rounded bg-gray-100 dark:bg-gray-800 mt-2" />
      </div>
    );
  }
  // Sin validar no hay nada que decir: un cartel vacío se lee como un dato faltante.
  if (!data) return null;

  const impuestosActivos = (data.regimenGeneral?.impuestos || []).filter((i) => String(i.estado || '').toUpperCase().startsWith('AC'));

  return (
    <div className="mt-2 space-y-2">
      {/* La clave inactiva va ARRIBA y aparte: se puede ser monotributista y tener la clave de baja, y
          es lo que hay que resolver antes de poder facturar. */}
      {data.claveInactiva && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <span className="text-xs text-amber-800 dark:text-amber-300">
            Clave fiscal <strong>INACTIVA</strong> en ARCA{data.estadoClave ? ` (${data.estadoClave})` : ''}.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${CHIP[data.tipo]}`}>{etiqueta(data)}</span>
        {data.tipoClave && <span className="text-[11px] text-gray-500 dark:text-gray-400">{data.tipoClave}</span>}
        {data.tipo === 'SIN_ACTIVIDAD' && (
          <span
            title="Es lo normal en un CUIL de alguien en relación de dependencia: no tiene actividad propia registrada ante ARCA. No impide darlo de alta."
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
          </span>
        )}
        {data.tipo === 'DESCONOCIDO' && onActualizar && (
          <button type="button" onClick={onActualizar} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            <FontAwesomeIcon icon={faRotate} className="h-3 w-3" />
            Reintentar
          </button>
        )}
      </div>

      {data.tipo === 'MONOTRIBUTO' && data.monotributo?.actividadPrincipal?.descripcion && (
        <p className="text-[11px] text-gray-600 dark:text-gray-400">
          {data.monotributo.actividadPrincipal.descripcion}
          {data.monotributo.periodo ? ` · desde ${periodoLegible(data.monotributo.periodo)}` : ''}
        </p>
      )}

      {data.tipo === 'RESPONSABLE_INSCRIPTO' && impuestosActivos.length > 0 && (
        <p className="text-[11px] text-gray-600 dark:text-gray-400">{impuestosActivos.map((i) => i.descripcion || i.id).join(' · ')}</p>
      )}

      {(data.tipo === 'EXENTO' || data.tipo === 'NO_ALCANZADO') && <p className="text-[11px] text-gray-600 dark:text-gray-400">{data.descripcion}</p>}

      {/* El motivo del fallo, tal cual: «servicio no autorizado» y «timeout» se arreglan distinto. */}
      {data.error && <p className="text-[11px] text-gray-500 dark:text-gray-400">{data.error}</p>}

      {ayuda && <p className="text-[11px] text-gray-500 dark:text-gray-400">{ayuda}</p>}

      {/* La fecha no es decorativa: esto es una foto del padrón, no el estado de hoy. */}
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Consultado el {fechaLegible(data.consultadoEn)} · Fuente: ARCA
        {onActualizar && (
          <button type="button" onClick={onActualizar} className="ml-2 text-blue-600 dark:text-blue-400 hover:underline">
            Actualizar
          </button>
        )}
      </p>
    </div>
  );
};
