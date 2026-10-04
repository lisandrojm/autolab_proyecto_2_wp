import { CandadoArcaOcupado, quienTiene } from "./candadoArca.js";
import { yaConstatadaEnArca } from "../obrasSocialesLoteService.js";

/**
 * VALIDAR LA OBRA SOCIAL EN SEGUNDO PLANO, apenas nace el contrato.
 *
 * Hasta acá la validación contra ARCA la disparaba una persona con el botón «Validar obra social» y se
 * quedaba mirando la pantalla los ~15 s que tarda. Pero el momento en que hace falta se conoce de
 * antes: cuando se crea un contrato —o se le asigna empleadora— para alguien con CUIL. Esto lo encola
 * ahí, y cuando alguien abre Contratos el dato ya está. El botón queda como reintento manual.
 *
 * NO ES OTRO CAMINO A ARCA: usa la MISMA corrida (`arrancarCorrida`) y el MISMO candado
 * (`candadoArca`). Lo único nuevo es quién aprieta el botón y cuándo.
 *
 * AGRUPA. Aprobar veinte solicitudes seguidas no puede ser veinte corridas —veinte logins—: lo que
 * llega dentro de la ventana de espera (`ARCA_COLA_ESPERA_SEG`, 20 s) sale en UNA corrida, con las
 * empleadoras como grupos de la misma sesión.
 *
 * QUIÉN SE VALIDA LO DECIDE `pendientesObraSocial`, igual que con el botón: al vaciar la cola se
 * intersecta lo encolado con lo que sigue pendiente. Así nunca se vuelve a consultar a alguien ya
 * constatado (lo validaron a mano mientras esperaba, o ya estaba) ni se pisa nada: el aplicador es el
 * de siempre, con sus reglas.
 *
 * SI ARCA ESTÁ OCUPADA, ESPERA. Con el candado tomado (otra validación, una Carga Masiva) no se
 * dispara nada: se reintenta cada `ARCA_COLA_REINTENTO_SEG` (30 s) hasta `MAX_INTENTOS` veces, y si
 * no hubo caso se suelta — queda pendiente y con el botón a mano, que es exactamente lo de antes.
 *
 * NUNCA ROMPE LO QUE LA LLAMÓ. Encolar no tira, no espera y no toca la base: crear un contrato no puede
 * fallar ni demorarse porque ARCA esté caída o falten las credenciales.
 *
 * EN MEMORIA, como la corrida y el candado. Un reinicio del proceso pierde la cola: esas personas
 * quedan pendientes y se validan con el botón o con el próximo contrato de su empleadora.
 *
 * SE APAGA con `ARCA_VALIDACION_AUTOMATICA=0`. El server de desarrollo (`npm run local`) corre contra
 * la base de producción y lo trae apagado: no tiene que entrar a ARCA solo por crear un contrato de
 * prueba, ni abrir una segunda sesión del mismo usuario de AFIP al lado de la del VPS.
 */

export interface DepsCola {
  /** Quiénes siguen pendientes en esa empleadora (`pendientesObraSocial`). */
  pendientes: (tenantObjectId: unknown, empresaId: string) => Promise<Array<{ cuil: string }>>;
  /** Arranca la corrida (`arrancarCorrida`). Vuelve enseguida; tira `CandadoArcaOcupado` si hay otra. */
  arrancar: (o: { tenantId: string; tenantObjectId: any; grupos: Array<{ empresaId: string; cuils: string[] }>; usuarioId?: string }) => Promise<unknown>;
  /** ¿Hay una corrida de ARCA en curso para el tenant? */
  ocupado: (tenantId: string) => boolean;
  /** Cuánto se espera desde el primer encolado para juntar los que vengan atrás. */
  esperaMs: number;
  /** Cada cuánto se reintenta si ARCA está ocupada. */
  reintentoMs: number;
  maxIntentos: number;
}

const segundos = (valor: string | undefined, porDefecto: number): number => {
  const n = Number(String(valor ?? "").trim() || porDefecto);
  return (Number.isFinite(n) && n >= 0 ? n : porDefecto) * 1000;
};

/** Hasta 20 reintentos de 30 s: diez minutos esperando a que se libere ARCA. Después se suelta. */
export const MAX_INTENTOS = 20;

