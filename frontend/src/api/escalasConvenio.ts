import axios from "./axiosConfig";

/**
 * Escalas salariales VERSIONADAS de un convenio, adicionales del acta, capítulo de pequeñas empresas y acuerdos
 * paritarios.
 *
 * Es el complemento de `arcaCategorias.ts`, que maneja la estructura (convenio → grupo → categoría) y la escala
 * VIGENTE. Acá está la dimensión que faltaba: el tiempo. Un convenio no tiene "una" escala, tiene una por tramo
 * paritario, y hasta ahora la última pisaba a la anterior.
 *
 * Dos cosas que conviene tener claras al consumir esto:
 *
 *  1. `ConvenioGrupo` (lo que devuelve `arcaCategoriasAPI`) sigue siendo LO VIGENTE y es lo que leen los
 *     contratos, los PDFs y el TXT de ARCA. Esta API escribe la historia y el server espeja el período vigente
 *     en el grupo. No hay dos fuentes de verdad: hay una fuente y una foto.
 *  2. Todo lo que devuelve el server puede traer diferencias contra la cuenta (`diferencias`) y advertencias
 *     (`advertencias`). No son errores: son datos del acta que no cierran con su propia aritmética, y la pantalla
 *     tiene que mostrarlos en vez de esconderlos.
 */

const BASE = "/arca/escalas";

/** Una diferencia entre lo que dice el acta y lo que da la cuenta. */
export interface DiferenciaEscala {
  campo: "adicionalMonto" | "presentismoMonto" | "total" | "neto";
  calculado: number;
  acta: number;
  /** acta − calculado. Positivo = el acta paga más. */
  delta: number;
}

export type OrigenDeDato = "acta" | "excel" | "manual" | "estado-actual" | "derivado";

export interface EscalaPeriodo {
  _id: string;
  convenio: string;
  grupo: number | null;
  desde: string;
  /** INCLUSIVE. `null` = vigente, sin vencimiento declarado. */
  hasta: string | null;
  basico: number;
  adicionalPct: number | null;
  presentismoPct: number | null;
  netoFactor: number | null;
  adicionalMonto: number;
  presentismoMonto: number;
  total: number;
  neto: number | null;
  totalLetras?: string;
  netoLetras?: string;
  actaTotal?: number | null;
  diferencias?: DiferenciaEscala[];
  acuerdoId?: string | null;
  tramo?: string;
  origen: OrigenDeDato;
  nota?: string;
}

/** Lo que hay HOY en el grupo, para poder mostrarlo al lado de lo versionado. */
export interface VigenteEnGrupo {
  basico: number;
  adicionalMonto: number;
  presentismoMonto: number;
  total: number;
  neto: number;
  desde: string;
  hasta: string;
  /** El % que se deduce de los importes cargados: deja ver un adicional mal tipeado. */
  adicionalPctDeducido: number | null;
  /** `true` cuando el grupo declara un fin de vigencia anterior a su inicio (pasa en 0634/11). */
  vigenciaIncoherente: boolean;
}

export interface FilaDeEscala {
  grupo: number;
  nombre: string;
  vigenteEnGrupo: VigenteEnGrupo;
  periodo: EscalaPeriodo | null;
}

export type TipoCalculoAdicional = "monto_fijo" | "mensual" | "por_anio_antiguedad" | "por_evento" | "porcentaje" | "a_confirmar";

export interface AdicionalConValor {
  _id: string;
  codigo: string;
  nombre: string;
  tipoCalculo: TipoCalculoAdicional;
  /** `null` = a confirmar. No es lo mismo que `false`. */
  remunerativo: boolean | null;
  confirmado: boolean;
  base: "basico" | "basico_mas_adicional" | "total" | null;
  unidad: string;
  condicion: string;
  capitulo: "general" | "pequenas_empresas";
  orden: number;
  /** Importe que rige a la fecha consultada. `null` = no hay valor cargado para esa fecha. */
  monto: number | null;
  porcentaje: number | null;
  valorId?: string;
  valorDesde?: string;
  valorHasta?: string;
}

export interface ValorDeAdicional {
  _id: string;
  adicionalId: string;
  grupo: number | null;
  desde: string;
  hasta: string | null;
  monto: number | null;
  porcentaje: number | null;
  tramo?: string;
  origen: OrigenDeDato;
  nota?: string;
}

export interface FilaPequenasEmpresas {
  _id: string;
  convenio: string;
  grupo: number;
  desde: string;
  hasta: string | null;
  semana9hsLunVie: number;
  jornadaAdicional9hs: number;
  horaExtra50: number;
  horaExtra100: number;
  tramo?: string;
  origen: OrigenDeDato;
}

export interface TramoParitario {
  codigo: string;
  desde: string;
  porcentaje: number;
  base?: string;
  baseDesde?: string | null;
  acumulativo: boolean;
  regimen: "general" | "alternativo";
  absorbe?: string;
  nota?: string;
}

