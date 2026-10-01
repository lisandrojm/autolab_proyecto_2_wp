/**
 * Una plantilla para varios tipos de contrato (`contratoIds`).
 * Run: npx tsx --test src/utils/plantillaVariosContratos.test.ts
 */
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { contratosDePlantilla, plantillaEsDeContrato } from '../api/contratosFrame.js';
import { tipoImpositivoDeContrato } from './tramiteImpositivo.js';

const compartida: any = { _id: 'pf', name: 'Plazo fijo', contratoId: { _id: 'c5x7', name: '5x7' }, contratoIds: ['c5x7', 'c6x6'] };
const vieja: any = { _id: 'pv', name: 'Servicios', contratoId: 'cServ' };

it('los tipos de una plantilla: la lista, o el único de las de antes', () => {
  assert.deepEqual(contratosDePlantilla(compartida), ['c5x7', 'c6x6']);
  assert.deepEqual(contratosDePlantilla(vieja), ['cServ']);
  assert.equal(plantillaEsDeContrato(compartida, 'c6x6'), true);
  assert.equal(plantillaEsDeContrato(compartida, { _id: 'c5x7' }), true);
  assert.equal(plantillaEsDeContrato(compartida, 'cServ'), false);
  assert.equal(plantillaEsDeContrato(vieja, ''), false);
});

it('el trámite de cada tipo sale de la plantilla que comparten', () => {
  const estados: any[] = [{ _id: 'e1', name: 'Pedido de ARCA', data: { esImpositivo: true, tipoImpositivo: 'alta_temprana_afip', contratoFrameIds: ['pf'] } }];
  assert.equal(tipoImpositivoDeContrato('c5x7', [compartida, vieja], estados), 'alta_temprana_afip');
  assert.equal(tipoImpositivoDeContrato('c6x6', [compartida, vieja], estados), 'alta_temprana_afip');
  assert.equal(tipoImpositivoDeContrato('cServ', [compartida, vieja], estados), null);
});
