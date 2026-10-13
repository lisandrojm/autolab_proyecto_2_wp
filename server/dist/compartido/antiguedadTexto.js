/**
 * LA ANTIGÜEDAD EN PALABRAS, igual en todas las pantallas: «9 años, 11 meses, 18 días».
 *
 * Años de 365 días y meses de 30, como venía escrito en Vacaciones, la ficha de usuario y el perfil
 * de la app: cada una tenía su copia. Una sola acá para que las tres digan lo mismo del mismo número.
 */
export function textoAntiguedad(dias) {
    const d = Math.max(0, Math.floor(Number(dias) || 0));
    const anios = Math.floor(d / 365);
    const resto = d % 365;
    const meses = Math.floor(resto / 30);
    const sueltos = resto % 30;
    const partes = [];
    if (anios > 0)
        partes.push(`${anios} ${anios === 1 ? "año" : "años"}`);
    if (meses > 0)
        partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
    if (sueltos > 0)
        partes.push(`${sueltos} ${sueltos === 1 ? "día" : "días"}`);
    return partes.length > 0 ? partes.join(", ") : "0 días";
}
