import { buscarCategoriaCompatPorLegacyId } from "../utils/categoriaCompat.js";
import { importePorJornada, jornadasFijadasPorElTipo, periodoDeCalculo, sueldosDelContrato } from "../compartido/jornadas.js";
import { numeroALetras } from "../utils/numeroALetras.js";

/*
  LAS JORNADAS Y LOS SUELDOS DE UN CONTRATO, SEGÚN SU TIPO: lo que el server rehace al guardar un contrato
  (assign-member) y lo que el script `contratos:corregir-jornadas` aplica a los que quedaron mal. Una sola
  cuenta para los dos, para que no vuelvan a separarse.
*/

/** Lo del tipo de contrato (`Contrato.data`) que hace falta acá; para el `.select()`. */
export const CAMPOS_DEL_TIPO_PARA_IMPORTES = "data.cantidadJornadas data.modoFechas data.multiplicadorDiario data.importesEnCero data.esTiempoIndeterminado";

export interface TipoParaImportes {
  data?: { cantidadJornadas?: number | null; modoFechas?: string; esTiempoIndeterminado?: boolean; multiplicadorDiario?: number | null; importesEnCero?: boolean } | null;
}

/**
 * LAS JORNADAS QUE FIJA EL TIPO DE CONTRATO PARA ESTE CONTRATO, con la misma cuenta que el formulario
 * (`jornadasFijadasPorElTipo`, regla del 19/10/2026): un mes completo vale las jornadas del tipo («Plazo
 * fijo»: 30; «Servicios»: 22); un tramo de mes, los días que trabaja en él. Con tiempo indeterminado se
 * cuenta el mes del alta (`periodoDeCalculo`). `null` si el tipo no fija jornadas o es por días sueltos.
 *
 * Hasta el 30/10/2026 el server ponía las del tipo enteras: un Servicios del 1 al 9 de octubre (7
 * jornadas) se guardaba con 22 y el sueldo en mano pasaba a ser el mensual.
 */
export const jornadasQueFijaElTipo = (contrato: any, tipo: TipoParaImportes | null | undefined): number | null => {
  const porDiasSueltos = tipo?.data?.modoFechas === "dias";
  const periodo = periodoDeCalculo(contrato?.fecha_alta_contrato, contrato?.fecha_baja_contrato, !!tipo?.data?.esTiempoIndeterminado && !porDiasSueltos);
  const dias: number[] = contrato?.dias_rotativos || !Array.isArray(contrato?.dias_semana) ? [] : contrato.dias_semana.map(Number);
  const fijas = jornadasFijadasPorElTipo(tipo?.data?.cantidadJornadas, porDiasSueltos, periodo.desde, periodo.hasta, dias);
  return fijas !== null && fijas > 0 ? fijas : null;
};

/**
 * LOS IMPORTES DE UN TIPO «IMPORTES EN 0» (cambio de franco, 27/10/2026): todos en cero, digan lo que
 * digan el formulario o la escala. El día trabajado reemplaza a uno de franco y no se paga.
 */
export const IMPORTES_EN_CERO = { sueldo_jornada: 0, sueldo_mano: 0, sueldo_mano_texto: "CERO 00/100", sueldo_neto: 0, sueldo_bruto: 0, sueldo_diario_neto: 0, diferencia_diaria_neto: 0 };

/** Los sueldos del contrato con la misma cuenta que la solicitud del móvil y el formulario (`sueldosDelContrato`). */
export const sueldosConEscala = async (contrato: any, tipoContrato: TipoParaImportes | null | undefined): Promise<Record<string, unknown>> => {
  if (tipoContrato?.data?.importesEnCero) return { ...IMPORTES_EN_CERO };
  const cat: any = contrato?.categoria_sat_id != null && contrato.categoria_sat_id !== "" ? await buscarCategoriaCompatPorLegacyId(Number(contrato.categoria_sat_id)) : null;
  const bruto = Number(cat?.data?.sueldoBruto) || 0;
  const neto = Number(cat?.data?.neto) || 0;
  const s = sueldosDelContrato({
    jornadaBruto: Number(contrato?.sueldo_jornada) || 0,
    jornadas: Number(contrato?.cantidad_jornadas_laborales) || 0,
    proporcionNeto: bruto > 0 && neto > 0 ? neto / bruto : null,
    jornadaBrutoEscala: cat ? importePorJornada(cat.data, tipoContrato?.data?.multiplicadorDiario, tipoContrato?.data?.cantidadJornadas) : null,
  });
  return { ...s, sueldo_mano_texto: numeroALetras(s.sueldo_mano) };
};
