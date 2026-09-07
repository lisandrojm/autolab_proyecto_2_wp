import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar as faStarSolid, faEraser } from "@fortawesome/free-solid-svg-icons";
import { faStar as faStarRegular } from "@fortawesome/free-regular-svg-icons";
import { arcaDefaultsAPI, ArcaDefaults, CampoDefaultArca } from "../../api/arcaDefaults";
import { sweetAlert } from "../../utils/sweetAlert";

/**
 * LA ★ QUE MARCA EL VALOR POR DEFECTO DE LA INSTALACIÓN.
 *
 * Es el mismo gesto que ya usa la ficha de una empleadora para marcar SU convenio, SU domicilio y SU
 * grupo habituales — un click en la fila, sin formulario ni «Guardar cambios»—, un escalón más
 * abajo: esto es lo que vale cuando la empresa no dijo otra cosa.
 *
 * SE MARCA DONDE ESTÁ EL DATO. Antes, los defaults vivían en una pantalla aparte que los juntaba a
 * todos: para poner el tipo de servicio habitual había que ir a otro lado, elegirlo de un combo sin
 * el contexto del nomenclador —sin ver los códigos, ni los repetidos, ni de qué grupo era cada uno—
 * y volver. Marcándolo acá, se decide mirando la misma lista con la que se trabaja.
 *
 * Guarda con el click y manda SOLO su campo: dos pantallas abiertas en dos pestañas no se pisan.
 */

/** Estado compartido del documento único, para que N filas no disparen N requests. */
let cache: ArcaDefaults | null = null;
const suscriptores = new Set<(d: ArcaDefaults) => void>();
let cargando: Promise<ArcaDefaults> | null = null;

const publicar = (d: ArcaDefaults) => {
  cache = d;
  suscriptores.forEach((fn) => fn(d));
};

/**
 * Los defaults de la instalación, compartidos entre todas las filas de la pantalla.
 *
 * El cache no es una optimización cosmética: sin él, una tabla de 293 tipos de servicio dispararía
 * 293 GET del mismo documento, y cada ★ mostraría su propia copia del estado.
 */
export const useArcaDefaults = (): { defaults: ArcaDefaults; marcar: (campo: CampoDefaultArca, valor: string | null, aviso?: string) => Promise<void> } => {
  const [defaults, setDefaults] = useState<ArcaDefaults>(cache || {});

  useEffect(() => {
    suscriptores.add(setDefaults);
    if (cache) {
      setDefaults(cache);
    } else {
      /*
        UN FALLO NO SE CACHEA.

        Antes el `.catch` devolvía `{}` y eso se publicaba como si fuera la respuesta: `cache` pasaba
        a ser `{}` —que es truthy— y ya nunca se volvía a pedir. Con el backend recién levantado, o
        con un corte de red de un segundo, la ★ quedaba muerta para toda la sesión sin decir nada, y
        marcarla parecía no hacer efecto porque el estado local nunca llegaba a existir.

        Ahora un error deja el cache vacío y libera `cargando`, así que el próximo montaje reintenta.
      */
      cargando = cargando || arcaDefaultsAPI.get();
      cargando
        .then(publicar)
        .catch(() => {
          cargando = null;
        });
    }
    return () => {
      suscriptores.delete(setDefaults);
    };
  }, []);

  /**
   * `aviso` lo arma la ★, que es la que sabe qué fila se tocó; el hook solo guarda y publica.
   *
   * El guardado es un click suelto, sin formulario ni botón de guardar: sin una confirmación no hay
   * ninguna señal de que salió bien más allá de la estrella cambiando de color, que es exactamente
   * lo que se ve también cuando el request falla y el estado local ya se pintó.
   */
  const marcar = useCallback(async (campo: CampoDefaultArca, valor: string | null, aviso?: string) => {
    try {
      const actualizado = await arcaDefaultsAPI.set(campo, valor);
      publicar(actualizado);
      if (aviso) sweetAlert.success("Guardado", aviso);
    } catch (e: any) {
      sweetAlert.error("No se pudo guardar", e?.response?.data?.error || "No se pudo cambiar el valor por defecto.");
    }
  }, []);

  return { defaults, marcar };
};