const depsReales = (): DepsCola => ({
  // Import perezoso: la corrida trae Playwright y los modelos, y encolar no los necesita hasta vaciar.
  pendientes: async (tenantObjectId, empresaId) => (await import("../obrasSocialesLoteService.js")).pendientesObraSocial(tenantObjectId, empresaId),
  arrancar: async (o) => (await import("./corridaServidor.js")).arrancarCorrida(o),
  ocupado: (tenantId) => !!quienTiene(tenantId),
  esperaMs: segundos(process.env.ARCA_COLA_ESPERA_SEG, 20),
  reintentoMs: segundos(process.env.ARCA_COLA_REINTENTO_SEG, 30),
  maxIntentos: MAX_INTENTOS,
});

export const validacionAutomaticaActiva = (valor: string | undefined = process.env.ARCA_VALIDACION_AUTOMATICA): boolean => String(valor ?? "").trim() !== "0";

interface ColaDelTenant {
  tenantObjectId: any;
  /** empresaId → CUILs encolados. */
  porEmpresa: Map<string, Set<string>>;
  /** Quién creó el último contrato encolado: queda en el log de la corrida. */
  usuarioId?: string;
  temporizador: ReturnType<typeof setTimeout> | null;
  intentos: number;
}

const colas = new Map<string, ColaDelTenant>();
const soloDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Lo encolado de un tenant, para mirar y para los tests. */
export const enCola = (tenantId: string): Array<{ empresaId: string; cuils: string[] }> => [...(colas.get(tenantId)?.porEmpresa || [])].map(([empresaId, cuils]) => ({ empresaId, cuils: [...cuils] }));

/** Olvida todo sin validar nada. Para los tests. */
export function olvidarColas(): void {
  for (const c of colas.values()) if (c.temporizador) clearTimeout(c.temporizador);
  colas.clear();
}

const programar = (tenantId: string, ms: number, deps: DepsCola) => {
  const c = colas.get(tenantId);
  if (!c) return;
  if (c.temporizador) clearTimeout(c.temporizador);
  c.temporizador = setTimeout(() => {
    c.temporizador = null;
    // Sin `await` y con `catch`: es un temporizador, nadie espera el resultado y no puede tirar.
    void vaciarCola(tenantId, deps).catch((e) => console.error("[COLA-OBRAS-SOCIALES] No pude vaciar la cola:", e?.message || e));
  }, ms);
  // La cola no tiene que impedir que el proceso termine.
  c.temporizador.unref?.();
};

/**
 * Suma una persona a la cola de su tenant. Devuelve si quedó encolada.
 *
 * El temporizador se arma con el PRIMER encolado y no se reinicia con los siguientes: los que llegan
 * dentro de la ventana se suman a esa corrida, y una ráfaga larga no posterga para siempre a los
 * primeros.
 */
export function encolarValidacionObraSocial(p: { tenantId: string; tenantObjectId: any; empresaId: string; cuil: unknown; usuarioId?: string }, deps: DepsCola = depsReales()): boolean {
  const cuil = soloDigitos(p.cuil);
  const empresaId = String(p.empresaId || "");
  if (!p.tenantId || !empresaId || cuil.length !== 11) return false;
  let c = colas.get(p.tenantId);
  if (!c) {
    c = { tenantObjectId: p.tenantObjectId, porEmpresa: new Map(), temporizador: null, intentos: 0 };
    colas.set(p.tenantId, c);
  }
  const lista = c.porEmpresa.get(empresaId) || new Set<string>();
  lista.add(cuil);
  c.porEmpresa.set(empresaId, lista);
  if (p.usuarioId) c.usuarioId = p.usuarioId;
  if (!c.temporizador) programar(p.tenantId, deps.esperaMs, deps);
  return true;
}

export type ResultadoDeVaciar = "vacia" | "ocupado" | "abandonada" | "nada_pendiente" | "arrancada" | "fallo";

/**
 * Saca la cola del tenant en UNA corrida. La llama el temporizador; exportada para probarla.
 *
 * Lo que entra a la corrida se quita de la cola recién cuando la corrida ARRANCÓ: si ARCA estaba
 * ocupada o el arranque falla por el candado, sigue encolado. Lo que se encole mientras tanto
 * (durante el `await` de pendientes) no se pierde: queda para la vuelta siguiente.
 */
