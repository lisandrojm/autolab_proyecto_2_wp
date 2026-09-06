import mongoose from 'mongoose';
import { Convenio } from '../models/Convenio.js';
import { authenticateToken } from '../middleware/auth.js';
import { createSimpleCatalogRouter } from './_simpleCatalogRouter.js';
/**
 * Catálogo de Convenios de Trabajo (CCT).
 *
 * Los encabezados de la plantilla y del import coinciden con los de la tabla informativa de AFIP
 * (Código / Actividad / Signatario), así que el XLSX que genera
 * `src/scripts/convenios/conveniosToXlsx.ts` se importa sin tocar nada.
 */
const router = createSimpleCatalogRouter(Convenio, {
    entityLabel: 'Convenio',
    sheetName: 'Convenios',
    templateFilename: 'plantilla_convenios.xlsx',
    sampleNames: ['EMPLEADOS DE COMERCIO', 'MECÁNICOS Y AFINES DEL TRANSPORTE'],
    externalIdExcelHeader: 'Código',
    externalIdExcelAliases: ['Codigo', 'CCT', 'Código CCT', 'codigo'],
    nombreExcelHeader: 'Actividad',
    nombreExcelAliases: ['actividad', 'Descripción Actividad', 'DESCRIPCIÓN ACTIVIDAD'],
    extraStringFields: [{ key: 'signatario', excelHeader: 'Signatario', aliases: ['signatario', 'Descripción Signatario', 'DESCRIPCIÓN SIGNATARIO'] }],
    // La obra social del convenio NO viene en el nomenclador de ARCA: es un dato propio, que se carga a
    // mano. Por eso va como campo numérico extra y no participa del import.
    extraNumberFields: [{ key: 'obraSocialDefaultId' }],
    // El sindicato firmante. Como la obra social, es un dato propio y no viene del nomenclador.
    extraRefFields: [{ key: 'sindicatoId' }],
    // Poblado en el listado: la tabla muestra la sigla de cada uno de los 2.669, y resolverlas desde
    // el front sería un pedido por fila.
    populate: [{ path: 'sindicatoId', select: '_id name sigla' }],
    filtrosPermitidos: ['sindicatoId'],
    // El código CCT es "NNNN/AA": conserva la barra y los ceros a la izquierda, así que solo se
    // limpian espacios. Sacarle los no-dígitos (como en el RNOS) perdería el año del convenio.
    sanitizeExternalId: (v) => v.trim(),
});
/**
 * Asignar sindicatos en tanda.
 *
 * Endpoint propio y NO el `/bulk` genérico: el bulk es un upsert por `externalId`, así que un código
 * que no matchea CREA el registro en vez de fallar, y exige remandar el nombre. Acá solo se puede
 * hacer una cosa —`$set` del sindicato sobre `_id` que ya existen—, sin upsert y sin tocar ningún
 * otro campo.
 *
 * El `externalId` NO sirve para direccionar: no es único. Conviven "0131/75" (SATSAID) y
 * "0131/75 E" (convenio de empresa) como documentos distintos, así que cualquier búsqueda por código
 * tiene que ser exacta sobre el string completo. Por eso acá se direcciona por `_id` y nada más.
 */
router.post('/asignar-sindicatos', authenticateToken, async (req, res) => {
    try {
        const { asignaciones } = req.body;
        if (!Array.isArray(asignaciones) || asignaciones.length === 0) {
            res.status(400).json({ error: 'Se espera { asignaciones: [{ convenioId, sindicatoId }] }' });
            return;
        }
        if (asignaciones.length > 2000) {
            res.status(400).json({ error: `Demasiadas asignaciones (${asignaciones.length}). Partilo en tandas de hasta 2.000.` });
            return;
        }
        const errores = [];
        const ops = asignaciones.map((a, i) => {
            const convenioId = String(a.convenioId || '').trim();
            if (!mongoose.Types.ObjectId.isValid(convenioId)) {
                errores.push(`Asignación ${i + 1}: convenioId "${convenioId}" no es un id válido.`);
                return null;
            }
            // `null` explícito = desvincular (9999/99 y los 2.664 sin gremio conocido). Un id mal formado
            // se rechaza en vez de guardarse: una ref rota se ve igual que "sin gremio" en la pantalla, y
            // son cosas distintas.
            const raw = a.sindicatoId === undefined || a.sindicatoId === null ? '' : String(a.sindicatoId).trim();
            if (raw !== '' && !mongoose.Types.ObjectId.isValid(raw)) {
                errores.push(`Asignación ${i + 1}: sindicatoId "${raw}" no es un id válido.`);
                return null;
            }
            return {
                updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(convenioId) },
                    update: { $set: { sindicatoId: raw === '' ? null : new mongoose.Types.ObjectId(raw) } },
                    // Sin upsert: si el convenio no existe, no se hace nada. No se crea.
                },
            };
        });
        if (errores.length > 0) {
            res.status(400).json({ error: 'Errores de validación', details: errores.slice(0, 20) });
            return;
        }
        const result = await Convenio.bulkWrite(ops.filter(Boolean));
        res.json({
            message: 'Asignaciones aplicadas',
            // Los tres números por separado: `encontrados` menor que `enviadas` significa ids que ya no
            // existen —la tanda se armó contra una lista vieja—, y `actualizados` menor que `encontrados`
            // significa que ya estaban así. Un solo total escondería las dos cosas.
            enviadas: asignaciones.length,
            encontrados: result.matchedCount || 0,
            actualizados: result.modifiedCount || 0,
        });
    }
    catch (error) {
        console.error('Asignar sindicatos error:', error);
        res.status(500).json({ error: 'Error interno al asignar los sindicatos' });
    }
});
export { router as convenioRoutes };
