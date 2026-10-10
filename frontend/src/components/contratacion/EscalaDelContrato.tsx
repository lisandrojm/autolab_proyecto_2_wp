import React, { useState } from "react";
import type { CategoriaSatItem } from "../../api/categoriasSat";
import { CampoImporte } from "./CampoImporte";

/*
  LAS COLUMNAS DE LA ESCALA DE LA CATEGORÍA, con lo que se paga EN ESTE CONTRATO.

  La escala del convenio (Configuración → Categorías) es una cadena lineal a partir del básico, con el
  % adicional fijo por grupo:

      adicional    = básico × % adicional
      presentismo  = (básico + adicional) × 10 %
      bruto        = básico + adicional + presentismo
      neto         = bruto × 0,81
      por jornada  = (básico + adicional + presentismo) ÷ jornadas del tipo de contrato × multiplicador
                     (la cuenta de `importePorJornada`; sin jornadas en el tipo, ÷ 30)

  Como es lineal, lo pactado se describe con UN factor contra la escala: el importe por jornada
  cargado ÷ el de la escala. Cada columna es su valor de escala por ese factor. Editar cualquiera
  cambia el factor —y con él el importe por jornada, que es lo único que se guarda— y los otros cuatro
  importes del contrato (`ImportesDelContrato`) se recalculan solos, como cuando se edita la jornada.

  El % adicional no se edita: es del grupo, no del contrato. Se muestra para que la cuenta se lea.
*/

type Columna = "basico" | "adicional" | "presentismo" | "bruto" | "neto";

interface Props {
  categoria: CategoriaSatItem | null | undefined;
  /** Multiplicador del tipo de contrato (0 o vacío = 1). */
  multiplicador?: number | null;
  /** Jornadas del tipo de contrato (0 o vacío = 30): la escala mensual se divide por esto. */
  jornadasDelTipo?: number | null;
  /** El importe por jornada, texto canónico ("45454.545454"). El mismo de `ImportesDelContrato`. */
  valorJornada: string;
  onValorJornada: (valor: string) => void;
  bloqueado?: boolean;
  className?: string;
  claseEtiqueta: string;
  claseCampo: string;
  claseAyuda: string;
  icono?: React.ReactNode;
  adornoCampo?: React.ReactNode;
  /** Igual que en `ImportesDelContrato`: la ayuda detrás de una «i» en el rótulo (móvil). */
  infoEnRotulo?: (titulo: string, ayuda: React.ReactNode) => React.ReactNode;
  /** Pedido de servicios: sólo el sueldo neto, como valor de referencia (ver `soloNeto` en `ImportesDelContrato`). */
  soloNeto?: boolean;
  /** Sin «Sueldo bruto» ni «Sueldo neto»: el móvil muestra básico, adicional y presentismo; el bruto y el neto se ven en los importes por jornada. */
  sinBrutoNiNeto?: boolean;
}

const pct = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;

