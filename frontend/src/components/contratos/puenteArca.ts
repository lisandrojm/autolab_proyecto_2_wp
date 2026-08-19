import { useCallback, useEffect, useState } from 'react';

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
  const w = window as unknown as { __weproduOSExt?: string };
  return w.__weproduOSExt || document.querySelector('meta[name="weprodu-os-ext"]')?.getAttribute('content') || null;
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
  const handler = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail) && detail.length > 0) onResultados(detail as ResultadoValidacion[]);
    },
    [onResultados],
  );

  useEffect(() => {
    window.addEventListener('weprodu-os-results', handler);
    window.dispatchEvent(new Event('weprodu-os-ready'));
    return () => window.removeEventListener('weprodu-os-results', handler);
  }, [handler]);
}
