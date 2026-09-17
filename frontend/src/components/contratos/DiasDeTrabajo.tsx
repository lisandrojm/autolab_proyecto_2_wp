import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";

/**
 * CUÁNTOS DÍAS POR SEMANA TRABAJA, Y CUÁLES. Un solo componente para las dos pantallas.
 *
 * Lo usan «Agregar miembro» del escritorio y la «Solicitud de Contratación» de mobile. Va compartido y no
 * copiado porque la regla que hace no es de presentación: cuántos días se pueden tildar, y qué
 * significan esos días según si el esquema es fijo o rotativo. Dos copias de eso divergen, y la
 * divergencia no se ve — se ve meses después, en un contrato con los días mal cargados.
 *
 * FIJO Y ROTATIVO GUARDAN LA MISMA LISTA, PERO NO SIGNIFICAN LO MISMO
 *
 *   fijo       los días marcados son LOS que trabaja. Son exactamente `jornadas`.
 *   rotativo   los días marcados son ENTRE los que rota. Son `jornadas` o más.
 *
 * El caso que obliga a distinguirlos: alguien trabaja 3 días pero rota entre todos menos el sábado.
 * Con una sola lista sin el flag, eso se leería como «trabaja los 6 días marcados».
 */

/** Domingo primero, como los `Date.getDay()` de JS: la lista se guarda con esos índices. */
export const DIAS_SEMANA = [
  { indice: 0, corto: "Do", largo: "Domingo" },
  { indice: 1, corto: "Lu", largo: "Lunes" },
  { indice: 2, corto: "Ma", largo: "Martes" },
  { indice: 3, corto: "Mi", largo: "Miércoles" },
  { indice: 4, corto: "Ju", largo: "Jueves" },
  { indice: 5, corto: "Vi", largo: "Viernes" },
  { indice: 6, corto: "Sá", largo: "Sábado" },
] as const;

/**
 * Cuántos días se pueden marcar como máximo.
 *
 * Con esquema FIJO, exactamente los que trabaja: marcar un cuarto día cuando trabaja tres sería
 * declarar otra cosa. Con esquema ROTATIVO, hasta los siete: el sentido de rotar es tener más días
 * disponibles que jornadas.
 */
export const maximoDiasElegibles = (jornadas: number, rotativos: boolean): number => (rotativos ? 7 : Math.max(0, Math.min(7, jornadas)));

/**
 * Qué le falta a esta configuración para estar completa. `null` = está bien.
 *
 * EL MENSAJE CUENTA LO QUE FALTA, no repite la consigna. «Elegí exactamente 5 día(s)» decía la regla
 * y nada más: con tres marcados había que contarlos a mano para saber cuántos quedaban. Ahora dice
 * los dos números, que es la única pregunta que alguien se hace mientras los tilda.
 *
 * En ROTATIVO no hay descuento posible y por eso el texto es otro: el tope no es la cantidad de días
 * que trabaja sino la semana entera. Se pide un mínimo —rotar entre exactamente los días que trabaja
 * es un esquema fijo con otro nombre— y de ahí para arriba cualquier cantidad es válida.
 */
export const problemaDeDias = (jornadas: number, rotativos: boolean, dias: number[]): string | null => {
  if (!jornadas || jornadas < 1) return null; // Sin jornadas cargadas todavía no hay nada que validar.
  if (rotativos) {
    if (dias.length < jornadas) return `Elegí al menos ${jornadas} día(s) entre los que rota: llevás ${dias.length}.`;
    return null;
  }
  const faltan = jornadas - dias.length;
  if (faltan > 0) return `${dias.length} de ${jornadas} elegidos · falta${faltan === 1 ? "" : "n"} ${faltan}.`;
  // Sobrar no debería pasar —`maximoDiasElegibles` frena en el tope— pero si pasa hay que verlo.
  if (faltan < 0) return `Elegiste ${dias.length} días y trabaja ${jornadas}: destildá ${-faltan}.`;
  return null;
};

