import { useCallback, useEffect, useRef, useState } from "react";

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
 *   ↔ `weprodu-os-ping/pong` prueba de que el canal funciona (ver `probarExtension`).
 *
 * TODO va por `document`, no por `window`. Tampermonkey ejecuta el script en un SANDBOX apenas hay un
 * `@grant` distinto de `none` —y este necesita `GM_setValue` para cruzar los datos entre ARCA y
 * WeProdu—: en ese modo el `window` del script no es el de la página, así que ni las marcas ni los
 * eventos llegan. El DOM es lo único compartido. Se usa `window` además, por si algún día no hay
 * sandbox, pero el que tiene que funcionar es `document`.
 */

/** La pantalla de altas, que es donde el script trabaja. Se abre en el mismo click que el disparo. */
export const ARCA_ALTAS_URL =
  "https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/Contribuyente/RelacionLaboral/Altas.aspx";

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
  const meta = document
    .querySelector('meta[name="weprodu-os-ext"]')
    ?.getAttribute("content");
  const attr = document.documentElement.getAttribute("data-weprodu-os");
  const w = window as unknown as { __weproduOSExt?: string };
  return meta || attr || w.__weproduOSExt || null;
};

/**
 * Marca de la CÁSCARA (`weprodu-puente.user.js`), distinta de la de la lógica.
 *
 * Desde que el userscript es una cáscara que trae la lógica por red, hay un fallo nuevo que antes no
 * existía: Tampermonkey instalado y funcionando, pero la lógica sin llegar —servidor caído, `@connect`
 * faltante, `new Function` bloqueado—. Visto solo por la marca de la lógica, eso se ve idéntico a "no
 * hay nada instalado", y manda a reinstalar lo único que sí está bien.
 *
 * Valores: `1.0.0:cargando` | `1.0.0:ok` | `1.0.0:error` | `1.0.0:sin-logica`.
 */