export function EscalaDelContrato({ categoria, multiplicador, jornadasDelTipo, valorJornada, onValorJornada, bloqueado = false, className = "", claseEtiqueta, claseCampo, claseAyuda, icono, adornoCampo, infoEnRotulo, soloNeto = false, sinBrutoNiNeto = false }: Props) {
  const [enEdicion, setEnEdicion] = useState<{ columna: Columna; texto: string } | null>(null);
  const d: any = categoria?.data || {};
  const mult = Number(multiplicador) > 0 ? Number(multiplicador) : 1;
  const escala: Record<Columna, number> = {
    basico: Number(d.sueldoBasico) || 0,
    adicional: Number(d.sueldoAdicional) || 0,
    presentismo: Number(d.presentismo) || 0,
    bruto: Number(d.sueldoBruto) || 0,
    neto: Number(d.neto) || 0,
  };
  /*
    La misma cuenta que `importePorJornada` (@compartido/jornadas), SIN redondear: el factor tiene que
    dar 1 cuando lo cargado es la escala. Básico + adicional + presentismo (o el bruto, si no vienen
    por separado) ÷ las jornadas del tipo de contrato × su multiplicador.
  */
  const jornadas = Number(jornadasDelTipo) > 0 ? Number(jornadasDelTipo) : 30;
  const mensualDeEscala = escala.basico + escala.adicional + escala.presentismo > 0 ? escala.basico + escala.adicional + escala.presentismo : escala.bruto;
  const jornadaDeEscala = (mensualDeEscala / jornadas) * mult;
  if (!categoria || jornadaDeEscala <= 0) return null;

  const jornada = Number(valorJornada);
  const factor = valorJornada !== "" && Number.isFinite(jornada) ? jornada / jornadaDeEscala : 1;
  const valorDe = (c: Columna) => {
    if (enEdicion?.columna === c) return enEdicion.texto;
    const v = escala[c] * factor;
    return escala[c] > 0 && Number.isFinite(v) ? v.toFixed(2) : "";
  };
  const cambiar = (c: Columna, texto: string) => {
    setEnEdicion({ columna: c, texto });
    const n = Number(texto);
    if (texto === "" || !Number.isFinite(n) || escala[c] <= 0) return;
    onValorJornada(String(jornadaDeEscala * (n / escala[c])));
  };
  const adicionalPct = escala.basico > 0 ? (escala.adicional / escala.basico) * 100 : null;
  const distinto = Math.abs(factor - 1) > 1e-9;

  const ayudas: Record<Columna | "pct", React.ReactNode> = {
    basico: "El sueldo básico del grupo en la escala del convenio. Es la base de toda la cuenta: el adicional, el presentismo, el bruto y el neto salen de él.",
    adicional: "El adicional del convenio: el básico por el % adicional del grupo.",
    pct: "El % adicional es fijo para el grupo: lo define el convenio, no el contrato. Por eso no se edita acá.",
    presentismo: "El 10 % del básico más el adicional.",
    bruto: `Básico + adicional + presentismo: lo que cobra antes de los descuentos de ley. Dividido ${jornadas} (las jornadas del tipo de contrato)${mult !== 1 ? ` y por el multiplicador del contrato (×${mult.toLocaleString("es-AR")})` : ""} da el importe por jornada.`,
    neto: soloNeto ? "Es un valor de referencia: el sueldo neto de la escala de la categoría asignada, del sindicato y convenio elegidos." : "El bruto menos los descuentos (queda el 81 %).",
  };
  const pie = distinto ? ` Cargado ${factor > 1 ? "por encima" : "por debajo"} de la escala (${pct((factor - 1) * 100)}): si lo cambiás, se recalculan los demás y los importes del contrato.` : " Si lo cambiás, se recalculan los demás y los importes del contrato.";

  const rotulo = (titulo: string, ayuda: React.ReactNode) => (
    <label className={claseEtiqueta}>
      {icono}
      {titulo}
      {infoEnRotulo?.(titulo, ayuda)}
    </label>
  );
  const campo = (c: Columna, titulo: string) => (
    <div className="space-y-1">
      {rotulo(titulo, <>{ayudas[c]}{pie}</>)}
      <div className={adornoCampo ? "relative" : undefined}>
        {adornoCampo}
        <CampoImporte valor={valorDe(c)} onCambio={(v) => cambiar(c, v)} onBlur={() => setEnEdicion(null)} disabled={bloqueado} className={claseCampo} />
      </div>
      {!infoEnRotulo && <p className={claseAyuda}>{ayudas[c]}</p>}
    </div>
  );

  if (soloNeto) return <div className={className}>{campo("neto", "Sueldo neto")}</div>;

  return (
    <div className={className}>
      {campo("basico", "Sueldo básico")}
      {campo("adicional", "Adicional")}
      <div className="space-y-1">
        {rotulo("% Adicional", ayudas.pct)}
        <div className={adornoCampo ? "relative" : undefined}>
          <input type="text" readOnly disabled value={adicionalPct !== null ? pct(adicionalPct) : "—"} className={claseCampo.replace("pl-10", "pl-4")} />
        </div>
        {!infoEnRotulo && <p className={claseAyuda}>{ayudas.pct}</p>}
      </div>
      {campo("presentismo", "Presentismo")}
      {!sinBrutoNiNeto && campo("bruto", "Sueldo bruto")}
      {!sinBrutoNiNeto && campo("neto", "Sueldo neto")}
    </div>
  );
}
