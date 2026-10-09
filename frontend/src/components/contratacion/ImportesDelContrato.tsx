import React, { useEffect, useRef, useState } from "react";
import { anclaDesdeJornada, AnclaImporte, derivarImportes, mesesParaImportes } from "../../utils/jornadas";
import { CampoImporte } from "./CampoImporte";

/*
  LOS IMPORTES DEL CONTRATO: jornada, semana, mensual y total.

  EL MENSUAL ES EL ANCLA, no la jornada. Un mes calendario completo tiene que totalizar exactamente el
  mensual, tenga 20 o 23 días hábiles; con un promedio de jornadas por mes, septiembre —que tiene 22—
  daba 1.015.384,70 por un mensual de 1.000.000. La jornada es la derivada y cambia según los días
  hábiles de cada mes, que es lo correcto.

  Las cuentas están en `utils/jornadas.ts` (`mesesEquivalentes`, `derivarImportes`). Acá se decide qué
  queda fijo:
    · Se edita el mensual o el total → ese valor es el ancla.
    · Se edita la jornada o la semana → el ancla pasa a ser el mensual que les corresponde.
    · Cambian las fechas o los días → el ancla no se mueve y se recalcula el resto.
    · La jornada cambia por fuera (la propone la categoría, se abre una solicitud, se limpia) → se toma
      como si se hubiera editado la jornada.

  VOLVER AL VALOR ORIGINAL. Los cuatro campos son el mismo número: tocar uno reescribe los otros tres, y
  después de dos o tres pruebas nadie se acuerda de cuánto decía el contrato. El «original» es la última
  jornada que llegó DE AFUERA —la del contrato al abrirlo, la que propuso la categoría— y no lo que
  escribió el usuario ni lo que el ancla recalculó. Mientras lo que se muestra difiera de eso, hay un
  botón que la repone, y el ancla se rehace desde ella como si la jornada acabara de llegar.

  Lo que sale de acá es SIEMPRE el importe por jornada (`onValorJornada`), con precisión completa: es lo
  que guardan la solicitud (`dailyRate`) y el contrato (`sueldo_jornada`). Se redondea sólo al mostrar.
*/

export type UnidadImporte = "jornada" | "semana" | "mes" | "total";