interface Props {
  /** Qué campo del documento de defaults marca esta ★. */
  campo: CampoDefaultArca;
  /** El valor de ESTA fila: el código del nomenclador o el `_id`, según el campo. */
  valor: string;
  /** Cómo se nombra lo que se marca, para el tooltip ("el domicilio habitual", "el convenio…"). */
  queEs: string;
  /**
   * Cómo se llama ESTA fila, para el aviso de guardado.
   *
   * Sin esto el aviso tendría que mostrar `valor`, y en la mitad de las pantallas —domicilios,
   * convenios, fuentes— ese valor es un `_id`: un aviso que dice «Ahora el domicilio es
   * 6a5fd12244faed2e72669b42» no confirma nada, solo obliga a mirar la tabla para saber qué pasó.
   */
  nombre?: string;
}

export const DefaultArcaStar: React.FC<Props> = ({ campo, valor, queEs, nombre }) => {
  const { defaults, marcar } = useArcaDefaults();
  const actual = defaults[campo];
  const esElDefault = !!valor && String(actual ?? "") === String(valor);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        // Volver a clickear la ★ marcada la SACA: es la única forma de dejar la instalación sin
        // default, y sin eso habría que elegir uno cualquiera para poder quitar el anterior.
        /*
          Al desmarcar el aviso NO dice «se quitó el convenio»: en un ABM con un botón de eliminar en
          la misma fila, eso se lee como que se borró el registro. Dice que se quitó la MARCA, y el
          nombre va aparte, como dato.
        */
        marcar(campo, esElDefault ? null : valor, esElDefault ? `Ya no hay ${queEs} por defecto de la instalación.` : `Ahora ${queEs} es ${nombre || valor}.`);
      }}
      title={esElDefault ? `Es ${queEs} por defecto. Click para quitarlo.` : `Marcar como ${queEs} por defecto de la instalación`}
      aria-pressed={esElDefault}
      className={`transition-colors ${esElDefault ? "text-amber-500 hover:text-amber-600" : "text-gray-300 dark:text-gray-600 hover:text-amber-400"}`}
    >
      <FontAwesomeIcon icon={esElDefault ? faStarSolid : faStarRegular} className="h-3.5 w-3.5" />
    </button>
  );
};

/**
 * QUITAR EL VALOR POR DEFECTO, SIN TENER QUE ENCONTRAR LA FILA QUE LO TIENE.
 *
 * Desmarcar ya se podía —volver a clickear la ★ encendida la apaga—, pero eso exige *dar con ella*:
 * en Actividades son 2.350 filas y la marcada puede estar en cualquiera. Buscarla para apagarla es
 * un paseo por una tabla, y sin saber de antemano que el segundo click desmarca, ni siquiera se
 * intenta. Este botón hace lo mismo desde el encabezado de la columna.
 *
 * SOLO APARECE SI HAY ALGO MARCADO: un botón de limpiar sobre algo ya vacío no tiene efecto que
 * mostrar, y estando siempre visible haría dudar de si quedó algo puesto.
 */
export const LimpiarDefaultArca: React.FC<{ campo: CampoDefaultArca; queEs: string }> = ({ campo, queEs }) => {
  const { defaults, marcar } = useArcaDefaults();
  if (!String(defaults[campo] ?? "").trim()) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        marcar(campo, null, `Ya no hay ${queEs} por defecto de la instalación.`);
      }}
      title={`Quitar ${queEs} por defecto`}
      className="inline-flex items-center gap-1 text-[10px] font-semibold normal-case tracking-normal text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
    >
      <FontAwesomeIcon icon={faEraser} className="h-2.5 w-2.5" />
      Limpiar
    </button>
  );
};