export interface AcuerdoParitario {
  _id: string;
  convenios: string[];
  partes: string[];
  titulo: string;
  periodoParitario?: { desde?: string | null; hasta?: string | null };
  expediente?: string;
  firmadoEl?: string | null;
  homologacion?: { estado: "a_confirmar" | "sin_homologar" | "en_tramite" | "homologado"; resolucion?: string; fecha?: string | null };
  tramos: TramoParitario[];
  clausulaAbsorcion?: { texto?: string; aplica: boolean };
  regimenAlternativo?: { descripcion?: string; empresaIds: string[] };
  archivo?: { ruta?: string; nombreOriginal?: string; bytes?: number; subidoEl?: string | null };
  /** Calculado por el server encadenando los tramos del régimen general. No se guarda. */
  porcentajeAcumuladoGeneral?: number;
}

/** Todo el convenio a una fecha, que es como lo muestra la pantalla. */
export interface EscalaDelConvenio {
  convenio: string;
  fecha: string;
  filas: FilaDeEscala[];
  escala: EscalaPeriodo[];
  adicionales: AdicionalConValor[];
  pequenasEmpresas: FilaPequenasEmpresas[];
  acuerdos: AcuerdoParitario[];
}

export interface FilaPropuesta {
  grupo: number | null;
  basicoActual: number;
  basicoPropuesto: number;
  totalActual: number | null;
  propuesta: { basico: number; adicionalPct: number; presentismoPct: number; adicionalMonto: number; presentismoMonto: number; total: number; netoSugerido: number };
  avisos: string[];
}

export interface PreviewParitaria {
  convenio: string;
  porcentaje: number;
  baseFecha: string;
  desde: string;
  /** `convenio-grupos` cuando todavía no hay historia cargada y la base fue la escala vigente. */
  baseTomadaDe: "periodos" | "convenio-grupos";
  escala: FilaPropuesta[];
  adicionales: Array<{ clave: string; nombre?: string; monto: number | null; montoPropuesto: number | null; avisos: string[] }>;
  pequenasEmpresas: Array<{ grupo: number; semana9hsLunVie: number; jornadaAdicional9hs: number; horaExtra50: number; horaExtra100: number }>;
  aviso: string;
}

export interface LineaDeLiquidacion {
  codigo: string;
  nombre: string;
  tipoCalculo: TipoCalculoAdicional;
  cantidad: number;
  unitario: number;
  monto: number;
  remunerativo: boolean | null;
}

export interface LiquidacionDeReferencia {
  convenio: string;
  grupo: number | null;
  categoria: string;
  fecha: string;
  escalaDe: { desde: string; hasta: string; origen: string };
  basico: number;
  adicional: number;
  presentismo: number;
  lineas: LineaDeLiquidacion[];
  brutoRemunerativo: number;
  brutoNoRemunerativo: number;
  /** Adicionales cuyo carácter nadie confirmó: se pagan, pero no entran en la base de aportes. */
  sinClasificar: number;
  bruto: number;
  netoSugerido: number;
  netoFactor: number;
  advertencias: string[];
}

class EscalasConvenioAPI {
  /** Todo el convenio a una fecha. `fecha` vacía = hoy. */
  async delConvenio(convenio: string, fecha?: string): Promise<EscalaDelConvenio> {
    const { data } = await axios.get(BASE, { params: { convenio, fecha } });
    return data;
  }

  /** El historial de períodos, del más nuevo al más viejo. */
  async periodos(convenio: string, grupo?: number): Promise<EscalaPeriodo[]> {
    const { data } = await axios.get(`${BASE}/periodos`, { params: { convenio, grupo } });
    return data;
  }

  async crearPeriodo(payload: Record<string, unknown>): Promise<{ periodo: EscalaPeriodo; espejo: { espejado: boolean; motivo?: string } | null }> {
    const { data } = await axios.post(`${BASE}/periodos`, payload);
    return data;
  }

  async actualizarPeriodo(id: string, payload: Record<string, unknown>) {
    const { data } = await axios.put(`${BASE}/periodos/${id}`, payload);
    return data;
  }

  async borrarPeriodo(id: string) {
    const { data } = await axios.delete(`${BASE}/periodos/${id}`);
    return data;
  }

  /** Fuerza la copia del vigente al grupo. Para cuando el espejo quedó desalineado. */
  async espejar(periodoId: string): Promise<{ espejado: boolean; motivo?: string }> {
    const { data } = await axios.post(`${BASE}/periodos/${periodoId}/espejar`);
    return data;
  }

  async adicionales(convenio: string, fecha?: string, capitulo?: "general" | "pequenas_empresas"): Promise<AdicionalConValor[]> {
    const { data } = await axios.get(`${BASE}/adicionales`, { params: { convenio, fecha, capitulo } });
    return data;
  }

  async crearAdicional(payload: Record<string, unknown>) {
    const { data } = await axios.post(`${BASE}/adicionales`, payload);
    return data;
  }

