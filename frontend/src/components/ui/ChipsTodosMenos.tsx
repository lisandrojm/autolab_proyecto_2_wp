import React from "react";

/**
 * UN FILTRO QUE ARRANCA CON TODO PUESTO (25/11/2026, pedido del usuario para Reportes de Novedades).
 *
 * Todas las opciones a la vista, como chips, y todas incluidas: tocar una la saca del reporte, tocarla de
 * nuevo la vuelve a incluir. Es la pregunta real («todo menos jornaleros»), que con un buscador de «qué
 * incluir» obligaba a elegir once tipos de doce.
 *
 * El valor es la lista de INCLUIDOS, igual que los otros filtros: vacía = todos. Así el filtrado no cambia.
 * No se puede sacar la última: sin nada incluido el reporte quedaría vacío sin que se note por qué.
 */
interface Props {
  etiqueta: string;
  items: string[];
  value: string[];
  onChange: (incluidos: string[]) => void;
  /** Con la lista vacía (no hay opciones en el período). */
  textoVacio?: string;
  ayuda?: React.ReactNode;
}

export const ChipsTodosMenos: React.FC<Props> = ({ etiqueta, items, value, onChange, textoVacio, ayuda }) => {
  const todos = value.length === 0;
  const incluido = (i: string) => todos || value.includes(i);
  const excluidos = todos ? [] : items.filter((i) => !value.includes(i));
  const alternar = (i: string) => {
    const siguiente = todos ? items.filter((x) => x !== i) : value.includes(i) ? value.filter((x) => x !== i) : [...value, i];
    if (siguiente.filter((x) => items.includes(x)).length === 0) return;
    onChange(items.every((x) => siguiente.includes(x)) ? [] : siguiente);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 ml-1">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{etiqueta}</span>
        {items.length > 0 && <span className="text-[11px] text-gray-500 dark:text-gray-400">({items.length - excluidos.length} de {items.length})</span>}
        {excluidos.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="ml-auto text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">
            Incluir todos
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">
        {ayuda ?? (items.length === 0 ? textoVacio || "No hay opciones." : excluidos.length === 0 ? "Entran todos. Tocá uno para sacarlo del reporte." : `Sin ${excluidos.join(", ")}. Tocá uno para volver a incluirlo.`)}
      </p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => {
            const on = incluido(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => alternar(i)}
                aria-pressed={on}
                title={on ? "Tocá para sacarlo del reporte" : "Tocá para volver a incluirlo"}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  on
                    ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
                    : "bg-transparent border-gray-300 text-gray-400 line-through hover:border-gray-400 dark:border-gray-600 dark:text-gray-500"
                }`}
              >
                {i}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
