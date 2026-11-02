import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { avisoForzarAlta, libreDesdeTrasAlta, sumarDiasIso, venceAltaPresentada } from "./vigenciaAltaPresentada.js";
describe("vigencia de un alta presentada", () => {
    it("el ejemplo del pedido: alta del 01/12 forzada el 01/11 → libre desde el 02/12", () => {
        assert.equal(venceAltaPresentada("2026-12-01", "2026-11-01"), "2026-12-01");
        assert.equal(libreDesdeTrasAlta("2026-12-01", "2026-11-01"), "2026-12-02");
    });
    it("presentada después de su baja (atrasada): vigente hasta el día en que se presentó", () => {
        assert.equal(libreDesdeTrasAlta("2026-10-24", "2026-11-01"), "2026-11-02");
    });
    it("sin baja no se libera sola", () => {
        assert.equal(libreDesdeTrasAlta("", "2026-11-01"), "");
    });
    it("sumarDiasIso cruza meses y años", () => {
        assert.equal(sumarDiasIso("2026-12-31", 1), "2027-01-01");
        assert.equal(sumarDiasIso("2026-02-28", 1), "2026-03-01");
    });
});
describe("avisoForzarAlta", () => {
    const base = { nombre: "CINTHIA VARELA", empresa: "2030 S.R.L.", hoy: "2026-11-01" };
    it("dice que es inmediata, la fecha futura y hasta cuándo traba", () => {
        const a = avisoForzarAlta({ ...base, alta: { alta: "2026-12-01", baja: "2026-12-01" }, otras: [] });
        assert.equal(a.libreDesde, "2026-12-02");
        assert.match(a.parrafos[0], /YA en ARCA/);
        assert.match(a.parrafos.join(" "), /Su alta es el 01\/12\/2026/);
        assert.match(a.parrafos.join(" "), /hasta el 02\/12\/2026 a las 00:00/);
        assert.deepEqual(a.trabadas, []);
    });
    it("lista las otras altas pendientes que quedan trabadas (y salen atrasadas); las posteriores no", () => {
        const a = avisoForzarAlta({
            ...base,
            alta: { alta: "2026-12-01", baja: "2026-12-01" },
            otras: [
                { alta: "2026-11-15", baja: "2026-11-15", tipoContrato: "Jornada" },
                { alta: "2026-11-10", baja: "2026-11-10", tipoContrato: "Jornada" },
                { alta: "2026-12-05", baja: "2026-12-05" },
            ],
        });
        assert.deepEqual(a.trabadas.map((x) => x.alta), ["2026-11-10", "2026-11-15"]);
        assert.ok(a.trabadas.every((x) => x.atrasada));
        assert.match(a.parrafos.at(-1), /2 altas pendientes que quedan trabadas: 10\/11\/2026 \(Jornada\), 15\/11\/2026 \(Jornada\)/);
    });
    it("de hoy: no dice «su alta es el…»; por tiempo indeterminado traba todas", () => {
        const a = avisoForzarAlta({ ...base, alta: { alta: "2026-11-01", baja: "" }, otras: [{ alta: "2027-03-01", baja: "" }] });
        assert.equal(a.libreDesde, "");
        assert.doesNotMatch(a.parrafos.join(" "), /Su alta es el/);
        assert.match(a.parrafos.join(" "), /tiempo indeterminado/);
        assert.equal(a.trabadas.length, 1);
    });
});