  async actualizarAdicional(id: string, payload: Record<string, unknown>) {
    const { data } = await axios.put(`${BASE}/adicionales/${id}`, payload);
    return data;
  }

  /** `baja: true` lo desactiva en lugar de borrarlo. Es lo que conviene si ya se usó para liquidar. */
  async borrarAdicional(id: string, baja = false) {
    const { data } = await axios.delete(`${BASE}/adicionales/${id}`, { params: baja ? { baja: true } : {} });
    return data;
  }

  async valoresDeAdicional(id: string): Promise<ValorDeAdicional[]> {
    const { data } = await axios.get(`${BASE}/adicionales/${id}/valores`);
    return data;
  }

  async crearValor(adicionalId: string, payload: Record<string, unknown>) {
    const { data } = await axios.post(`${BASE}/adicionales/${adicionalId}/valores`, payload);
    return data;
  }

  async actualizarValor(valorId: string, payload: Record<string, unknown>) {
    const { data } = await axios.put(`${BASE}/valores/${valorId}`, payload);
    return data;
  }

  async borrarValor(valorId: string) {
    const { data } = await axios.delete(`${BASE}/valores/${valorId}`);
    return data;
  }

  /** `historial: true` trae todos los períodos en vez de sólo los vigentes a la fecha. */
  async pequenasEmpresas(convenio: string, fecha?: string, historial = false): Promise<FilaPequenasEmpresas[]> {
    const { data } = await axios.get(`${BASE}/pequenas-empresas`, { params: { convenio, fecha, historial: historial || undefined } });
    return data;
  }

  async crearPequenasEmpresas(payload: Record<string, unknown>): Promise<{ fila: FilaPequenasEmpresas; avisoJornada: string | null }> {
    const { data } = await axios.post(`${BASE}/pequenas-empresas`, payload);
    return data;
  }

  async actualizarPequenasEmpresas(id: string, payload: Record<string, unknown>): Promise<{ fila: FilaPequenasEmpresas; avisoJornada: string | null }> {
    const { data } = await axios.put(`${BASE}/pequenas-empresas/${id}`, payload);
    return data;
  }

  async borrarPequenasEmpresas(id: string) {
    const { data } = await axios.delete(`${BASE}/pequenas-empresas/${id}`);
    return data;
  }

  async acuerdos(convenio?: string): Promise<AcuerdoParitario[]> {
    const { data } = await axios.get(`${BASE}/acuerdos`, { params: { convenio } });
    return data;
  }

  async crearAcuerdo(payload: Record<string, unknown>) {
    const { data } = await axios.post(`${BASE}/acuerdos`, payload);
    return data;
  }

  async actualizarAcuerdo(id: string, payload: Record<string, unknown>) {
    const { data } = await axios.put(`${BASE}/acuerdos/${id}`, payload);
    return data;
  }

  async borrarAcuerdo(id: string) {
    const { data } = await axios.delete(`${BASE}/acuerdos/${id}`);
    return data;
  }

  /** Sube el PDF del acta. Sin headers explícitos: ponerlos rompe el boundary del multipart. */
  async subirActa(acuerdoId: string, archivo: File) {
    const form = new FormData();
    form.append("archivo", archivo);
    const { data } = await axios.post(`${BASE}/acuerdos/${acuerdoId}/archivo`, form);
    return data;
  }

  /** La URL de descarga del acta. Va con token por el interceptor de axios, así que se descarga, no se linkea. */
  async descargarActa(acuerdoId: string): Promise<Blob> {
    const { data } = await axios.get(`${BASE}/acuerdos/${acuerdoId}/archivo`, { responseType: "blob" });
    return data;
  }

  /** Qué pasaría si se aplicara un porcentaje. NO escribe nada. */
  async preview(payload: { convenio: string; porcentaje: number; baseFecha?: string; desde?: string; incluirAdicionales?: boolean; incluirPequenasEmpresas?: boolean }): Promise<PreviewParitaria> {
    const { data } = await axios.post(`${BASE}/aplicar-paritaria/preview`, payload);
    return data;
  }

  /**
   * Confirma la paritaria. Se mandan LAS FILAS FINALES, ya corregidas a mano si hizo falta.
   *
   * Mandar sólo el porcentaje y dejar que el server recalcule perdería las correcciones: el porcentaje no
   * reproduce el acta al centavo.
   */
  async aplicar(payload: Record<string, unknown>) {
    const { data } = await axios.post(`${BASE}/aplicar-paritaria`, payload);
    return data;
  }

  async liquidacion(payload: { convenio?: string; grupo?: number | null; categoriaId?: string; fecha?: string; aniosAntiguedad?: number; cantidades?: Record<string, number> }): Promise<LiquidacionDeReferencia> {
    const { data } = await axios.post(`${BASE}/liquidacion-referencia`, payload);
    return data;
  }
}

export const escalasConvenioAPI = new EscalasConvenioAPI();
