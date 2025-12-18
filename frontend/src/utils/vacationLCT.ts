import { differenceInMonths, differenceInYears, differenceInDays } from "date-fns";

export const LCT_RULES = [
  { label: "Menos de 6 meses", days: "1 día cada 20 trabajados" },
  { label: "6 meses a 5 años", days: "14 días" },
  { label: "5 a 10 años", days: "21 días" },
  { label: "10 a 20 años", days: "28 días" },
  { label: "Más de 20 años", days: "35 días" },
];

/**
 * Calcula los días de vacaciones correspondientes por Ley de Contrato de Trabajo (LCT) Argentina.
 * @param hireDate Fecha de ingreso del empleado
 * @param targetDate Fecha de cálculo (por defecto: hoy o fin de año actual)
 * @returns Número de días de vacaciones correspondientes por ley
 */
export const calculateLCTVacationDays = (hireDate: Date | string, targetDate: Date = new Date()): number => {
  const entryDate = typeof hireDate === "string" ? new Date(hireDate) : hireDate;

  // Por defecto, la antigüedad se calcula al 31 de diciembre del año al que corresponden las vacaciones.
  // Si estamos calculando para el año en curso, usamos el 31 de diciembre de este año.
  // Sin embargo, para simplificar y cumplir con el prompt "comparando la hireDate contra la fecha actual o el cierre del año calendario",
  // usaremos el cierre del año actual para determinar la antigüedad computada.
  const currentYear = targetDate.getFullYear();
  const calculationDate = new Date(currentYear, 11, 31); // 31 de Diciembre

  const yearsOfService = differenceInYears(calculationDate, entryDate);
  const monthsOfService = differenceInMonths(calculationDate, entryDate);

  if (monthsOfService < 6) {
    // Menos de 6 meses: 1 día por cada 20 días trabajados.
    // Aproximación: días de antigüedad / 20.
    const daysOfService = differenceInDays(calculationDate, entryDate);
    return Math.floor(daysOfService / 20);
  }

  if (yearsOfService < 5) {
    return 14;
  }

  if (yearsOfService >= 5 && yearsOfService < 10) {
    return 21;
  }

  if (yearsOfService >= 10 && yearsOfService < 20) {
    return 28;
  }

  if (yearsOfService >= 20) {
    return 35;
  }

  return 14; // Fallback default
};