export async function vaciarCola(tenantId: string, deps: DepsCola = depsReales()): Promise<ResultadoDeVaciar> {
  const c = colas.get(tenantId);
  if (!c || c.porEmpresa.size === 0) {
    colas.delete(tenantId);
    return "vacia";
  }

  const reintentarOSoltar = (): ResultadoDeVaciar => {
    c.intentos++;
    if (c.intentos > deps.maxIntentos) {
      // No es un error: quedan pendientes, como estaban antes de que existiera la cola.
      console.warn(`[COLA-OBRAS-SOCIALES] ARCA siguió ocupada tras ${deps.maxIntentos} intentos: suelto la cola del tenant ${tenantId}. Quedan pendientes para validar a mano.`);
      colas.delete(tenantId);
      return "abandonada";
    }
    programar(tenantId, deps.reintentoMs, deps);
    return "ocupado";
  };

  if (deps.ocupado(tenantId)) return reintentarOSoltar();

  // Foto de lo encolado: lo que llegue durante los `await` de abajo queda para la próxima vuelta.
  const foto = new Map([...c.porEmpresa].map(([e, cuils]) => [e, new Set(cuils)]));
  const quitarFoto = () => {
    for (const [e, cuils] of foto) {
      const viva = c.porEmpresa.get(e);
      if (!viva) continue;
      for (const cuil of cuils) viva.delete(cuil);
      if (viva.size === 0) c.porEmpresa.delete(e);
    }
    if (c.porEmpresa.size === 0) {
      if (c.temporizador) clearTimeout(c.temporizador);
      colas.delete(tenantId);
    } else if (!c.temporizador) {
      programar(tenantId, deps.esperaMs, deps);
    }
  };

  const grupos: Array<{ empresaId: string; cuils: string[] }> = [];
  for (const [empresaId, cuils] of foto) {
    try {
      const pendientes = new Set((await deps.pendientes(c.tenantObjectId, empresaId)).map((p) => soloDigitos(p.cuil)));
      const aValidar = [...cuils].filter((cuil) => pendientes.has(cuil));
      if (aValidar.length > 0) grupos.push({ empresaId, cuils: aValidar });
    } catch (e: any) {
      // Una empleadora que no se pudo resolver no frena a las demás; los suyos quedan para el botón.
      console.error(`[COLA-OBRAS-SOCIALES] No pude resolver los pendientes de la empleadora ${empresaId}:`, e?.message || e);
    }
  }

  if (grupos.length === 0) {
    quitarFoto();
    return "nada_pendiente";
  }

  try {
    await deps.arrancar({ tenantId, tenantObjectId: c.tenantObjectId, grupos, usuarioId: c.usuarioId });
  } catch (e: any) {
    // Otra corrida tomó ARCA entre el chequeo y el arranque: no se perdió nada, se reintenta.
    if (e instanceof CandadoArcaOcupado) return reintentarOSoltar();
    // Faltan credenciales, la empleadora no tiene CUIT…: reintentar no lo arregla. Quedan para el botón.
    console.error(`[COLA-OBRAS-SOCIALES] No pude arrancar la validación automática del tenant ${tenantId}:`, e?.message || e);
    quitarFoto();
    return "fallo";
  }
  c.intentos = 0;
  quitarFoto();
  return "arrancada";
}

/**
 * El gancho para las rutas: encola si el contrato lo amerita. No tira nunca.
 *
 * Mismos requisitos que el botón «Validar obra social» (ver `CeldaObraSocial`): empleadora, categoría
 * —de ella sale el convenio; un servicio no lleva obra social— y CUIL válido. Lo ya constatado en ARCA
 * no se encola: no hay nada que validar.
 */
export function encolarSiCorresponde(o: { tenantObjectId: any; usuarioId?: string; cuit: unknown; contrato: any }, deps?: DepsCola): boolean {
  try {
    if (!validacionAutomaticaActiva()) return false;
    const c = o.contrato || {};
    if (!o.tenantObjectId || !c.empresaContratoId || c.categoria_sat_id == null || c.categoria_sat_id === "") return false;
    if (yaConstatadaEnArca(c)) return false;
    return encolarValidacionObraSocial({ tenantId: String(o.tenantObjectId), tenantObjectId: o.tenantObjectId, empresaId: String(c.empresaContratoId), cuil: o.cuit, usuarioId: o.usuarioId }, deps);
  } catch (e: any) {
    console.error("[COLA-OBRAS-SOCIALES] No pude encolar:", e?.message || e);
    return false;
  }
}
