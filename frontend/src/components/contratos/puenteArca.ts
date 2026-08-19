import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * El puente con la extensión que valida obras sociales contra ARCA.
 *
 * WeProdu no puede leer la pantalla de ARCA: es otro dominio, con otra sesión, y el dato que hace
 * falta —la obra social que el organismo tiene registrada para un CUIL— no lo publica ningún
 * webservice. El puente es un userscript de Tampermonkey que corre en los DOS sitios y cruza los
 * datos por el almacén compartido de la extensión (`GM_setValue`), que es lo único que atraviesa la
 * frontera de dominio; `localStorage` no sirve porque es por-dominio.
 *
 * Acá vive el lado WeProdu del contrato, en un solo archivo, para que la interfaz con el script no
 * quede repartida en tres componentes que después divergen.
 *
 *   → `weprodu-os-start`   WeProdu manda la lista de CUIL y abre ARCA.
 *   ← `weprodu-os-results` el script devuelve `{ cuil, rnos, contractId }[]` — `rnos: ''` significa
 *                          que ARCA no tiene afiliación para esa persona, y es una RESPUESTA.
 *   → `weprodu-os-ready`   WeProdu avisa que ya puede recibir (ver `useResultadosArca`).
 *
 * TODO va por `document`, no por `window`. Tampermonkey ejecuta el script en un SANDBOX apenas hay un
 * `@grant` distinto de `none` —y este necesita `GM_setValue` para cruzar los datos entre ARCA y
 * WeProdu—: en ese modo el `window` del script no es el de la página, así que ni las marcas ni los
 * eventos llegan. El DOM es lo único compartido. Se usa `window` además, por si algún día no hay
 * sandbox, pero el que tiene que funcionar es `document`.
 */

/** La pantalla de altas, que es donde el script trabaja. Se abre en el mismo click que el disparo. */
export const ARCA_ALTAS_URL = 'https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/Contribuyente/RelacionLaboral/Altas.aspx';

export interface PedidoValidacion {
  cuil: string;
  contractId: string;
}

export interface ResultadoValidacion {
  cuil: string;
  /** '' = ARCA no tiene obra social para esa persona: rige la del convenio, y queda validado. */
  rnos: string;
  contractId?: string;
}

const leerMarca = (): string | null => {
  // Las marcas del DOM primero: son las que sobreviven al sandbox. `window` queda de respaldo.
  const meta = document.querySelector('meta[name="weprodu-os-ext"]')?.getAttribute('content');
  const attr = document.documentElement.getAttribute('data-weprodu-os');
  const w = window as unknown as { __weproduOSExt?: string };
  return meta || attr || w.__weproduOSExt || null;
};

/**
 * Versión de la extensión instalada, o `null`.
 *
 * Se consulta con reintentos y no una sola vez: el script corre en `document-idle` y React puede
 * montar antes. Un chequeo único le diría "no instalada" a quien la tiene, y esconde el botón que
 * justamente vino a usar.
 */
export function useExtensionArca(): string | null {
  const [version, setVersion] = useState<string | null>(leerMarca);

  useEffect(() => {
    if (version) return;
    let intentos = 0;
    const id = window.setInterval(() => {
      const v = leerMarca();
      if (v || ++intentos > 12) {
        if (v) setVersion(v);
        window.clearInterval(id);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [version]);

  return version;
}

/**
 * Arranca una corrida: siembra la cola en la extensión y abre ARCA.
 *
 * Las dos cosas van en el MISMO click del usuario: `window.open` fuera de un gesto directo lo bloquea
 * el navegador como popup, y el operador se queda con la cola sembrada y sin la pestaña donde el
 * script trabaja — esperando algo que nunca arranca.
 */
export function iniciarValidacionArca(pedidos: PedidoValidacion[]): boolean {
  const limpios = pedidos.map((p) => ({ cuil: String(p.cuil || '').replace(/\D/g, ''), contractId: p.contractId })).filter((p) => p.cuil.length === 11);
  if (limpios.length === 0) return false;
  document.dispatchEvent(new CustomEvent('weprodu-os-start', { detail: limpios }));
  window.dispatchEvent(new CustomEvent('weprodu-os-start', { detail: limpios }));
  window.open(ARCA_ALTAS_URL, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Escucha los resultados de la corrida.
 *
 * Al montar se emite `weprodu-os-ready`. Es un handshake y no un detalle: si el operador vuelve a
 * WeProdu con la tanda terminada y la app recarga, el script corre en `document-idle` —antes de que
 * este listener exista— y entregaría los resultados contra nadie. Se perderían, y habría que rehacer
 * la corrida entera.
 */
export function useResultadosArca(onResultados: (r: ResultadoValidacion[]) => void): void {
  /**
   * Última entrega procesada, para no guardarla dos veces.
   *
   * El script emite por `document` Y por `window` —no sabe de qué lado del sandbox está la app— así
   * que la misma tanda llega dos veces. Sin esta guarda se dispararían dos corridas de guardado: la
   * segunda encontraría todo ya validado y reportaría "N ya estaban validadas y no se pisaron",
   * dejando al operador con un aviso de conflicto sobre su propio trabajo recién hecho.
   *
   * Se compara por contenido y no por referencia: cruzando el sandbox, los dos eventos pueden traer
   * objetos distintos con los mismos datos.
   */
  const ultima = useRef<{ firma: string; cuando: number }>({ firma: '', cuando: 0 });

  const handler = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!Array.isArray(detail) || detail.length === 0) return;
      const firma = JSON.stringify(detail.map((r: ResultadoValidacion) => `${r.cuil}:${r.rnos}`));
      const ahora = Date.now();
      if (ultima.current.firma === firma && ahora - ultima.current.cuando < 5000) return;
      ultima.current = { firma, cuando: ahora };
      onResultados(detail as ResultadoValidacion[]);
    },
    [onResultados],
  );

  useEffect(() => {
    document.addEventListener('weprodu-os-results', handler);
    window.addEventListener('weprodu-os-results', handler);
    document.dispatchEvent(new Event('weprodu-os-ready'));
    window.dispatchEvent(new Event('weprodu-os-ready'));
    return () => {
      document.removeEventListener('weprodu-os-results', handler);
      window.removeEventListener('weprodu-os-results', handler);
    };
  }, [handler]);
}