interface Props {
  /** El importe por jornada como texto canónico ("45454.545454"). Es lo que se guarda. */
  valorJornada: string;
  onValorJornada: (valor: string) => void;
  /** Cuánto dura el contrato en meses (ver `mesesEquivalentes`). 0 = todavía no se puede calcular. */
  mesesEq: number;
  /** Las jornadas que se pagan. 0 = todavía no se puede calcular. */
  jornadas: number;
  /**
   * Las jornadas que el TIPO de contrato cuenta por mes («Jornada»: 22). Con esto el mensual es
   * jornada × esas jornadas, no la jornada repartida por los meses del calendario (ver `mesesParaImportes`).
   */
  jornadasDelTipo?: number | null;
  /**
   * Neto ÷ bruto de la escala de la categoría (0,81 en el 634/11). Con esto el importe por jornada —que
   * es BRUTO: sale de básico + adicional + presentismo— se rotula «bruto» y al lado se muestra el neto
   * por jornada, de solo lectura: lo que cobra la persona después de los descuentos de ley.
   */
  proporcionNeto?: number | null;
  /**
   * Los días por semana del TIPO de contrato («Jornada»: 5). Mandan sobre `diasSemana` para el importe
   * por semana: con días sueltos se marcan los días puntuales del calendario (uno, por ejemplo), y la
   * semana del contrato son los días que el tipo dice que se trabaja.
   */
  diasPorSemanaDelTipo?: number | null;
  /** Los días que trabaja por semana. 0 = todavía no se puede calcular. */
  diasSemana: number;
  /**
   * Tiempo indeterminado: `mesesEq` y `jornadas` son los de un mes completo (ver `periodoDeCalculo`),
   * así que el mensual y la jornada se calculan, pero no hay total del contrato: no termina.
   */
  indeterminado?: boolean;
  /** Apaga los cuatro campos (p. ej. hasta elegir la categoría, de donde sale el importe). */
  bloqueado?: boolean;
  /** Qué decir debajo de cada campo cuando está bloqueado. */
  textoBloqueado?: string;
  /** Ayuda extra bajo el importe por jornada: la escala del convenio, o que es un servicio. */
  ayudaJornada?: React.ReactNode;
  /** Clases del contenedor y de los campos: la app y el panel se ven distinto. */
  className?: string;
  claseEtiqueta: string;
  claseCampo: string;
  claseCampoTotal: string;
  claseAyuda: string;
  /** Un ícono a la izquierda del rótulo (la app lo usa; el panel no). */
  icono?: React.ReactNode;
  /** Un ícono DENTRO del campo (la app lo usa; el panel no). Va con clases `pl-10` en `claseCampo`. */
  adornoCampo?: React.ReactNode;
  /**
   * LA AYUDA EN EL RÓTULO, EN VEZ DE DEBAJO DEL CAMPO. Quien lo pasa recibe el título del campo y la
   * ayuda ya armada, y devuelve lo que va al lado del rótulo (el móvil pone su «i» que abre el modal
   * de ayuda de toda la app). Con esto, debajo del campo no se dibuja nada: cuatro campos con cuatro
   * párrafos abajo eran una pantalla de texto en un teléfono. Sin pasarlo, la ayuda va debajo, como
   * siempre (escritorio).
   */
  infoEnRotulo?: (titulo: string, ayuda: React.ReactNode) => React.ReactNode;
  /**
   * CONSERVAR LA JORNADA QUE VINO DE AFUERA hasta que alguien edite un importe.

   * Al abrir un contrato o una solicitud para aprobar, las jornadas y los meses llegan de a uno: el
   * mensual se anclaba con valores intermedios (las jornadas del calendario) y, cuando llegaban las
   * del contrato, la jornada se recalculaba sola — una solicitud de $33.474,76 por jornada abría en
   * $30.127,28 sin que nadie tocara nada. Con esto, mientras no se edite un importe, la jornada
   * recibida manda y el mensual la sigue. Lo usa el panel; el formulario del móvil sigue anclando en
   * el mensual (ahí cambiar las fechas tiene que mantener el mensual).
   */
  conservarJornadaExterna?: boolean;
  /**
   * SOLO NETO: un Pedido de servicios (pedido del 09/10/2026). Se muestran sólo los netos —jornada,
   * semana, mensual y total—, editables. Por dentro todo sigue en bruto (lo que se guarda es el bruto
   * por jornada): lo que se escribe se divide por la proporción antes de recalcular. Cada ayuda aclara
   * que es un valor de referencia de la categoría del convenio. Sin `proporcionNeto` no cambia nada.
   */
  soloNeto?: boolean;
  /**
   * DE DÓNDE SALE EL TOTAL, en letra chica debajo del campo (pedido del 09/10/2026): el período, el área
   * y turno, los días y la cuenta jornada × jornadas. Cada pantalla pasa los textos que tiene; los que
   * faltan no se dibujan. La cuenta la arma el componente con sus propios números.
   */
  resumenTotal?: ResumenTotal;
}

export interface ResumenTotal {
  /** «Del 01/10/2026 al 31/10/2026», o los días sueltos marcados. */
  periodo?: string;
  /** «Edición · Mañana (06:00 a 12:00)». */
  areaTurno?: string;
  /** «Lu a Vi», «5 días por semana»… */
  dias?: string;
}

