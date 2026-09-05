import React from 'react';

/**
 * CUÁNTOS DÍAS POR SEMANA TRABAJA, Y CUÁLES. Un solo componente para las dos pantallas.
 *
 * Lo usan «Agregar miembro» del escritorio y la «Solicitud de Alta» de mobile. Va compartido y no
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
  { indice: 0, corto: 'Do', largo: 'Domingo' },
  { indice: 1, corto: 'Lu', largo: 'Lunes' },
  { indice: 2, corto: 'Ma', largo: 'Martes' },
  { indice: 3, corto: 'Mi', largo: 'Miércoles' },
  { indice: 4, corto: 'Ju', largo: 'Jueves' },
  { indice: 5, corto: 'Vi', largo: 'Viernes' },
  { indice: 6, corto: 'Sá', largo: 'Sábado' },
] as const;

/**
 * Cuántos días se pueden marcar como máximo.
 *
 * Con esquema FIJO, exactamente los que trabaja: marcar un cuarto día cuando trabaja tres sería
 * declarar otra cosa. Con esquema ROTATIVO, hasta los siete: el sentido de rotar es tener más días
 * disponibles que jornadas.
 */
export const maximoDiasElegibles = (jornadas: number, rotativos: boolean): number => (rotativos ? 7 : Math.max(0, Math.min(7, jornadas)));

/** Qué le falta a esta configuración para estar completa. `null` = está bien. */
export const problemaDeDias = (jornadas: number, rotativos: boolean, dias: number[]): string | null => {
  if (!jornadas || jornadas < 1) return null; // Sin jornadas cargadas todavía no hay nada que validar.
  if (rotativos) {
    // Rotar entre exactamente los días que trabaja no es rotar: es un esquema fijo con otro nombre.
    if (dias.length < jornadas) return `Elegí al menos ${jornadas} día(s) entre los que rota.`;
    return null;
  }
  if (dias.length !== jornadas) return `Elegí exactamente ${jornadas} día(s).`;
  return null;
};

interface Props {
  jornadas: number;
  onJornadas: (n: number) => void;
  rotativos: boolean;
  onRotativos: (v: boolean) => void;
  dias: number[];
  onDias: (d: number[]) => void;
  /** `mobile` usa la paleta de esa app; `desk` usa las clases del formulario de escritorio. */
  variante?: 'desk' | 'mobile';
  className?: string;
}

export const DiasDeTrabajo: React.FC<Props> = ({ jornadas, onJornadas, rotativos, onRotativos, dias, onDias, variante = 'desk', className = '' }) => {
  const mobile = variante === 'mobile';
  const maximo = maximoDiasElegibles(jornadas, rotativos);
  const problema = problemaDeDias(jornadas, rotativos, dias);

  const etiqueta = mobile ? 'text-xs font-bold text-slate-500 uppercase tracking-wider' : 'block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1';
  const input = mobile
    ? 'w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium'
    : 'input-field w-full';

  const alternarDia = (indice: number) => {
    if (dias.includes(indice)) return onDias(dias.filter((d) => d !== indice));
    // Se frena al tope en vez de dejar marcar y avisar después: el límite es la regla, no un aviso.
    if (dias.length >= maximo) return;
    onDias([...dias, indice].sort((a, b) => a - b));
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="space-y-1.5">
        <label className={etiqueta}>Días por semana</label>
        <input
          type="number"
          min={1}
          max={7}
          value={jornadas || ''}
          onChange={(e) => {
            const n = Math.max(0, Math.min(7, Number(e.target.value) || 0));
            onJornadas(n);
            /*
              Bajar la cantidad recorta lo que ya estaba marcado, y solo en esquema fijo.

              Si trabajaba 5 días y pasa a 3, quedarse con los 5 marcados dejaría el formulario
              afirmando algo que la propia cantidad contradice. En rotativo no se recorta: el pool
              puede ser más grande que las jornadas, que es justamente el punto.
            */
            if (!rotativos && dias.length > n) onDias(dias.slice(0, n));
          }}
          className={input}
          placeholder="Ej: 5"
        />
        <p className={mobile ? 'text-[11px] text-slate-400' : 'text-[10px] text-gray-400 ml-1'}>Cuántos días de la semana trabaja. Por ejemplo 3, 5 o 7.</p>
      </div>

      {/* El switch va ENTRE la cantidad y los días porque cambia qué significan los de abajo. */}
      <label className={`flex items-center gap-3 cursor-pointer select-none ${mobile ? 'p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700' : 'rounded-lg border border-gray-200 dark:border-gray-700 p-3'}`}>
        <span className={`w-10 h-6 flex items-center rounded-full p-1 shrink-0 duration-300 ease-in-out ${rotativos ? 'bg-blue-500 dark:bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
          <span className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${rotativos ? 'translate-x-4' : ''}`} />
        </span>
        <input
          type="checkbox"
          checked={rotativos}
          onChange={(e) => onRotativos(e.target.checked)}
          className="hidden"
        />
        <span className="min-w-0">
          <span className={`block text-sm ${mobile ? 'text-slate-700 dark:text-slate-200' : 'text-gray-700 dark:text-gray-300'}`}>Días rotativos</span>
          <span className={`block text-[11px] ${mobile ? 'text-slate-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {rotativos ? 'Marcá entre qué días rota. Pueden ser más que los días que trabaja.' : 'Marcá los días fijos que trabaja.'}
          </span>
        </span>
      </label>

      <div className="space-y-1.5">
        <label className={etiqueta}>{rotativos ? 'Rota entre estos días' : 'Días que trabaja'}</label>
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
                title={bloqueado ? `Ya elegiste ${maximo} día(s)` : d.largo}
                aria-pressed={elegido}
                className={`w-11 h-9 rounded-lg text-xs font-bold border transition-colors ${
                  elegido
                    ? 'bg-blue-600 text-white border-blue-600'
                    : bloqueado
                      ? `${mobile ? 'bg-slate-100 dark:bg-slate-900' : 'bg-gray-50 dark:bg-gray-800'} text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50`
                      : `${mobile ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'} text-gray-700 dark:text-gray-300 hover:border-blue-400`
                }`}
              >
                {d.corto}
              </button>
            );
          })}
        </div>
        {problema ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 ml-0.5">{problema}</p>
        ) : (
          <p className={mobile ? 'text-[11px] text-slate-400' : 'text-[10px] text-gray-400 ml-1'}>
            {rotativos ? `Trabaja ${jornadas || 0} de estos ${dias.length} días, rotando.` : `${dias.length} de ${jornadas || 0} elegidos.`}
          </p>
        )}
      </div>
    </div>
  );
};
