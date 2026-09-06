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
 * Rol del campo dentro del registro de 130. Solo quedan los DOS que se editan.
 *
 * Había otros dos, `no_va` y `constante`, para los cuatro valores fijos —puesto desempeñado,
 * situación de revista, trabajador agropecuario y Lic. COVID—. Se dibujaban como campos apagados en
 * la grilla, con el argumento de que así la pantalla era reconocible contra la de ARCA y contestaban
 * solas la pregunta «¿el agropecuario no hay que cargarlo?».
 *
 * El costo era mayor: cuatro de trece casillas con forma de input vacío, y un input vacío se lee
 * como trabajo pendiente. El badge «constante» tampoco ayudaba, porque tenía el mismo peso visual
 * que el badge de posición y significa lo contrario — uno marca lo que hay que completar, el otro lo
 * que no. La pregunta se sigue contestando, pero en el plegable «Valores fijos» de `FormularioArca`,
 * que la responde una vez y no ocupa un tercio del formulario mientras tanto.
 *
 * Para lo que va al archivo y no se edita acá está `FilaArca`, más abajo.
 */
export type RolCampo =
  /** Va al archivo. La etiqueta dice en qué posición. */
  | 'campo'
  /** No se exporta, pero sin él no se puede elegir bien el de abajo. */
  | 'filtra';

const TAG: Record<RolCampo, string> = {
  campo: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/70',
  filtra: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/70',
};

export const CampoArca: React.FC<{
  rotulo: string;
  /** Key del diccionario de explicaciones, para el ⓘ. Opcional. */
  info?: string;
  rol: RolCampo;
  /**
   * Texto de la etiqueta: "40–45", "constante".
   *
   * OPCIONAL: sin etiqueta no se dibuja el badge. Los campos que solo filtran no llevan ninguna — lo
   * que hacen y que no llegan al archivo está en su ⓘ, y un badge repitiéndolo competía por atención
   * con los que sí dicen algo que no está en otro lado: la posición en el registro de 130.
   */
  etiqueta?: string;
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
  /*
   * La posición en el registro, para enganchar con su renglón de la vista previa (`useResaltadoTramo`).
   *
   * Solo en los campos que VAN al archivo: en los demás roles la etiqueta no es una posición sino la
   * palabra «constante», y marcarla mandaría a buscar un tramo «constante» que no existe.
   */
  const posEnRegistro = rol === 'campo' && etiqueta ? etiqueta : undefined;

  return (
    <div className="mb-3" data-campo={campo} data-depende-de={dependeDe} data-pos={posEnRegistro}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12px] text-gray-600 dark:text-gray-400 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{rotulo}</span>
          {info && <InfoCampo campo={info} />}
        </span>
        {/* `uppercase` por CSS y no en cada string: las etiquetas se escriben en prosa («constante»)
            y así el estilo es uno solo. Los rangos de posición («74–78») no se ven afectados. */}
        {etiqueta && <span className={`shrink-0 text-[9.5px] px-1.5 py-px rounded border tracking-wide uppercase ${TAG[rol]}`}>{etiqueta}</span>}
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
 * UNA FILA DE SOLO LECTURA. Va al archivo, pero acá no se decide nada.
 *
 * Es el reemplazo de los campos que eran `<select>` deshabilitados o inputs vacíos. Un control con
 * forma de control promete una decisión: si está apagado se lee como «esto falta» o «esto está roto»,
 * y en los tres casos que usa esta fila no falta nada.
 *
 *   ACTIVIDAD HEREDADA      la sucursal declara una sola, así que no hay nada que elegir
 *   CÓDIGOS DEL CONTRATO    modalidad, tipo de servicio y modalidad de liquidación: se editan en el
 *                           tipo de contrato, que es donde una edición vale para los 143 que lo usan
 *   FECHA DE FIN QUE NO VA  con modalidad indeterminada el registro la exige en blanco
 *
 * Conserva el BADGE DE POSICIÓN, que es lo que no se puede perder: que el dato no se edite acá no lo
 * saca del registro de 130, y sin el badge se rompe la correspondencia con «Cómo queda en el archivo».
 *
 * Texto y no un input deshabilitado también por lectores de pantalla: un `disabled` no se tabula y su
 * valor no se anuncia, así que la respuesta quedaba fuera del alcance de quien no ve la pantalla.
 */
export const FilaArca: React.FC<{
  rotulo: string;
  /** Key del diccionario de explicaciones, para el ⓘ. */
  info?: string;
  /** Posición en el registro de 130. Se muestra con el mismo badge verde que los campos editables. */
  etiqueta?: string;
  /** Código, monoespaciado. Vacío dispara el estado de falta. */
  valor?: string;
  /** Descripción al lado del código. */
  nombre?: string;
  /** Por qué el valor es ese y no se edita acá. */
  origen?: React.ReactNode;
  /** Qué decir cuando no hay valor. Sin esto se muestra «— sin cargar». */
  vacio?: string;
  /**
   * El vacío es un PROBLEMA, no un «no corresponde».
   *
   * Los códigos del tipo de contrato sin cargar frenan el TXT y van en ámbar; la fecha de fin que no
   * corresponde está bien vacía y va en gris. La misma fila con las dos lecturas necesita que quien
   * la usa diga cuál es: adivinarlo por el rótulo sería adivinar.
   */
  faltaEsError?: boolean;
  campo?: string;
  dependeDe?: string;
}> = ({ rotulo, info, etiqueta, valor, nombre, origen, vacio, faltaEsError, campo, dependeDe }) => {
  const falta = !valor;
  const posEnRegistro = etiqueta;
  return (
    <div className="mb-3" data-campo={campo} data-depende-de={dependeDe} data-pos={posEnRegistro}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-[12px] text-gray-600 dark:text-gray-400 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{rotulo}</span>
          {info && <InfoCampo campo={info} />}
        </span>
        {etiqueta && <span className={`shrink-0 text-[9.5px] px-1.5 py-px rounded border tracking-wide uppercase ${TAG.campo}`}>{etiqueta}</span>}
      </div>

      {/* Sin recuadro: el borde es lo que dice «esto se toca». La sangría y el monoespaciado alcanzan
          para que se lea como un valor y no como prosa. */}
      <div className="px-0.5 flex items-baseline gap-2 min-w-0">
        {falta ? (
          <span className={`text-[12.5px] ${faltaEsError ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>{vacio || '— sin cargar'}</span>
        ) : (
          <>
            <span className="font-mono text-[12.5px] text-gray-900 dark:text-gray-100 shrink-0">{valor}</span>
            {nombre && <span className="text-[12px] text-gray-500 dark:text-gray-400 truncate">{nombre}</span>}
          </>
        )}
      </div>

      {origen && <p className="text-[10.5px] text-gray-500 dark:text-gray-500 mt-0.5 px-0.5 leading-snug">{origen}</p>}
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
