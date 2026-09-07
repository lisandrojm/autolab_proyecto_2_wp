import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar as faStarSolid } from "@fortawesome/free-solid-svg-icons";
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
export const useArcaDefaults = (): { defaults: ArcaDefaults; marcar: (campo: CampoDefaultArca, valor: string | null) => Promise<void> } => {
  const [defaults, setDefaults] = useState<ArcaDefaults>(cache || {});

  useEffect(() => {
    suscriptores.add(setDefaults);
    if (cache) setDefaults(cache);
    else {
      cargando =
        cargando ||
        arcaDefaultsAPI.get().catch(() => ({}) as ArcaDefaults);
      cargando.then(publicar);
    }
    return () => {
      suscriptores.delete(setDefaults);
    };
  }, []);

  const marcar = useCallback(async (campo: CampoDefaultArca, valor: string | null) => {
    try {
      const actualizado = await arcaDefaultsAPI.set(campo, valor);
      publicar(actualizado);
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
}

export const DefaultArcaStar: React.FC<Props> = ({ campo, valor, queEs }) => {
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
        marcar(campo, esElDefault ? null : valor);
      }}
      title={esElDefault ? `Es ${queEs} por defecto. Click para quitarlo.` : `Marcar como ${queEs} por defecto de la instalación`}
      aria-pressed={esElDefault}
      className={`transition-colors ${esElDefault ? "text-amber-500 hover:text-amber-600" : "text-gray-300 dark:text-gray-600 hover:text-amber-400"}`}
    >
      <FontAwesomeIcon icon={esElDefault ? faStarSolid : faStarRegular} className="h-3.5 w-3.5" />
    </button>
  );
};
