import type React from "react";
import { useCallback, useState } from "react";
import { sweetAlert } from "../../utils/sweetAlert";

/**
 * LA FILA QUE SE VA DE LA BANDEJA (15/11/2026, pedido del usuario), igual en todas las bandejas de
 * Contratación: primero un aviso centrado que dice a qué bandeja pasa y se cierra solo; al cerrarse, la
 * fila se desliza hacia la izquierda y recién ahí sale de la lista. Es el gesto que Solicitudes tiene al
 * aprobar desde el 01/11/2026.
 */

/** Lo que tarda la fila en irse. El mismo que Solicitudes (`MS_SALIDA_FILA` de SolicitudesTable). */
export const MS_SALIDA = 700;

/** El estilo de la fila mientras se va: a la izquierda, desvaneciéndose y sin aceptar clics. */
export const estiloDeSalida = (saliendo: boolean): React.CSSProperties | undefined =>
  saliendo ? { transform: "translateX(-110%)", opacity: 0, transition: `transform ${MS_SALIDA}ms ease-in, opacity ${MS_SALIDA}ms ease-in`, pointerEvents: "none" } : undefined;

/** El fondo verde de la fila que se va, para que se lea como «salió bien» y no como un error. */
export const CLASE_SALIENDO = "bg-green-50 dark:bg-green-900/20";

/** Quién se va y a qué bandeja. */
export interface Salida {
  nombre: string;
  destino: string;
}

/**
 * El texto del aviso: con uno, «Ana Paz pasa a Generar documentos.»; con varios, agrupados por destino
 * («3 pasan a Generar documentos: Ana Paz, Juan Gil y Luis Sosa.»). Más de seis nombres no se listan.
 */
export const textoDeSalidas = (salidas: Salida[]): string => {
  if (salidas.length === 1) return `${salidas[0].nombre} pasa a ${salidas[0].destino}.`;
  const porDestino = new Map<string, string[]>();
  for (const s of salidas) porDestino.set(s.destino, [...(porDestino.get(s.destino) || []), s.nombre]);
  return [...porDestino.entries()]
    .map(([destino, nombres]) => {
      if (nombres.length === 1) return `${nombres[0]} pasa a ${destino}.`;
      const cabeza = `${nombres.length} pasan a ${destino}`;
      return nombres.length > 6 ? `${cabeza}.` : `${cabeza}: ${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}.`;
    })
    .join(" ");
};

/**
 * `saliendo`: las claves de las filas que se están yendo (para `estiloDeSalida`).
 * `despedir`: avisa, desliza y al final corre `sacar` (que es quien de verdad saca las filas de la lista).
 */
export const useSalidaDeFilas = () => {
  const [saliendo, setSaliendo] = useState<Set<string>>(new Set());
  const despedir = useCallback(async (claves: string[], salidas: Salida[], sacar: () => void, titulo = "Listo") => {
    await sweetAlert.successBreve(titulo, textoDeSalidas(salidas));
    setSaliendo((prev) => new Set([...prev, ...claves]));
    await new Promise((r) => window.setTimeout(r, MS_SALIDA));
    sacar();
    setSaliendo((prev) => {
      const s = new Set(prev);
      for (const k of claves) s.delete(k);
      return s;
    });
  }, []);
  return { saliendo, despedir };
};