/**
 * QUÉ FALTA PARA PODER GUARDAR. `null` = está completo.
 *
 * Es distinto de `problemaDeDias`, y la diferencia es EL MOMENTO. Aquél dibuja el aviso mientras se
 * completa el formulario, así que con la cantidad todavía vacía calla: gritarle a alguien por un
 * campo que no llegó a tocar es ruido. Éste corre al guardar, cuando ya no hay «todavía»: un contrato
 * sin días definidos queda afirmando que la persona trabaja, sin decir cuánto ni cuándo.
 *
 * Los dos comparten la regla de los días para no poder discrepar sobre qué está completo; lo único
 * que agrega éste es exigir la cantidad, que es la que habilita todo lo demás.
 */
export const faltaDefinirDias = (jornadas: number, rotativos: boolean, dias: number[]): string | null => {
  if (!jornadas || jornadas < 1) return "cargá cuántos días por semana trabaja";
  const problema = problemaDeDias(jornadas, rotativos, dias);
  return problema ? problema.replace(/\.$/, "").toLowerCase() : null;
};

/**
 * Las jornadas TOTALES que salen de trabajar `diasPorSemana` entre dos fechas.
 *
 * Es una ESTIMACIÓN de calendario: no sabe de feriados, licencias ni de que la última semana esté
 * cortada al medio. Por eso se ofrece y no se impone — `cantidad_jornadas_laborales` multiplica al
 * sueldo por jornada, y pisarla sola cambiaría lo que se le paga a alguien sin que nadie lo pidiera.
 */
export const jornadasEstimadas = (desde?: string, hasta?: string, diasPorSemana?: number): number | null => {
  if (!desde || !hasta || !diasPorSemana) return null;
  const d1 = new Date(desde + "T00:00:00");
  const d2 = new Date(hasta + "T00:00:00");
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime()) || d2 < d1) return null;
  const dias = Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1;
  return Math.max(1, Math.round((dias / 7) * diasPorSemana));
};

interface Props {
  jornadas: number;
  onJornadas: (n: number) => void;
  rotativos: boolean;
  onRotativos: (v: boolean) => void;
  dias: number[];
  onDias: (d: number[]) => void;
  /** Período del contrato, para estimar las jornadas totales. Sin él, no se sugiere nada. */
  desde?: string;
  hasta?: string;
  /**
   * Las jornadas totales cargadas hoy, y cómo cambiarlas si se acepta la sugerencia. Sin
   * `onJornadasTotales` no se sugiere nada: la solicitud de mobile ya las calcula por su cuenta.
   */
  jornadasTotales?: number;
  onJornadasTotales?: (n: number) => void;
  /**
   * Hasta cuántos días por semana admite el TIPO DE CONTRATO elegido (`Contrato.data.diasPorSemana`).
   *
   * `null` o sin pasar = ese contrato no fija ninguno, y ahí el tope es 7, que es la semana entera.
   * Es sólo para decirlo y para acotar el campo; recortar lo que ya estaba cargado lo sigue haciendo
   * cada pantalla, que es la que sabe qué más toca cuando el contrato cambia.
   */
  limiteContrato?: number | null;
  /** Errores al intentar guardar, dichos debajo de cada campo. */
  errorDiasPorSemana?: string;
  errorDias?: string;
  /** `mobile` usa la paleta de esa app; `desk` usa las clases del formulario de escritorio. */
  variante?: "desk" | "mobile";
  className?: string;
}

