/**
 * Tests de la resolución automática de valoración por MARGEN (en porcentaje).
 *
 * Run with:
 *   npx tsx --test src/utils/valoracionAutomatica.test.ts
 *   – o –
 *   npm run test:valoracion
 *
 * Usa el runner de Node (node:test + node:assert), igual que el resto de los utils.
 *
 * Por qué existen: de esta función sale qué categorías se le ofrecen a un contrato, o sea cuánto
 * cobra alguien. Un borde mal resuelto —el porcentaje exacto del tope, un rango abierto, dos rangos
 * que se tocan— no falla: devuelve la valoración equivocada y el error aparece recién en el sueldo.
 */
export {};