export const leerCascara = (): { version: string; etapa: string } | null => {
  const v = document.documentElement.getAttribute("data-weprodu-puente");
  if (!v) return null;
  const [version, etapa] = v.split(":");
  return { version, etapa: etapa || "" };
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
 * Los estados posibles. Son CUATRO, no dos.
 *
 *  - `activa`                  responde, y con la versión que corresponde.
 *  - `desactualizada`          responde, pero con una versión vieja. El script no se actualiza solo
 *                              si se instaló pegándolo a mano: queda sin origen de actualización, y
 *                              una versión vieja puede no tener arreglos que la app ya da por hechos.
 *  - `instalada_sin_responder` cargó y quedó mudo: falta el permiso de Chrome.
 *  - `ausente`                 no está.
 *
 * Los dos del medio se ven iguales desde afuera —"algo pasa"— pero se arreglan de forma distinta, y
 * confundirlos manda a reinstalar lo que ya está o a buscar un permiso que ya está puesto.
 */
/**
 *  - `duplicada` hay MÁS DE UNA copia instalada. No es un detalle cosmético: todas comparten el
 *    almacén de Tampermonkey donde vive la cola, así que se pisan las claves y la tanda se queda
 *    trabada sin validar a nadie. Va antes que cualquier otro estado porque, mientras esté, el resto
 *    de los diagnósticos no significan nada.
 */
export type EstadoExtension =
  | "activa"
  | "duplicada"
  | "desactualizada"
  | "instalada_sin_responder"
  | "logica_no_carga"
  | "ausente";

/**
 * El userscript que se instala: la CÁSCARA, congelada en v1.0.0.
 *
 * Es una cáscara y no la lógica entera a propósito. Tampermonkey chequea actualizaciones una vez por
 * día, no al instante: con la lógica adentro, cada iteración subía la versión y dejaba al operador
 * con un "hay una más nueva" hasta que la actualizara a mano. La lógica vive en
 * `/scripts/puente-arca.js`, se sirve aparte y cambia sin versionar nada — ver la cabecera de los dos
 * archivos.
 *
 * Como esta versión está congelada, `versionServida()` siempre va a coincidir con la que responde el
 * script: el estado `desactualizada` queda para quien todavía tenga instalada una copia vieja del
 * userscript anterior, y desaparece solo cuando reinstale.
 */
export const USERSCRIPT_URL = "/scripts/weprodu-puente.user.js";

/** El standalone: la misma lógica, autocontenida, para pegar a mano cuando no hay cáscara posible. */
export const USERSCRIPT_STANDALONE_URL = "/scripts/weprodu-obra-social.user.js";

export async function versionServida(): Promise<string | null> {
  try {
    const res = await fetch(USERSCRIPT_URL, { cache: "no-store" });
    if (!res.ok) return null;
    // Solo la cabecera: el archivo entero son decenas de KB y lo único que hace falta son 20 líneas.
    return (
      (await res.text()).slice(0, 2000).match(/@version\s+([\w.\-]+)/)?.[1] ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * ¿El canal funciona de verdad?
 *
 * La marca en el DOM solo prueba que el script se ejecutó una vez; no dice nada del camino de vuelta.
 * Se puede estar "detectada" y que igual no arranque nada —con "Permitir scripts de usuario" apagado
 * en Chrome, por ejemplo—, y ese estado del medio es el más caro: manda a alguien a validar 21
 * personas y no pasa nada, sin ningún error que explique por qué.
 *
 * El ping lo distingue: si contesta, los eventos cruzan. Si no contesta pero la marca está, el script
 * cargó y quedó mudo, que tiene una causa y una solución concretas.
 */
/** Lo que contesta cada instancia del script. `shell` y `logica` son numeraciones INDEPENDIENTES. */
export interface Pong {
  /** Versión del `.user.js` instalado. Es lo único que puede requerir reinstalar. */
  shell: string | null;
  /** Sello de la lógica servida. Cambia seguido y se actualiza sola: NUNCA se avisa por esto. */
  logica: string | null;
  /** De qué origen se trajo la lógica. Vacío en el standalone, que la trae adentro. */
  base: string;
}

export interface ResultadoPrueba {
  estado: EstadoExtension;
  /** Versión de la cáscara de la instancia que contestó primero (la que manda). */
  version: string | null;
  /** Todos los pongs recibidos. Más de uno = hay copias duplicadas peleándose por la misma cola. */
  instancias: Pong[];
}

/**
 * ¿El canal funciona de verdad? ¿Y cuántas copias hay?
 *
 * La marca en el DOM solo prueba que el script se ejecutó una vez; no dice nada del camino de vuelta.
 * Se puede estar "detectada" y que igual no arranque nada —con "Permitir scripts de usuario" apagado
 * en Chrome, por ejemplo—, y ese estado del medio es el más caro: manda a alguien a validar 21
 * personas y no pasa nada, sin ningún error que explique por qué.
 *
 * Además CUENTA las respuestas, que es lo que faltaba. La cola vive en el almacén de Tampermonkey,
 * compartido por todos los scripts instalados: dos copias no son redundancia, se pisan las claves y
 * dejan la tanda trabada en "Validando 20" con 0 validadas. Como eso no se ve desde ningún lado, el
 * único síntoma era "no anda". Contar los pongs lo vuelve visible y accionable.
 *
 * Por eso no se resuelve con el primer pong: se espera una ventana corta más para juntar los que
 * lleguen atrás. Con una sola copia son 250 ms de más, una vez por carga.
 */
export function probarExtension(
  timeoutMs = 1500,
  ventanaMs = 250,
): Promise<ResultadoPrueba> {
  return new Promise<ResultadoPrueba>((resolve) => {
    const marca = leerMarca();
    const instancias: Pong[] = [];
    const vistos = new Set<Event>();
    let listo = false;
    let cierre = 0;

    const cerrar = () => {
      if (listo) return;
      listo = true;
      limpiar();
      if (instancias.length > 1) {
        console.warn(
          `[WeProdu] hay ${instancias.length} instancias del script instaladas: se pisan la cola entre ellas. Dejá una sola.`,
        );
      }
      resolve({
        estado: instancias.length > 1 ? "duplicada" : "activa",
        version: instancias[0]?.shell || marca,
        instancias,
      });
    };

    const onPong = (e: Event) => {
      // El script emite por `document` Y por `window`: el MISMO evento llega dos veces y contarlo dos
      // veces diría "2 instancias" con una sola instalada, que es peor que no avisar nada.
      if (listo || vistos.has(e)) return;
      vistos.add(e);
      const d = ((e as CustomEvent).detail || {}) as {
        shell?: string;
        version?: string;
        logica?: string;
        base?: string;
      };
      instancias.push({
        shell: d.shell || d.version || null,
        logica: d.logica || null,
        base: d.base || "",
      });
      if (!cierre) cierre = window.setTimeout(cerrar, ventanaMs);
    };

    const limpiar = () => {
      document.removeEventListener("weprodu-os-pong", onPong);
      window.removeEventListener("weprodu-os-pong", onPong);
      window.clearTimeout(id);
      if (cierre) window.clearTimeout(cierre);
    };

    const id = window.setTimeout(() => {
      if (listo) return;
      listo = true;
      limpiar();
      // Tres fallos distintos, no uno: la lógica corrió y quedó muda (falta el permiso de Chrome), la
      // cáscara corrió pero la lógica no llegó (red / `new Function` bloqueado), o no hay nada.
      const cascara = leerCascara();
      const estado: EstadoExtension = marca
        ? "instalada_sin_responder"
        : cascara
          ? "logica_no_carga"
          : "ausente";
      resolve({
        estado,
        version: marca || cascara?.version || null,
        instancias: [],
      });
    }, timeoutMs);

    document.addEventListener("weprodu-os-pong", onPong);
    window.addEventListener("weprodu-os-pong", onPong);
    document.dispatchEvent(new CustomEvent("weprodu-os-ping"));
    window.dispatchEvent(new CustomEvent("weprodu-os-ping"));
  });
}

/**
 * Vacía el almacén compartido del script: la cola, el progreso y los errores de la tanda en curso.
 *
 * Es la salida cuando el estado quedó envenenado —dos copias peleándose, una corrida cortada, un ARCA
 * que nunca contestó— y la app dice "validando" para siempre. No se pierde ningún dato: lo único que
 * vive ahí es el progreso de la tanda, y las obras sociales ya guardadas están en la base.
 */
export function reiniciarValidacionArca(timeoutMs = 1200): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let listo = false;
    const fin = (ok: boolean) => {
      if (listo) return;
      listo = true;
      document.removeEventListener("weprodu-os-reset-ok", onOk);
      window.removeEventListener("weprodu-os-reset-ok", onOk);
      window.clearTimeout(id);
      resolve(ok);
    };
    const onOk = () => fin(true);
    const id = window.setTimeout(() => fin(false), timeoutMs);
    document.addEventListener("weprodu-os-reset-ok", onOk);
    window.addEventListener("weprodu-os-reset-ok", onOk);
    document.dispatchEvent(new CustomEvent("weprodu-os-reset"));
    window.dispatchEvent(new CustomEvent("weprodu-os-reset"));
  });
}

/**
 * Estado de la extensión, probado AUTOMÁTICAMENTE al montar.
 *
 * El ping no puede quedar detrás de un botón: si hay que apretarlo para enterarse, el operador se
 * entera recién cuando ya mandó a validar 21 personas y no pasó nada. Se prueba solo, con un par de
 * reintentos —el script corre en `document-idle` y React puede montar antes— y el resultado se
 * muestra al lado del botón de validar, que es donde importa.
 */
export function useEstadoExtension(): {
  estado: EstadoExtension;
  version: string | null;
  disponible: string | null;
  /** Cuántas copias contestaron. >1 es el problema que tapa a todos los demás. */
  instancias: Pong[];
  probando: boolean;
  reintentar: () => void;
} {
  const [resultado, setResultado] = useState<{
    estado: EstadoExtension;
    version: string | null;
    disponible: string | null;
    instancias: Pong[];
  }>({
    estado: "ausente",
    version: null,
    disponible: null,
    instancias: [],
  });
  const [probando, setProbando] = useState(true);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    let reintentos = 0;
    const correr = async () => {
      const [r, servida] = await Promise.all([
        probarExtension(),
        versionServida(),
      ]);
      if (!vivo) return;
      // Si no contestó y todavía puede estar cargando, se reintenta antes de dar el veredicto: un
      // "no instalada" prematuro manda a reinstalar algo que ya está.
      if (
        (r.estado === "ausente" || r.estado === "logica_no_carga") &&
        reintentos < 2
      ) {
        reintentos++;
        window.setTimeout(correr, 700);
        return;
      }
      /*
       * La comparación de versiones, ahora sobre lo ÚNICO que puede requerir una acción.
       *
       * Se compara `shell` —el `.user.js` instalado— contra el `.user.js` servido. La lógica NO entra
       * acá: cambia en cada iteración y se actualiza sola al recargar, así que avisar por ella era un
       * cartel permanente sin nada que hacer al respecto. Son dos numeraciones independientes y no se
       * comparan nunca entre sí.
       *
       * `duplicada` gana sobre todo lo demás: con dos copias peleándose la cola, decir "desactualizada"
       * manda a resolver el problema equivocado.
       */
      const estado: EstadoExtension =
        r.estado === "activa" && servida && r.version && r.version !== servida
          ? "desactualizada"
          : r.estado;
      setResultado({
        estado,
        version: r.version,
        disponible: servida,
        instancias: r.instancias,
      });
      setProbando(false);
    };
    setProbando(true);
    correr();
    return () => {
      vivo = false;
    };
  }, [intento]);

  return { ...resultado, probando, reintentar: () => setIntento((n) => n + 1) };
}

