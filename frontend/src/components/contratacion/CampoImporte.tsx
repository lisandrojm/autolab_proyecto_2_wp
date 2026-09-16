import { useRef } from "react";
import { aImporteArgentino, deImporteArgentino } from "../../utils/importeArgentino";

/**
 * UN IMPORTE, CON SEPARADOR DE MILES MIENTRAS SE ESCRIBE (ver `utils/importeArgentino`).
 *
 * Muestra «753.587,99» y entrega «753587.99»: quien lo usa sigue haciendo las cuentas con el número
 * limpio. Las clases van por props porque la app y el panel se ven distinto.
 */
export function CampoImporte({ valor, onCambio, onBlur, disabled, className }: { valor: string; onCambio: (valor: string) => void; onBlur?: () => void; disabled?: boolean; className: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={aImporteArgentino(valor)}
      onChange={(e) => {
        // El cursor se repone contando cifras, no posiciones: al aparecer un punto de miles, la posición se corre.
        const antes = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length).replace(/[^\d,]/g, "").length;
        onCambio(deImporteArgentino(e.target.value));
        requestAnimationFrame(() => {
          const nodo = ref.current;
          if (!nodo || document.activeElement !== nodo) return;
          let i = 0;
          for (let vistas = 0; i < nodo.value.length && vistas < antes; i++) if (/[\d,]/.test(nodo.value[i])) vistas++;
          nodo.setSelectionRange(i, i);
        });
      }}
      onBlur={onBlur}
      disabled={disabled}
      className={className}
      placeholder="0"
    />
  );
}
