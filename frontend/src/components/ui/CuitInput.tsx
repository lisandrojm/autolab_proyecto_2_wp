import React, { useLayoutEffect, useRef, useState } from "react";

// Pesos oficiales del algoritmo de AFIP (módulo 11) para el dígito verificador.
const MULT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Deja sólo dígitos, con un máximo de 11 (largo de un CUIT/CUIL). */
export function cleanCuit(raw: string): string {
  return (raw || "").replace(/\D/g, "").slice(0, 11);
}

/** Formatea los dígitos como XX-XXXXXXXX-X (agrega los guiones en tiempo real). */
export function formatCuit(value: string): string {
  const d = cleanCuit(value);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** Prefijos que usa AFIP: 20/23/24/25/26/27 personas físicas, 30/33/34 jurídicas. */
const PREFIJOS_CUIT = ["20", "23", "24", "25", "26", "27", "30", "33", "34"];

/**
 * Valida el CUIT/CUIL con el criterio real de AFIP/ANSES. No alcanza con el módulo 11:
 *  - 11 dígitos exactos,
 *  - prefijo de tipo válido (persona física o jurídica),
 *  - no un mismo dígito repetido (00000000000 y similares pasan el módulo 11 pero no existen —
 *    eran el placeholder que se cargaba antes; hoy, para esa gente, va el circuito "Sin CUIT"),
 *  - dígito verificador correcto.
 * Mismo criterio que `cuitEsValido` de ConstanciaBulk, que es el que usa Contratos.
 */
export function isValidCuit(value: string): boolean {
  const d = cleanCuit(value);
  if (d.length !== 11) return false;
  if (!PREFIJOS_CUIT.includes(d.slice(0, 2))) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const n = d.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += n[i] * MULT[i];
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9; // convención AFIP
  return dv === n[10];
}

interface CuitInputProps {
  /** Valor limpio (sólo dígitos, sin guiones). */
  value: string;
  /** Callback con el valor limpio (sólo dígitos). */
  onChange: (clean: string) => void;
  /** Se dispara al perder el foco con el resultado de la validación AFIP. */
  onValidityChange?: (valid: boolean) => void;
  /** Fuerza el estado de error (ej.: campo obligatorio vacío desde el form). */
  invalid?: boolean;
  className?: string;
  id?: string;
  placeholder?: string;
  autoComplete?: string;
}

/**
 * Input de CUIT/CUIL con máscara XX-XXXXXXXX-X.
 * - Sólo acepta números (cualquier otra tecla se ignora).
 * - Agrega/quita los guiones automáticamente y mantiene la posición del cursor.
 * - Valida con el algoritmo de AFIP (módulo 11) al perder el foco.
 * - Expone hacia afuera el valor limpio (11 dígitos, sin guiones).
 */
export const CuitInput: React.FC<CuitInputProps> = ({
  value,
  onChange,
  onValidityChange,
  invalid,
  className = "",
  id,
  placeholder = "XX-XXXXXXXX-X",
  autoComplete = "off",
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const [formatError, setFormatError] = useState(false);

  const display = formatCuit(value);

  // Restaura el cursor después de que React re-renderiza con el valor formateado.
  useLayoutEffect(() => {
    if (caretRef.current != null && ref.current) {
      const pos = caretRef.current;
      ref.current.setSelectionRange(pos, pos);
      caretRef.current = null;
    }
  }, [display]);

  // Dado cuántos dígitos hay antes del cursor, devuelve el índice en el string formateado.
  const caretFromDigitCount = (formatted: string, digitCount: number): number => {
    let count = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (count >= digitCount) {
        // Si caemos justo sobre un guion, saltarlo para no dejar el cursor "antes" del guion.
        return formatted[i] === "-" ? i + 1 : i;
      }
      if (/\d/.test(formatted[i])) count++;
    }
    return formatted.length;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const raw = el.value;
    const selStart = el.selectionStart ?? raw.length;
    const digitsBefore = raw.slice(0, selStart).replace(/\D/g, "").length;
    const clean = cleanCuit(raw);
    const formatted = formatCuit(clean);
    const pos = caretFromDigitCount(formatted, digitsBefore);

    if (formatError) setFormatError(false);

    if (clean !== value) {
      caretRef.current = pos; // se restaura en el useLayoutEffect tras el re-render
      onChange(clean);
    } else {
      // El estado no cambia (se tipeó un caracter no numérico): forzamos el DOM
      // para bloquearlo, ya que sin cambio de estado React no reconcilia.
      el.value = formatted;
      el.setSelectionRange(pos, pos);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Backspace") return;
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start !== end || start === 0) return; // con selección o al inicio: comportamiento normal
    // Si el caracter a borrar es un guion, borramos el dígito anterior (no el guion).
    if (el.value[start - 1] === "-") {
      e.preventDefault();
      const clean = cleanCuit(el.value);
      const digitsBeforeSep = el.value.slice(0, start - 1).replace(/\D/g, "").length;
      if (digitsBeforeSep === 0) return;
      const newClean = clean.slice(0, digitsBeforeSep - 1) + clean.slice(digitsBeforeSep);
      const formatted = formatCuit(newClean);
      caretRef.current = caretFromDigitCount(formatted, digitsBeforeSep - 1);
      onChange(newClean);
    }
  };

  const handleBlur = () => {
    const valid = isValidCuit(value);
    setFormatError(value.length > 0 && !valid);
    onValidityChange?.(valid);
  };

  const showError = invalid || formatError;

  return (
    <div>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={display}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`${className}${showError ? " !border-red-500 ring-2 ring-red-500/40" : ""}`}
      />
      {formatError && <p className="mt-2 text-xs text-red-400">El CUIT/CUIL no es válido. Revisá los 11 dígitos.</p>}
    </div>
  );
};
