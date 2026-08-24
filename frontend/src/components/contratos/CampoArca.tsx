import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faSpinner, faLock } from '@fortawesome/free-solid-svg-icons';
import { InfoCampo } from './DatosArcaDetalle';

/**
 * Una celda del formulario de Datos ARCA. Tres líneas, siempre en el mismo orden:
 *
 *   rótulo + etiqueta de rol
 *   [ valor · ▾ ]        ← se clickea y abre el picker
 *   de dónde sale el valor · a qué más afecta
 *
 * La tercera línea es la que hacía falta y no existía: el operador veía "Modalidad de contrato:
 * Falta" sin saber que el dato vive en el tipo de contrato y que cargarlo toca a los 143 contratos
 * que lo usan. Se enteraba después, viendo cambiar otras fichas.
 */

/**
 * Rol del campo dentro del registro de 130.
 *
 * Los `no_va` y `constante` se muestran igual, en gris y sin poder editarse. Ocupan lugar a
 * propósito: son los que hacen que la pantalla sea reconocible contra la de ARCA, y contestan solos
 * la pregunta que se repite ("¿el agropecuario no hay que cargarlo?"). Antes eso vivía en una nota
 * al pie que había que scrollear.
 */
export type RolCampo =
  /** Va al archivo. `posicion` dice dónde. */
  | 'campo'
  /** No se exporta, pero sin él no se puede elegir bien el de abajo. */
  | 'filtra'
  /** El registro lo deja en blanco. */
  | 'no_va'
  /** Siempre el mismo valor. */
  | 'constante';

