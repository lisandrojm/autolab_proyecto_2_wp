import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agruparBloques, bloquesDelTxt, decodificarTxt, leerBloque, leerTxtDeRecibos } from "./reciboTxtMemosoft.js";
// Un recibo real del TXT de MEMOSOFT (septiembre 2026), sin las líneas en blanco.
const ORIGINAL = `                                                        ORIGINAL                APELLIDO Y NOMBRES
                                                                                                                     LEGAJO
       2030 S.R.L.                                                 STOLTZING, Micaela Sol                       00070
                                                                       C.U.I.L.         BASICO          INGRESO       ANTIGUEDAD
                                                                    27-40073687-7       1123646.21 01/11/2021           5 años
       RUIZ HUIDOBRO 4365 -   - CABA - CAPITAL FEDERAL                       SECTOR                  MOD. DE CONTRATACION
       C.U.I.T. : 30-71706837-4                                   Productora                   A Tiempo completo indeterminado /Tr
                    DEPOSITO APORTES JUBILATORIOS                            CATEGORIA                         TAREA
           PERIODO     F.DEPOSITO      BANCO DEPOSITO              Grupo 3                          Coordinador-G3
       08/2026         10/09/2026  GALICIA                               PERIODO LIQUIDADO                  SEPTIEMBRE 2026
                                                                               COSTO TOTAL EMPLEADOR                 3.409.292,73
        CODIGO               CONCEPTO                                      UNIDAD                 BASE               MONTO
                                                             CONTRIBUCIONES EMPRESA
       1101        Previsional       Contribución                                                                      286.619,41
       1102        INNSJP            Contribución                                                                       42.314,29
       1103        Asig.Familiares   Contribución                                                                      125.079,96
       1104        Fondo Nac.Empleo  Contribución                                                                       25.015,99
       1122        Seguro Vida Oblig.Contribución                                                                          424,62
       1131        Obra Social       Contribución                                                                      136.082,25
       1140        ANSSAL            Contribución                                                                       24.014,52
       1152        Ley Riesgo Trab.  Contribución                                                                       74.779,03
                                                             OTROS CONCEPTOS EMPRESA
       1110        ART 193           Contribución                                                                       26.682,80
                                                                SUBTOTAL CONTRIBUCIONES EMPLEADOR                      741.012,87
                                                                                       SUELDO BRUTO                  2.668.279,86
        CODIGO               CONCEPTO                                      UNIDAD                 BASE               MONTO
                                                                  REMUNERATIVO
       0001        Sueldo Básico                                                  30,00                              1.123.646,21
       0002        Adicional SATTSAID                                                                                  426.985,56
       0003        Antiguedad                                                      5,00                                 56.182,30
       0005        Presentismo                                                                                         155.063,18
       0007        Adicional C                                                                                         906.402,25
                                                                   DESCUENTOS
       1001        Jubilación 11%                                                                                     -293.510,75
       1002        Ley 19.032 3 %                                                                                      -80.048,39
       1003        Obra Social 3%                                                                                      -80.048,39
       1011        Cuota Sindical 3%                                                                                   -80.048,39
       1015        ART 215                                                                                             -20.205,94
                                                                      OTROS
       0099        Adelanto de Sueldos                                                                                -250.000,00
       3100        Redondeo                                                                                                  0,36
           REMUNERATIVO       NO REMUNERATIVO        DESCUENTOS          SUELDO NETO             OTROS            NETO A COBRAR
              2.668.279,50                               -553.861,86         2.114.417,64         -249.999,64        1.864.418,00
                               Detalle de la Composición Salarial
       Total Costo Sindical           126.937,13 Total Costo INSSJP             122.362,68
                Empleador              26.682,80           Empleador             42.314,29
                Trabajador            100.254,33           Trabajador            80.048,39
       Total Seguridad Social         730.226,11 Total Costo ART                 74.779,03
                Empleador             436.715,36           Empleador             74.779,03
                Trabajador            293.510,75
       Total Obra Social              240.145,16 Total Costo SCVO                   424,62
                Empleador             160.096,77           Empleador                424,62
                Trabajador             80.048,39
       Nota: Seguridad social del empleador incluye SIPA, Fondo Nacional de Empleo y Asignaciones Familiares
                                        FORMA DE PAGO                                     FECHA PAGO             TRANSPORTE
       Deposito en Caja de Ahorro Nº 00880220912022                                       30/09/2026
                                                                                                      ___________________________
       © Copyright MEMOSOFT     -    www.memosoft.com.ar            RECIBO Nº 00015                         Firma Empleado`;