const pesosAR = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ImportesDelContrato({ valorJornada, onValorJornada, mesesEq: mesesDelPeriodo, jornadas, jornadasDelTipo, proporcionNeto, diasPorSemanaDelTipo, diasSemana: diasMarcados, indeterminado = false, soloNeto: soloNetoPedido = false, bloqueado = false, textoBloqueado, ayudaJornada, className = "", claseEtiqueta, claseCampo, claseCampoTotal, claseAyuda, icono, adornoCampo, infoEnRotulo, conservarJornadaExterna = false, resumenTotal }: Props) {
  // Los meses que dura el contrato PARA LOS IMPORTES: con jornadas en el tipo, jornadas ÷ esas jornadas.
  const mesesEq = mesesParaImportes(mesesDelPeriodo, jornadas, jornadasDelTipo);
  // La semana del contrato: los días por semana del tipo, si los tiene; si no, los días marcados.
  const diasSemana = Number(diasPorSemanaDelTipo) > 0 ? Number(diasPorSemanaDelTipo) : diasMarcados;
  /*
    EL TOTAL DEL CONTRATO, EN NETO. Con la proporción neto/bruto de la escala, el total que se muestra es
    neto por jornada × jornadas: lo que cobra la persona por todo el contrato. Por dentro todo sigue en
    bruto —lo que se guarda es el bruto por jornada—, así que el total se convierte al mostrarlo y, si
    alguien lo edita, se vuelve a bruto antes de recalcular los demás.
  */
  const netoSobreBruto = Number(proporcionNeto) > 0 ? Number(proporcionNeto) : null;
  const soloNeto = soloNetoPedido && !!netoSobreBruto;
  // En pantalla: el total siempre en neto; con `soloNeto`, todos.
  const vista = (unidad: UnidadImporte) => (netoSobreBruto && (soloNeto || unidad === "total") ? netoSobreBruto : 1);
  const [ancla, setAncla] = useState<AnclaImporte | null>(null);
  /** Alguien editó un importe en este formulario: desde ahí rige el ancla, como siempre. */
  const editado = useRef(false);
  const sigueJornada = () => conservarJornadaExterna && !editado.current;
  /** La última jornada que escribió el ancla: cualquier otro valor vino de afuera. */
  const jornadaEscrita = useRef<string>(" ");
  /** La última jornada que llegó de afuera (ver «VOLVER AL VALOR ORIGINAL»). */
  const [original, setOriginal] = useState<string | null>(null);
  /** Lo que acaba de salir por `onValorJornada` es un tipeo en jornada/semana, no un valor de afuera. */
  const tipeoPendiente = useRef(false);
  /** Se editó algún importe desde la última vez que la jornada llegó de afuera. */
  const [modificado, setModificado] = useState(false);
  const llegoDeAfuera = () => {
    if (tipeoPendiente.current) {
      tipeoPendiente.current = false;
      return;
    }
    setOriginal(valorJornada);
    setModificado(false);
  };
  const jornadaActual = valorJornada !== "" && Number.isFinite(Number(valorJornada)) ? Number(valorJornada) : null;
  const importes = derivarImportes({ ancla, jornada: jornadaActual, mesesEq, jornadas, diasSemana });

  // La jornada cambió por fuera del ancla, o recién ahora hay con qué calcular el mensual: se ancla en el mensual.
  useEffect(() => {
    // Sin ediciones, la jornada recibida manda: el ancla se rehace con las jornadas y meses de ahora.
    if (sigueJornada()) {
      llegoDeAfuera();
      jornadaEscrita.current = valorJornada;
      setAncla(jornadaActual === null ? null : anclaDesdeJornada(jornadaActual, jornadas, mesesEq));
      return;
    }
    if (valorJornada !== jornadaEscrita.current) {
      llegoDeAfuera();
      jornadaEscrita.current = valorJornada;
      setAncla(jornadaActual === null ? null : anclaDesdeJornada(jornadaActual, jornadas, mesesEq));
      return;
    }
    if (!ancla && jornadaActual !== null) {
      const nueva = anclaDesdeJornada(jornadaActual, jornadas, mesesEq);
      if (nueva) setAncla(nueva);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorJornada, jornadas, mesesEq]);

  // Con ancla, la jornada sale de ella y se avisa hacia afuera: es lo que se guarda.
  useEffect(() => {
    if (!ancla || sigueJornada()) return;
    const jornada = importes.jornada;
    if (jornada !== null && jornadaActual !== null && Math.abs(jornada - jornadaActual) < 1e-6) return;
    const texto = jornada === null ? "" : String(jornada);
    if (texto === valorJornada) return;
    jornadaEscrita.current = texto;
    onValorJornada(texto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancla, jornadas, mesesEq]);

  /** El campo que se está escribiendo muestra lo tipeado: si no, el recálculo lo reescribiría en cada tecla. */
  const [enEdicion, setEnEdicion] = useState<{ unidad: UnidadImporte; texto: string } | null>(null);
  const valorDe: Record<UnidadImporte, number | null> = { jornada: importes.jornada, semana: importes.semana, mes: importes.mensual, total: indeterminado ? null : importes.total };
  // Dos decimales siempre, y sólo al mostrar.
  const importeEn = (unidad: UnidadImporte) => {
    if (enEdicion?.unidad === unidad) return enEdicion.texto;
    const v = valorDe[unidad];
    return v === null || !Number.isFinite(v) ? "" : (v * vista(unidad)).toFixed(2);
  };
  const cambiarImporte = (unidad: UnidadImporte, texto: string) => {
    editado.current = true;
    setModificado(true);
    setEnEdicion({ unidad, texto });
    const valor = Number(texto);
    const vacio = texto === "" || !Number.isFinite(valor);
    if (unidad === "mes" || unidad === "total") {
      // El total puede estar a la vista en neto: el ancla siempre es bruto.
      setAncla(vacio ? null : { unidad: unidad === "mes" ? "mensual" : "total", valor: valor / vista(unidad) });
      if (vacio) {
        jornadaEscrita.current = "";
        onValorJornada("");
      }
      return;
    }
    if (unidad === "semana" && !vacio && diasSemana <= 0) return;
    // Jornada o semana: se avisa la jornada y el efecto de arriba la toma como nueva, anclando en su mensual.
    // Lo que se ve puede estar en neto (`soloNeto`): la jornada que se avisa siempre es bruta.
    const nueva = vacio ? "" : unidad === "semana" ? String(valor / vista(unidad) / diasSemana) : vista(unidad) === 1 ? texto : String(valor / vista(unidad));
    tipeoPendiente.current = nueva !== valorJornada;
    onValorJornada(nueva);
  };
  const soltar = () => setEnEdicion(null);

  /* Reponer la jornada original: vuelve a regir como recién llegada, y el ancla se rehace desde ella. */
  const originalNumero = original !== null && original !== "" && Number.isFinite(Number(original)) ? Number(original) : null;
  const hayQueRestaurar = modificado && originalNumero !== null && !(jornadaActual !== null && Math.abs(jornadaActual - originalNumero) < 1e-6);
  const restaurar = () => {
    setEnEdicion(null);
    setModificado(false);
    editado.current = false;
    tipeoPendiente.current = false;
    jornadaEscrita.current = "\u0000";
    if (original !== null && original !== valorJornada) onValorJornada(original);
    else setAncla(originalNumero === null ? null : anclaDesdeJornada(originalNumero, jornadas, mesesEq));
  };

  const campo = (unidad: UnidadImporte, rotulo: string, deshabilitado: boolean, ayuda: React.ReactNode, clase: string, debajo?: React.ReactNode) => (
    <div className="space-y-1">
      <label className={claseEtiqueta}>
        {icono}
        {rotulo}
        {infoEnRotulo?.(rotulo, ayuda)}
      </label>
      {adornoCampo ? (
        <div className="relative">
          {adornoCampo}
          <CampoImporte valor={importeEn(unidad)} onCambio={(v) => cambiarImporte(unidad, v)} onBlur={soltar} disabled={bloqueado || deshabilitado} className={clase} />
        </div>
      ) : (
        <CampoImporte valor={importeEn(unidad)} onCambio={(v) => cambiarImporte(unidad, v)} onBlur={soltar} disabled={bloqueado || deshabilitado} className={clase} />
      )}
      {!infoEnRotulo && ayuda}
      {debajo}
    </div>
  );

  const REFERENCIA = "Es un valor de referencia: sale de la escala de la categoría asignada, del sindicato y convenio elegidos.";
  const ayuda = (texto: React.ReactNode) => (
    <p className={claseAyuda}>
      {bloqueado ? textoBloqueado || "Se habilita más adelante." : soloNetoPedido && netoSobreBruto ? <>{REFERENCIA} {texto}</> : texto}
    </p>
  );

  /*
    SIN JORNADAS NO SE CARGA NINGÚN IMPORTE, TAMPOCO EL DE LA JORNADA.

    Los cuatro campos son el mismo número visto de cuatro maneras: escribir uno recalcula los otros
    tres. Sin las jornadas del contrato —que salen de desde, hasta y los días que trabaja— la cuenta
    no cierra para ningún lado: se podía dejar «1.000 por jornada, 5.000 por semana» con el mensual y
    el total en cero, que es un contrato que no dice cuánto se paga.

    La condición son las JORNADAS y no las fechas: un contrato de tiempo indeterminado no tiene fecha
    de baja —el mensual queda apagado porque no hay meses que calcular— pero sí lleva jornadas, y ahí
    el importe por jornada tiene que poder cargarse.
  */
  const TEXTO_SIN_JORNADAS = indeterminado ? "Cargá la fecha de alta y los días que trabaja para calcularlo." : "Cargá desde, hasta y los días que trabaja para calcularlo.";
  const sinJornadas = jornadas <= 0;

  /*
    CADA IMPORTE, EN BRUTO Y EN NETO, de a pares (pedido del 09/10/2026): jornada, semana y mensual. El
    bruto es el que se edita —es lo que se guarda—; el neto se calcula con la proporción neto/bruto de
    la escala y es de sólo lectura. El total del contrato va sólo en neto: es lo que cobra la persona.
  */
  const conNeto = Number(proporcionNeto) > 0;
  const textoNeto = (que: string) => `${que} bruto menos los descuentos de ley (queda el ${(Number(proporcionNeto) * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %, como en la escala). Se calcula solo.`;
  const campoNeto = (unidad: UnidadImporte, rotulo: string, que: string) => {
    const v = valorDe[unidad];
    const valor = v === null || !Number.isFinite(v) ? "" : (v * Number(proporcionNeto)).toFixed(2);
    const ayudaNeto = ayuda(textoNeto(que));
    return (
      <div className="space-y-1">
        <label className={claseEtiqueta}>
          {icono}
          {rotulo}
          {infoEnRotulo?.(rotulo, ayudaNeto)}
        </label>
        {adornoCampo ? (
          <div className="relative">
            {adornoCampo}
            <CampoImporte valor={valor} onCambio={() => {}} disabled className={claseCampo} />
          </div>
        ) : (
          <CampoImporte valor={valor} onCambio={() => {}} disabled className={claseCampo} />
        )}
        {!infoEnRotulo && ayudaNeto}
      </div>
    );
  };

  /*
    EL RESUMEN DEL TOTAL: lo que la pantalla sabe (período, área y turno, días) y la cuenta con los
    números de acá. El total es siempre jornada × jornadas del contrato (la jornada se deriva así: ver
    `derivarImportes`), en neto si hay proporción y en lo que se ve si no.
  */
  const jornadaDelTotal = valorDe.jornada !== null ? valorDe.jornada * vista("total") : null;
  const totalVisto = valorDe.total !== null ? valorDe.total * vista("total") : null;
  const lineasResumen: Array<[string, string]> = [];
  if (resumenTotal?.periodo) lineasResumen.push(["Período", resumenTotal.periodo]);
  if (resumenTotal?.areaTurno) lineasResumen.push(["Área / turno", resumenTotal.areaTurno]);
  if (resumenTotal?.dias) lineasResumen.push(["Días", resumenTotal.dias]);
  if (!sinJornadas) lineasResumen.push(["Cantidad de jornadas", String(jornadas)]);
  if (!sinJornadas && !indeterminado && jornadaDelTotal !== null && totalVisto !== null) {
    lineasResumen.push(["Cuenta", `${pesosAR(jornadaDelTotal)}${netoSobreBruto ? " neto" : ""} por jornada × ${jornadas} ${jornadas === 1 ? "jornada" : "jornadas"} = ${pesosAR(totalVisto)}`]);
  }
  const resumen =
    resumenTotal && lineasResumen.length > 0 ? (
      <ul className="mt-1 space-y-0.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-[11px] leading-snug text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
        {lineasResumen.map(([k, v]) => (
          <li key={k}>
            <span className="font-semibold text-slate-600 dark:text-slate-300">{k}:</span> {v}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className={className}>
      {soloNeto ? (
        <>
          {campo("jornada", "Importe por jornada neto", sinJornadas, ayuda(sinJornadas ? TEXTO_SIN_JORNADAS : "Si lo cambiás, se recalculan los demás."), claseCampo)}
          {campo("semana", "Importe por semana neto", sinJornadas || diasSemana <= 0, ayuda(sinJornadas ? TEXTO_SIN_JORNADAS : diasSemana > 0 ? `Jornada × ${diasSemana} ${diasSemana === 1 ? "día" : "días"} por semana.` : "Marcá los días que trabaja para calcularlo."), claseCampo)}
          {campo("mes", "Importe mensual neto", mesesEq <= 0 || sinJornadas, ayuda(mesesEq > 0 && !sinJornadas ? (Number(jornadasDelTipo) > 0 ? `Jornada × ${jornadasDelTipo} jornadas por mes del tipo de contrato.` : "Se prorratea según los días hábiles de cada mes del período.") : TEXTO_SIN_JORNADAS), claseCampo)}
        </>
      ) : (
      <>
      {campo("jornada", conNeto ? "Importe por jornada bruto" : "Importe por Jornada", sinJornadas, sinJornadas ? ayuda(TEXTO_SIN_JORNADAS) : ayudaJornada ?? ayuda("Total ÷ jornadas del contrato. Varía según los días hábiles de cada mes."), claseCampo)}
      {conNeto && campoNeto("jornada", "Importe por jornada neto", "El importe por jornada")}
      {campo("semana", conNeto ? "Importe por semana bruto" : "Importe por Semana", sinJornadas || diasSemana <= 0, ayuda(sinJornadas ? TEXTO_SIN_JORNADAS : diasSemana > 0 ? `Jornada × ${diasSemana} ${diasSemana === 1 ? "día" : "días"} por semana. Si lo cambiás, se recalculan los demás.` : "Marcá los días que trabaja para calcularlo."), claseCampo)}
      {conNeto && campoNeto("semana", "Importe por semana neto", "El importe por semana")}
      {campo("mes", conNeto ? "Importe mensual bruto" : "Importe mensual", mesesEq <= 0 || sinJornadas, ayuda(mesesEq > 0 && !sinJornadas ? (Number(jornadasDelTipo) > 0 ? `Jornada × ${jornadasDelTipo} jornadas por mes del tipo de contrato. Si lo cambiás, se recalculan los demás.` : indeterminado ? `Un mes completo: jornada × ${jornadas} jornadas. Si lo cambiás, se recalculan los demás.` : "Se prorratea según los días hábiles reales de cada mes del período. Si lo cambiás, se recalculan los demás.") : TEXTO_SIN_JORNADAS), claseCampo)}
      {conNeto && campoNeto("mes", "Importe mensual neto", "El importe mensual")}
      </>
      )}
      {campo("total", conNeto ? "Importe total del contrato neto" : "Importe total del contrato", sinJornadas || indeterminado, ayuda(indeterminado ? "Tiempo indeterminado: el contrato no termina, así que no tiene total. Lo que rige es el mensual." : !sinJornadas ? conNeto ? `Neto por jornada × ${jornadas} jornada(s) del contrato: lo que cobra por todo el contrato. Si lo cambiás, se recalculan los demás.` : Number(jornadasDelTipo) > 0 ? `Jornada × ${jornadas} jornada(s) del contrato.` : `Mensual × meses del contrato (${mesesEq.toLocaleString("es-AR", { maximumFractionDigits: 2 })}). Si lo cambiás, se recalculan los demás.` : TEXTO_SIN_JORNADAS), claseCampoTotal, resumen)}
      {hayQueRestaurar && !bloqueado && (
        <div className="col-span-full">
          <button
            type="button"
            onClick={restaurar}
            title={`Volver a ${originalNumero!.toLocaleString("es-AR", { style: "currency", currency: "ARS" })} por jornada: se recalculan la semana, el mensual y el total.`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></svg>
            Volver al valor original
          </button>
        </div>
      )}
    </div>
  );
}
