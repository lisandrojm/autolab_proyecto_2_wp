import { useEffect, useState } from "react";
import { mascaraHora, normalizarHora } from "../../utils/horario";

/**
 * HORA DE ENTRADA / SALIDA: se elige de la lista (`HORAS_DEL_DIA`, de a una hora) o se escribe.
 *
 * Formatea mientras se tipea y completa al salir del campo («8» → 08:00). Una hora que no existe queda
 * marcada y no se guarda. Las clases van por props: la app y el panel se ven distinto.
 */
export function CampoHora({ valor, onCambio, placeholder, listId, className, classNameInvalida }: { valor: string; onCambio: (hora: string) => void; placeholder: string; listId: string; className: string; classNameInvalida?: string }) {
  const [texto, setTexto] = useState(valor);
  const [invalida, setInvalida] = useState(false);
  useEffect(() => {
    setTexto(valor);
    setInvalida(false);
  }, [valor]);
  const confirmar = (t: string) => {
    const hora = normalizarHora(t);
    if (hora === null) {
      setInvalida(true);
      return;
    }
    setInvalida(false);
    setTexto(hora);
    if (hora !== valor) onCambio(hora);
  };
  return (
    <>
      <input
        type="text"
        list={listId}
        inputMode="numeric"
        maxLength={5}
        value={texto}
        placeholder={placeholder}
        onChange={(e) => {
          const formateada = mascaraHora(e.target.value, texto);
          setTexto(formateada);
          // Elegida de la lista (o tipeada completa) llega entera: se toma en el acto, sin esperar a salir.
          if (/^\d{2}:\d{2}$/.test(formateada)) confirmar(formateada);
        }}
        onBlur={() => confirmar(texto)}
        aria-invalid={invalida}
        className={`${className} ${invalida ? classNameInvalida || "border-red-400 dark:border-red-700" : ""}`}
      />
      {invalida && <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">Hora inválida: usá HH:MM, por ejemplo 08:00.</p>}
    </>
  );
}