const TAG: Record<RolCampo, string> = {
  campo: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/70',
  filtra: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/70',
  no_va: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  constante: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

export const CampoArca: React.FC<{
  rotulo: string;
  /** Key del diccionario de explicaciones, para el ⓘ. Opcional. */
  info?: string;
  rol: RolCampo;
  /** Texto de la etiqueta: "40–45", "filtra categoría", "no va", "constante". */
  etiqueta: string;
  /** Código/valor principal, monoespaciado. Vacío = falta. */
  valor?: string;
  /** Descripción al lado del código. */
  nombre?: string;
  /** Tercera línea: de dónde sale. Acepta JSX para poder resaltar el nivel. */
  origen?: React.ReactNode;
  /** Qué hacer cuando se clickea. Sin esto la celda es de solo lectura. */
  onEditar?: () => void;
  /** Texto del afford a la derecha cuando es editable. Default: chevron. */
  accion?: string;
  guardando?: boolean;
  /** El campo no se puede tocar todavía porque depende de otro. */
  enEspera?: boolean;
  /** Marca el recuadro en ámbar: falta un dato obligatorio. */
  falta?: boolean;
  /** Marca el recuadro en rojo: el dato está pero es inconsistente. */
  error?: boolean;
  /**
   * Nombre corto y estable de este campo, para poder relacionarlo con otros.
   *
   * Sale al DOM como `data-campo` y es lo que buscan los `dependeDe` de los demás. No es un id de
   * React: tiene que ser el mismo nombre en los dos extremos de la relación.
   */
  campo?: string;
  /**
   * De qué campos depende éste, separados por espacio ("obraSocial grupoTipoServicio").
   *
   * Depender es cualquiera de las dos cosas que pasan en este formulario: que el otro FILTRE las
   * opciones de éste (convenio → categoría) o que lo HABILITE (obra social → casi todo). Las dos se
   * ven igual desde acá —tocar el otro cambia lo que se puede elegir en éste— y por eso comparten
   * mecanismo. Ver `.dep-group` y el resaltado en `index.css`.
   */
  dependeDe?: string;
}> = ({ rotulo, info, rol, etiqueta, valor, nombre, origen, onEditar, accion, guardando, enEspera, falta, error, campo, dependeDe }) => {
  const editable = !!onEditar && !enEspera;
  const borde = error ? 'border-red-400 dark:border-red-700 bg-red-50/50 dark:bg-red-950/20' : falta ? 'border-amber-400 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40';
  /*
   * La línea de ayuda es la que dice de dónde sale el valor y a qué más afecta —"del convenio 0634/11",
   * "se habilita al validar la obra social"—, y hasta acá estaba solo al lado del control, sin
   * asociarle. Un lector de pantalla anunciaba "Categoría, botón" y nada más. Con el `id` acá y el
   * `aria-describedby` en el control, la relación se lee junto con el campo, que es el único indicador
   * que existe para quien no ve el rail ni el resaltado.
   */
  const idAyuda = campo && origen ? `arca-ayuda-${campo}` : undefined;

  return (
    <div className="mb-3" data-campo={campo} data-depende-de={dependeDe}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12px] text-gray-600 dark:text-gray-400 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{rotulo}</span>
          {info && <InfoCampo campo={info} />}
        </span>
        <span className={`shrink-0 text-[9.5px] px-1.5 py-px rounded border tracking-wide ${TAG[rol]}`}>{etiqueta}</span>
      </div>

      <div
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={editable ? onEditar : undefined}
        onKeyDown={editable ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onEditar!()) : undefined}
        aria-describedby={idAyuda}
        className={`rounded-md border px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors ${borde} ${editable ? 'cursor-pointer hover:border-blue-500 dark:hover:border-blue-400' : 'cursor-default opacity-70'}`}
      >
        <span className="min-w-0 flex items-baseline gap-2">
          {valor ? (
            <>
              <span className="font-mono text-[12.5px] text-gray-900 dark:text-gray-100 shrink-0">{valor}</span>
              {nombre && <span className="text-[12px] text-gray-500 dark:text-gray-400 truncate">{nombre}</span>}
            </>
          ) : (
            <span className={`text-[12.5px] ${enEspera ? 'text-gray-400 dark:text-gray-500' : error ? 'text-red-600 dark:text-red-400' : falta ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>{enEspera ? '— en espera' : error ? 'Mal cargado' : falta ? 'Falta' : nombre || '— en blanco'}</span>
          )}
        </span>
        <span className="shrink-0 text-[11px] text-blue-500 dark:text-blue-400 flex items-center gap-1">
          {guardando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : enEspera ? <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5 text-gray-400" /> : editable ? accion || <FontAwesomeIcon icon={faChevronDown} className="h-2.5 w-2.5" /> : null}
        </span>
      </div>

      {origen && (
        <p id={idAyuda} className="text-[10.5px] text-gray-500 dark:text-gray-500 mt-1 px-0.5 leading-snug">
          {origen}
        </p>
      )}
    </div>
  );
};

/**
 * Envuelve un par PADRE + HIJO adyacentes de la misma columna: el de arriba filtra las opciones del
 * de abajo. Hoy son exactamente dos, Convenio → Categoría y Grupo Tipo Servicio → Tipo Servicio.
 *
 * Un rail a la izquierda y un fondo apenas teñido que se desvanece hacia la derecha. La dirección la
 * da el degradado del rail, de arriba (fuerte) hacia abajo (tenue): se lee que el de arriba manda.
 *
 * TRES COSAS QUE SE PROBARON Y NO ENTRARON
 *
 *  - Un marco completo por par. El modal ya carga badges de posición, badges de filtro, candados,
 *    bordes ámbar de "falta" y rojos de "mal cargado". Un borde más compite con los que significan
 *    algo. El rail ocupa 2px y no cierra ninguna figura.
 *  - Un título o leyenda arriba del grupo. El badge «filtra categoría» del padre y la línea de ayuda
 *    del hijo ya lo dicen con palabras; el caption quedaba como ruido encima de dos campos que se
 *    entienden solos.
 *  - Una flecha «↳» entre padre e hijo. Queda huérfana en su propio renglón y el rail ya agrupa.
 *
 * El rail y el fondo son DECORATIVOS y no pueden ser el único indicador: la relación está dicha en
 * texto en la línea de ayuda de cada campo, y ese texto es el que se asocia por `aria-describedby`.
 * `aria-label` nombra al grupo para que un lector de pantalla anuncie de qué par se trata.
 */
export const DepGroup: React.FC<{ etiqueta: string; children: React.ReactNode }> = ({ etiqueta, children }) => (
  <div role="group" aria-label={etiqueta} className="dep-group">
    {children}
  </div>
);