const COPIA = `                                                          COPIA                 APELLIDO Y NOMBRES
                                                                                                                     LEGAJO
       2030 S.R.L.                                                 STOLTZING, Micaela Sol                       00070`;
// La fila de totales de un recibo con NO REMUNERATIVO.
const TOTALES_CON_NO_REM = `                                                                 NO REMUNERATIVO
           REMUNERATIVO       NO REMUNERATIVO        DESCUENTOS          SUELDO NETO             OTROS            NETO A COBRAR
                527.374,56            72.404,71          -121.032,64           478.746,63                0,37          478.747,00`;
describe("TXT de recibos de MEMOSOFT", () => {
    it("lee la caja de datos, los totales y el pago del ORIGINAL", () => {
        const d = leerBloque(ORIGINAL);
        assert.equal(d.cuil, "27400736877");
        assert.equal(d.empleadorCuit, "30717068374");
        assert.equal(d.empresa, "2030 S.R.L.");
        assert.equal(d.nombre, "STOLTZING, Micaela Sol");
        assert.equal(d.legajo, "00070");
        assert.equal(d.basico, "1123646.21");
        assert.equal(d.ingreso, "01/11/2021");
        assert.equal(d.sector, "Productora");
        assert.equal(d.categoria, "Grupo 3");
        assert.equal(d.tarea, "Coordinador-G3");
        assert.equal(d.periodo, "2026-09");
        assert.equal(d.fechaDeposito, "10/09/2026");
        assert.equal(d.costoTotal, "3.409.292,73");
        assert.equal(d.sueldoBruto, "2.668.279,86");
        assert.equal(d.remunerativo, "2.668.279,50");
        assert.equal(d.noRemunerativo, "");
        assert.equal(d.descuentos, "-553.861,86");
        assert.equal(d.otros, "-249.999,64");
        assert.equal(d.neto, "1.864.418,00");
        assert.equal(d.fechaPago, "30/09/2026");
        assert.equal(d.numeroRecibo, "00015");
    });
    it("los conceptos con su sección y su unidad", () => {
        const c = leerBloque(ORIGINAL).conceptos;
        assert.deepEqual(c.find((x) => x.codigo === "0001"), { codigo: "0001", concepto: "Sueldo Básico", unidad: "30,00", monto: "1.123.646,21", seccion: "REMUNERATIVO" });
        assert.equal(c.find((x) => x.codigo === "1002")?.monto, "-80.048,39");
        assert.equal(c.find((x) => x.codigo === "0099")?.seccion, "OTROS");
    });
    it("la fila de totales ubica cada importe en su columna aunque falte uno", () => {
        const d = leerBloque(`ORIGINAL                APELLIDO Y NOMBRES\n${TOTALES_CON_NO_REM}`);
        assert.equal(d.remunerativo, "527.374,56");
        assert.equal(d.noRemunerativo, "72.404,71");
        assert.equal(d.neto, "478.747,00");
    });
    it("ORIGINAL abre un recibo y la COPIA se le suma: una hoja por página del PDF", () => {
        const txt = [ORIGINAL, COPIA, ORIGINAL, COPIA].join("\n");
        assert.equal(bloquesDelTxt(txt).length, 4);
        assert.deepEqual(agruparBloques(bloquesDelTxt(txt)), [[0, 1], [2, 3]]);
        assert.equal(leerTxtDeRecibos(txt).recibos[1].datos.legajo, "00070");
    });
    it("decodifica Latin-1", () => {
        assert.equal(decodificarTxt(Buffer.from("Martín 5 años", "latin1")), "Martín 5 años");
    });
});