export const DiasDeTrabajo: React.FC<Props> = ({ jornadas, onJornadas, rotativos, onRotativos, dias, onDias, desde, hasta, jornadasTotales, onJornadasTotales, limiteContrato, errorDiasPorSemana, errorDias, variante = "desk", className = "" }) => {
  const [verTope, setVerTope] = useState(false);
  const estimadas = jornadasEstimadas(desde, hasta, jornadas);
  const mobile = variante === "mobile";
  const maximo = maximoDiasElegibles(jornadas, rotativos);
  const problema = problemaDeDias(jornadas, rotativos, dias);
  // Con esquema fijo y sin la cantidad cargada, el tope es 0: todos los días quedan bloqueados.
  const sinCantidad = !rotativos && !jornadas;
  /*
    CUÁNTOS DÍAS POR SEMANA SE PUEDEN CARGAR: LO DICE EL CONTRATO.

    El campo decía «Máximo 7» a secas y no era cierto: un «5x7» no admite seis, y quien cargaba seis
    se los veía recortar sin saber por qué. El 7 es el tope de la semana, el que rige cuando el tipo
    de contrato no fija ninguno — el valor por defecto, no la regla.

    Va en un ⓘ y no en el renglón de ayuda porque es una explicación de dos oraciones que se lee una
    vez; debajo del campo, en cada pantalla, era otro párrafo fijo compitiendo con el error.
  */
  const tope = limiteContrato != null && limiteContrato > 0 ? Math.min(7, Math.trunc(limiteContrato)) : 7;

  const etiqueta = mobile ? "text-xs font-bold text-slate-500 uppercase tracking-wider" : "block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1";
  const input = mobile ? "w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" : "input-field w-full";
  const ayuda = mobile ? "text-[11px] text-slate-400" : "text-[10px] text-gray-400 ml-1";
  const error = "text-[11px] font-medium text-red-600 dark:text-red-400 ml-0.5";

  const alternarDia = (indice: number) => {
    if (dias.includes(indice)) return onDias(dias.filter((d) => d !== indice));
    // Se frena al tope en vez de dejar marcar y avisar después: el límite es la regla, no un aviso.
    if (dias.length >= maximo) return;
    onDias([...dias, indice].sort((a, b) => a - b));
  };

  /*
    EN MÓVIL, TODO DENTRO DE UN MISMO CONTORNO: la cantidad y los días son una sola cosa —cuántos días
    trabaja y cuáles— y con el borde se leen como un bloque entre otros campos del mismo aspecto.
  */
  const marco = mobile ? "space-y-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700" : "space-y-3";

  return (
    <div className={`${marco} ${className}`}>
      <div className={`space-y-1.5 ${mobile ? "sm:max-w-[10rem]" : ""}`}>
        <div className="flex items-center gap-1.5">
          <label className={etiqueta}>Días por semana</label>
          <button type="button" onClick={() => setVerTope((v) => !v)} aria-expanded={verTope} title="¿Cuál es el máximo?" aria-label="Cuál es el máximo de días por semana" className="text-slate-400 transition-colors hover:text-blue-500">
            <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
          </button>
        </div>
        {verTope && (
          <p className={`${ayuda} rounded-lg border border-blue-200 bg-blue-50/60 p-2 leading-relaxed dark:border-blue-900 dark:bg-blue-950/30`}>
            Cuántos días de la semana trabaja. El máximo lo fija el <strong>tipo de contrato</strong>:{" "}
            {limiteContrato != null && limiteContrato > 0 ? <>el elegido admite hasta {tope} por semana.</> : <>el elegido no fija ninguno, así que el tope es 7, la semana entera.</>}
          </p>
        )}
        <input
          type="number"
          min={1}
          max={tope}
          step={1}
          value={jornadas || ""}
          onChange={(e) => {
            const n = Math.max(0, Math.min(tope, Math.trunc(Number(e.target.value)) || 0));
            onJornadas(n);
            /*
              Bajar la cantidad recorta lo que ya estaba marcado, y solo en esquema fijo.

              Si trabajaba 5 días y pasa a 3, quedarse con los 5 marcados dejaría el formulario
              afirmando algo que la propia cantidad contradice. En rotativo no se recorta: el pool
              puede ser más grande que las jornadas, que es justamente el punto.
            */
            if (!rotativos && dias.length > n) onDias(dias.slice(0, n));
          }}
          className={`${input} ${errorDiasPorSemana ? "border-red-400 dark:border-red-700" : ""}`}
          placeholder="Ej: 5"
          aria-invalid={!!errorDiasPorSemana}
        />
        {errorDiasPorSemana && <p className={error}>{errorDiasPorSemana}</p>}
      </div>

      {/*
        La relación con las jornadas TOTALES, dicha y no aplicada (sólo en escritorio: la solicitud de
        mobile las calcula y no pasa `onJornadasTotales`).
      */}
      {estimadas !== null && onJornadasTotales && estimadas !== jornadasTotales && (
        <p className={"text-[11px] text-blue-700 dark:text-blue-400 flex flex-wrap items-center gap-1.5"}>
          Con {jornadas} día(s) por semana en este período serían <strong>~{estimadas} jornadas</strong> (hoy: {jornadasTotales ?? 0}).
          <button type="button" onClick={() => onJornadasTotales(estimadas)} className="font-semibold underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-300">
            Usar {estimadas}
          </button>
        </p>
      )}

      <div className="space-y-1.5">
        {/*
          EL SWITCH VA EN LA FILA DE LOS DÍAS, que es lo que gobierna: cambia qué significan los chips
          de abajo. Antes era una tarjeta con borde propio, estirada al lado de la cantidad, y se veía
          descentrada y desconectada de lo que controla.
        */}
        <div className="flex items-center justify-between gap-3">
          <label className={etiqueta}>{rotativos ? "Rota entre estos días" : "Días que trabaja"}</label>
          <label className="flex cursor-pointer select-none items-center gap-2">
            <span className={`text-sm ${mobile ? "text-slate-700 dark:text-slate-200" : "text-gray-700 dark:text-gray-300"}`}>Días rotativos</span>
            <span className={`flex h-6 w-10 shrink-0 items-center rounded-full p-1 duration-300 ease-in-out ${rotativos ? "bg-blue-500 dark:bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}>
              <span className={`h-4 w-4 transform rounded-full bg-white shadow-md duration-300 ease-in-out ${rotativos ? "translate-x-4" : ""}`} />
            </span>
            <input type="checkbox" checked={rotativos} onChange={(e) => onRotativos(e.target.checked)} className="hidden" />
          </label>
        </div>

        {/* En rotativo se aclara qué significan los días marcados; en fijo, los chips y la cuenta de abajo alcanzan. */}
        {rotativos && <p className={ayuda}>Marcá entre qué días rota. Pueden ser más que los días que trabaja.</p>}

        <div className="flex flex-wrap gap-1.5">
          {DIAS_SEMANA.map((d) => {
            const elegido = dias.includes(d.indice);
            // Deshabilitado y no oculto: se ve que existe y por qué no se puede marcar (llegó al tope).
            const bloqueado = !elegido && dias.length >= maximo;
            return (
              <button
                key={d.indice}
                type="button"
                onClick={() => alternarDia(d.indice)}
                disabled={bloqueado}
                title={sinCantidad ? "Ingresá días por semana para habilitar los días" : bloqueado ? `Ya elegiste ${maximo} día(s)` : d.largo}
                aria-pressed={elegido}
                className={`w-11 h-9 rounded-lg text-xs font-bold border transition-colors ${elegido ? "bg-blue-600 text-white border-blue-600" : bloqueado ? `${mobile ? "bg-slate-100 dark:bg-slate-900" : "bg-gray-50 dark:bg-gray-800"} text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50` : `${mobile ? "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"} text-gray-700 dark:text-gray-300 hover:border-blue-400`}`}
              >
                {d.corto}
              </button>
            );
          })}
        </div>
        {/*
          El renglón dice SIEMPRE lo mismo y solo cambia de color: la cuenta está desde el primer día
          tildado y el ámbar dice si todavía falta. Sin la cantidad cargada, en vez de dejar botones
          grises sin explicación, se dice qué los habilita. Al guardar, el error manda.
        */}
        {errorDias ? (
          <p className={error}>{errorDias}</p>
        ) : sinCantidad ? (
          <p className={ayuda}>Ingresá días por semana para habilitar los días.</p>
        ) : (
          <p className={problema ? "text-[11px] text-amber-700 dark:text-amber-400 ml-0.5" : ayuda}>{problema || (rotativos ? `Trabaja ${jornadas || 0} de estos ${dias.length} días, rotando.` : `${dias.length} de ${jornadas || 0} elegidos.`)}</p>
        )}
      </div>
    </div>
  );
};
