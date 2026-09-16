/*
  IMPORTES CON SEPARADOR DE MILES.

  Un <input type="number"> no admite separadores, y «753587,99» se lee mal: es fácil errarle a un cero.
  Este campo muestra el número a la argentina —punto de miles, coma decimal— y lo formatea mientras se
  escribe, pero lo que ENTREGA es el número limpio («753587.99»): el resto del formulario sigue
  haciendo las cuentas con eso, y es lo que se guarda.
*/
export const aImporteArgentino = (canonico: string): string => {
  if (!canonico) return "";
  const [entero, decimales] = canonico.split(".");
  const miles = (entero || "0").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimales !== undefined ? `${miles},${decimales}` : miles;
};
export const deImporteArgentino = (texto: string): string => {
  const limpio = texto.replace(/[^\d,]/g, "");
  if (!limpio) return "";
  const [entero, ...resto] = limpio.split(",");
  return limpio.includes(",") ? `${entero || "0"}.${resto.join("").slice(0, 2)}` : entero;
};