/**
 * Arranca una corrida: siembra la cola en la extensión y abre ARCA.
 *
 * Las dos cosas van en el MISMO click del usuario: `window.open` fuera de un gesto directo lo bloquea
 * el navegador como popup, y el operador se queda con la cola sembrada y sin la pestaña donde el
 * script trabaja — esperando algo que nunca arranca.
 */
export function iniciarValidacionArca(pedidos: PedidoValidacion[]): boolean {
  const limpios = pedidos
    .map((p) => ({
      cuil: String(p.cuil || "").replace(/\D/g, ""),
      contractId: p.contractId,
    }))
    .filter((p) => p.cuil.length === 11);
  if (limpios.length === 0) return false;
  document.dispatchEvent(
    new CustomEvent("weprodu-os-start", { detail: limpios }),
  );
  window.dispatchEvent(
    new CustomEvent("weprodu-os-start", { detail: limpios }),
  );
  window.open(ARCA_ALTAS_URL, "_blank", "noopener,noreferrer");
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
export function useResultadosArca(
  onResultados: (r: ResultadoValidacion[]) => void,
): void {
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
  const ultima = useRef<{ firma: string; cuando: number }>({
    firma: "",
    cuando: 0,
  });

  const handler = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!Array.isArray(detail) || detail.length === 0) return;
      const firma = JSON.stringify(
        detail.map((r: ResultadoValidacion) => `${r.cuil}:${r.rnos}`),
      );
      const ahora = Date.now();
      if (
        ultima.current.firma === firma &&
        ahora - ultima.current.cuando < 5000
      )
        return;
      ultima.current = { firma, cuando: ahora };
      onResultados(detail as ResultadoValidacion[]);
    },
    [onResultados],
  );

  useEffect(() => {
    document.addEventListener("weprodu-os-results", handler);
    window.addEventListener("weprodu-os-results", handler);
    document.dispatchEvent(new Event("weprodu-os-ready"));
    window.dispatchEvent(new Event("weprodu-os-ready"));
    return () => {
      document.removeEventListener("weprodu-os-results", handler);
      window.removeEventListener("weprodu-os-results", handler);
    };
  }, [handler]);
}
