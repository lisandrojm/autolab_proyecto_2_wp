import { efectosVigentesEn } from "../../utils/liquidacion/efectos.js";
/** Los estados en los que la persona efectivamente trabajó ese día. */
const TRABAJO = new Set(["present", "late"]);
export function codificarEvento(evento, efectosDelMotivo, globales, 
/** El motivo está marcado como "no liquida nada". Ver `RequestConfig.memosoftNoLiquida`. */
motivoNoLiquida = false) {
    const lineas = [];
    const exclusiones = [];
    const base = { eventoId: evento.id, userId: evento.userId, apellidoYNombre: evento.apellidoYNombre, fecha: evento.fecha };
    const excluir = (motivo, detalle) => exclusiones.push({ ...base, motivo, detalle });
    const emitir = (conceptoCodigo, param, cantidad, origen) => {
        // Un cero no se emite: ocupa una fila en el archivo y no dice nada.
        if (!cantidad)
            return;
        lineas.push({
            eventoId: evento.id,
            userId: evento.userId,
            apellidoYNombre: evento.apellidoYNombre,
            legajo: evento.legajo,
            empresaId: evento.empresaId,
            ccCodigo: evento.ccCodigo,
            regimen: evento.regimen,
            fecha: evento.fecha,
            conceptoCodigo,
            par1: param === "par1" ? cantidad : 0,
            par2: param === "par2" ? cantidad : 0,
            origen,
        });
    };
    /*
      LO QUE FALTA SE ANOTA, PERO NO FRENA.
  
      Un evento sin legajo o sin empresa no se puede poner en ninguna hoja, pero igual se codifica:
      así el anexo dice "a esta persona le faltaba el legajo Y además le correspondían 3 días de
      licencia", en vez de sólo lo primero.
    */
    if (!evento.legajo)
        excluir("sin_legajo", "No tiene legajo: no se puede ubicar en ninguna hoja.");
    if (!evento.empresaId)
        excluir("sin_empresa", "No se pudo determinar la empresa del contrato.");
    if (!evento.regimen)
        excluir("sin_regimen", "No se pudo determinar el régimen.");
    if (!evento.ccCodigo)
        excluir("sin_centro_de_costo", "El proyecto no tiene centro de costo resuelto.");
    /* ── Lo que dice el mapeo del motivo ── */
    const vigentes = efectosVigentesEn(efectosDelMotivo || [], evento.fecha, {
        empresaId: evento.empresaId,
        regimen: evento.regimen,
        aplicaA: evento.aplicaA,
    });
    for (const efecto of vigentes) {
        if (efecto.fuente === "manual") {
            excluir("efecto_manual", `${efecto.conceptoCodigo} está configurado como manual: el número lo carga una persona.`);
            continue;
        }
        const cantidad = efecto.fuente === "jornadas" ? evento.jornadas
            : efecto.fuente === "horas50" ? evento.he50
                : efecto.fuente === "horas100" ? evento.he100
                    : Number(efecto.valorFijo || 0);
        emitir(efecto.conceptoCodigo, efecto.param, cantidad, `${evento.motivoNombre || "novedad"}`);
    }
    /*
      UNA AUSENCIA QUE NADIE MAPEÓ ES UN AGUJERO. UNA MAPEADA PARA NO EMITIR NADA, NO.
  
      La diferencia importa: "Franco" tiene mapeo —le paga el jornal al que cubre— y al titular no le
      corresponde nada, que es una decisión tomada. "Cambios de Turno" no tiene mapeo ninguno, pero
      está marcado como que no liquida. Si se avisara de los dos, agosto levantaba 490 avisos de algo
      que está bien, y entre esos 490 se perdían los que sí hay que mirar.
  
      Tampoco aplica a los presentes: un día normal de trabajo no es una novedad.
    */
    const elMotivoEstaResuelto = (efectosDelMotivo || []).length > 0 || motivoNoLiquida;
    if (!TRABAJO.has(evento.estado) && vigentes.length === 0 && !elMotivoEstaResuelto) {
        excluir("sin_efecto_configurado", `"${evento.motivoNombre || "sin motivo"}" no tiene ningún concepto configurado para ${evento.aplicaA}.`);
    }
    /* ── El jornal del día trabajado ── */
    if (TRABAJO.has(evento.estado)) {
        const regla = globales.jornalBase;
        const leCorresponde = regla?.codigo && (!regla.soloRegimen || regla.soloRegimen === evento.regimen);
        /*
          Sólo se emite si el motivo NO generó ya un jornal. Si no, el reemplazante de "Otros Presentes"
          —que tiene su propio 0000 configurado— cobraría el día dos veces.
        */
        const yaHayJornal = lineas.some((l) => l.conceptoCodigo === regla?.codigo);
        if (leCorresponde && !yaHayJornal)
            emitir(regla.codigo, regla.param, evento.jornadas, "día trabajado");
        else if (!regla?.codigo && evento.aplicaA === "titular" && vigentes.length === 0) {
            excluir("presente_sin_regla_base", "Trabajó, pero no hay un concepto configurado para el día trabajado.");
        }
    }
    /* ── Horas extra: la regla global ── */
    const he = globales.horasExtra;
    if (he?.codigo50 && evento.he50 > 0)
        emitir(he.codigo50, he.param, evento.he50, "horas extra al 50%");
    if (he?.codigo100 && evento.he100 > 0)
        emitir(he.codigo100, he.param, evento.he100, "horas extra al 100%");
    if (evento.heSinDiscriminar > 0) {
        excluir("horas_extra_sin_discriminar", `${evento.heSinDiscriminar} horas extra cargadas sin decir si son al 50% o al 100%. No se liquidan hasta que se clasifiquen.`);
    }
    return { lineas, exclusiones };
}
