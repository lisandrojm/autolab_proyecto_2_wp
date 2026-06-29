/**
 * Convierte un número a su representación en letras (mayúsculas), con centavos /100.
 * Portado de la lógica usada en el frontend (ProjectTeamPage) para mantener consistencia.
 */
export function numeroALetras(num: number): string {
  const Unidades = (n: number): string => {
    switch (n) {
      case 1: return "UN";
      case 2: return "DOS";
      case 3: return "TRES";
      case 4: return "CUATRO";
      case 5: return "CINCO";
      case 6: return "SEIS";
      case 7: return "SIETE";
      case 8: return "OCHO";
      case 9: return "NUEVE";
      default: return "";
    }
  };

  const Decenas = (n: number): string => {
    const unidad = n % 10;
    const decena = Math.floor(n / 10);
    switch (decena) {
      case 1:
        switch (unidad) {
          case 0: return "DIEZ";
          case 1: return "ONCE";
          case 2: return "DOCE";
          case 3: return "TRECE";
          case 4: return "CATORCE";
          case 5: return "QUINCE";
          default: return "DIECI" + Unidades(unidad);
        }
      case 2:
        if (unidad === 0) return "VEINTE";
        return "VEINTI" + Unidades(unidad);
      case 3: return "TREINTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 4: return "CUARENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 5: return "CINCUENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 6: return "SESENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 7: return "SETENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 8: return "OCHENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 9: return "NOVENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      default: return Unidades(n);
    }
  };

  const Centenas = (n: number): string => {
    const decenas = n % 100;
    const centenaDigito = Math.floor(n / 100);
    switch (centenaDigito) {
      case 1:
        if (decenas === 0) return "CIEN";
        return "CIENTO " + Decenas(decenas);
      case 2: return "DOSCIENTOS " + Decenas(decenas);
      case 3: return "TRESCIENTOS " + Decenas(decenas);
      case 4: return "CUATROCIENTOS " + Decenas(decenas);
      case 5: return "QUINIENTOS " + Decenas(decenas);
      case 6: return "SEISCIENTOS " + Decenas(decenas);
      case 7: return "SETECIENTOS " + Decenas(decenas);
      case 8: return "OCHOCIENTOS " + Decenas(decenas);
      case 9: return "NOVECIENTOS " + Decenas(decenas);
      default: return Decenas(n);
    }
  };

  const Seccion = (n: number, divisor: number, strSingular: string, strPlural: string): string => {
    const cientos = Math.floor(n / divisor);
    let letras = "";
    if (cientos > 0) {
      if (cientos > 1) letras = Centenas(cientos) + " " + strPlural;
      else letras = strSingular;
    }
    return letras;
  };

  const Miles = (n: number): string => {
    const divisor = 1000;
    const resto = n % divisor;
    let strMiles = Seccion(n, divisor, "MIL", "MIL");
    const strCentenas = Centenas(resto);
    if (strMiles === "") return strCentenas;
    if (strMiles === "UN MIL") strMiles = "MIL";
    if (strCentenas === "") return strMiles;
    return strMiles + " " + strCentenas;
  };

  const Millones = (n: number): string => {
    const divisor = 1000000;
    const resto = n % divisor;
    const strMillones = Seccion(n, divisor, "UN MILLÓN", "MILLONES");
    const strMiles = Miles(resto);
    if (strMillones === "") return strMiles;
    if (strMiles === "") return strMillones;
    return strMillones + " " + strMiles;
  };

  if (num == null || isNaN(num)) return "";
  const entero = Math.floor(num);
  const centavosVal = Math.round((num - entero) * 100);
  const centavosStr = centavosVal.toString().padStart(2, "0") + "/100";

  if (entero === 0) return "CERO " + centavosStr;
  return (Millones(entero) + " " + centavosStr).replace(/\s+/g, " ").trim();
}
