import { Types } from "mongoose";
import { Vacation } from "../../models/Vacation.js";
import { VacationConfig } from "../../models/VacationConfig.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { AntiguedadArca } from "../../models/AntiguedadArca.js";
import { Company } from "../../models/Company.js";
import { textoAntiguedad } from "../../compartido/antiguedadTexto.js";
import { hoyArgentina } from "../../utils/contratoVigencia.js";
import { contratosQueRigenDeLasPersonas } from "../../utils/contratosQueRigen.js";
export async function saldosDeVacaciones(tenantId, tenantObjectId, selectedYear, opciones = {}) {
    /*
      LOS USUARIOS, SIN SUS VÍNCULOS POBLADOS.
  
      Acá se traían los 1576 usuarios del tenant con `metadata.projects` POBLADO ENTERO —o sea con
      los 7462 contratos— y el `metadata` completo de cada uno: 10,8 MB. La consulta no terminaba
      dentro del request, así que la pantalla se quedaba con una lista vacía y decía «no se
      encontraron usuarios».
  
      De todo eso se usan tres cosas —cuántos días trabajó, con qué rol empresa y qué contrato rige—
      que se calculan más abajo con una sola consulta liviana, y `metadata.activo`, que es el único
      campo del `metadata` que la pantalla mira.
    */
    // Con `userIds` se calcula sólo para esas personas (el plan de vacaciones por proyecto pide su equipo).
    const filtroUsuarios = { tenantId, isSystem: { $ne: true } };
    if (opciones.userIds)
        filtroUsuarios._id = { $in: opciones.userIds.map((id) => new Types.ObjectId(String(id))) };
    const users = await User.find(filtroUsuarios)
        .select("firstName lastName email hireDate extraVacationDays carryOverVacationDays metadata.activo metadata.cuit metadata.roles_frame projectIds")
        .lean();
    /*
      LOS ROLES EMPRESA PROPIOS DE LA FICHA (`metadata.roles_frame`), POR NOMBRE.
  
      Son los que la tarjeta de Usuarios muestra como «Rol/es Empresa» y los que `externalInfo.rolFrames`
      suma en `routes/users.ts`. Quien no tiene proyecto ni contrato (un fotógrafo cargado sólo en la
      ficha) no tiene otro rol que éste, y la grilla decía «Sin rol empresa» aunque su tarjeta dijera
      FOTOGRAFO. Una sola consulta por los ids de todos, sólo el nombre.
    */
    const idsRolesPropios = new Set();
    for (const u of users)
        for (const id of u.metadata?.roles_frame || [])
            if (id)
                idsRolesPropios.add(String(id));
    const nombreDeRolPropio = new Map();
    if (idsRolesPropios.size) {
        const { RoleFrame } = await import("../../models/RoleFrame.js");
        const filas = await RoleFrame.find({ _id: { $in: Array.from(idsRolesPropios) } }).select("name").lean();
        for (const rf of filas)
            if (rf.name)
                nombreDeRolPropio.set(String(rf._id), rf.name);
    }
    const rolesPropiosDe = (u) => (u.metadata?.roles_frame || [])
        .map((id) => ({ id: String(id), nombre: nombreDeRolPropio.get(String(id)) || "" }))
        .filter((r) => r.nombre);
    /*
      LOS CONTRATOS, EN CUATRO CAMPOS POR CONTRATO.
  
      Las cuentas se siguen haciendo en JavaScript y con las mismas funciones que antes —la
      antigüedad decide días de licencia por ley, y eso no se reescribe en una agregación—. Lo que
      cambia es que en vez del contrato entero viajan las dos fechas que miden el período, la de
      carga (que desempata cuál rige) y los tres nombres que la pantalla muestra.
    */
    const idsUsuarios = users.map((u) => u._id);
    const vinculos = await UserProject.aggregate([
        { $match: { userId: { $in: idsUsuarios } } },
        {
            $project: {
                _id: 0,
                userId: 1,
                nombre_rol_frame: 1,
                rol_frame_id: 1,
                nombre_proyecto: 1,
                contracts: {
                    $map: {
                        input: { $ifNull: ["$contracts", []] },
                        as: "c",
                        in: {
                            fecha_alta_contrato: "$$c.fecha_alta_contrato",
                            fecha_baja_contrato: "$$c.fecha_baja_contrato",
                            nombre_rol_frame: "$$c.nombre_rol_frame",
                            // La empleadora del contrato: con ella se discriminan las vacaciones y la antigüedad por empresa.
                            empresaContratoId: "$$c.empresaContratoId",
                            nombre_empresa_contrato: "$$c.nombre_empresa_contrato",
                            nombre_contrato: "$$c.nombre_contrato",
                        },
                    },
                },
            },
        },
    ]);
    // El contrato que rige de cada persona, elegido adentro de Mongo: una fila chica por usuario.
    const contratoQueRigeDe = await contratosQueRigenDeLasPersonas(idsUsuarios, hoyArgentina(), ["nombre_contrato", "tipo_contrato"]);
    const vinculosPorUsuario = new Map();
    for (const v of vinculos) {
        const clave = String(v.userId);
        if (!vinculosPorUsuario.has(clave))
            vinculosPorUsuario.set(clave, []);
        vinculosPorUsuario.get(clave).push(v);
    }
    /**
     * EL ROL EMPRESA CON EL QUE FIGURA HOY.
     *
     * Misma regla que tenía la pantalla: el último contrato no vencido que declare uno y, si ninguno
     * lo declara, el del vínculo con el proyecto. Si tampoco hay vínculo que lo diga, los roles propios
     * de la ficha (todos, como los muestra la tarjeta de Usuarios). Van ÚLTIMOS y no sumados: la
     * columna dice con qué rol figura HOY, y eso lo fija el contrato cuando lo hay; la ficha es lo
     * declarado de la persona, que sólo alcanza cuando no hay nada contratado que lo diga.
     */
    const rolEmpresaDe = (misVinculos, rolesPropios) => {
        let rol = "Sin rol empresa";
        const ahora = Date.now();
        for (const v of misVinculos) {
            for (const c of v.contracts || []) {
                const baja = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
                if (baja)
                    baja.setHours(23, 59, 59, 999);
                if ((!baja || baja.getTime() >= ahora) && c.nombre_rol_frame)
                    rol = c.nombre_rol_frame;
            }
            if (rol === "Sin rol empresa" && v.nombre_rol_frame)
                rol = v.nombre_rol_frame;
        }
        if (rol === "Sin rol empresa" && rolesPropios.length)
            rol = rolesPropios.map((r) => r.nombre).join(", ");
        return rol;
    };
    // 2. Fetch all overrides for the selected year
    const { UserVacationBalance } = await import("../../models/UserVacationBalance.js");
    const overrides = await UserVacationBalance.find({ tenantId, year: selectedYear }).lean();
    const overridesMap = new Map(overrides.map((o) => [o.userId.toString(), o]));
    /*
      LAS VACACIONES QUE DESCUENTAN DE ESTE PERÍODO. Una vacación cuenta en el año de su `periodoSaldo`
      si lo tiene (las del plan de vacaciones por proyecto lo fijan: la temporada 2026/27 descuenta de
      2026 aunque el bloque caiga en enero) y, si no lo tiene, en el año en que empieza, como siempre.
    */
    const startOfYear = new Date(selectedYear, 0, 1);
    const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    const allVacations = await Vacation.find({
        tenantId,
        status: { $nin: ["rejected", "cancelled"] },
        $or: [{ periodoSaldo: selectedYear }, { periodoSaldo: null, startDate: { $gte: startOfYear, $lte: endOfYear } }],
    }).lean();
    // Map vacations by user
    const userVacationsMap = new Map();
    for (const v of allVacations) {
        const uIdStr = v.userId.toString();
        if (!userVacationsMap.has(uIdStr)) {
            userVacationsMap.set(uIdStr, []);
        }
        userVacationsMap.get(uIdStr).push(v);
    }
    // Get global vacation config for benefit days & carry over settings
    const globalConfig = await VacationConfig.findOne({ tenantId });
    const globalBenefitDays = globalConfig?.diasBeneficio || 0;
    const isArrastreEnabled = globalConfig?.permiteArrastre || false;
    /*
      LA ANTIGÜEDAD SEGÚN ARCA, CUANDO LA HAY.
  
      `AntiguedadArca` es la cuenta hecha sobre las relaciones laborales que ARCA tiene registradas
      de la persona con las empleadoras del tenant (Documentos → Antigüedad ARCA): los días de cada
      relación sumados, sin contar dos veces los que se solapan. Es el registro oficial, así que si la
      persona está ahí, esa cuenta reemplaza a la suma de contratos de WeProdu (que cuenta dos veces
      un día con dos contratos y no sabe nada de lo anterior a WeProdu). Se usa la fila GLOBAL (todas
      las empleadoras juntas). Quien no está en ARCA sigue como antes: contratos, o la fecha de ingreso.
      La respuesta dice de dónde salió cada antigüedad (`antiguedad.fuente`) para poder explicarlo.
    */
    const cuilDe = (u) => String(u.metadata?.cuit || "").replace(/\D/g, "");
    const isoDe = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
    const arcaPorCuil = new Map();
    {
        const cuils = users.map(cuilDe).filter((c) => c.length === 11);
        if (cuils.length) {
            const filas = await AntiguedadArca.find({ tenantId: tenantObjectId || tenantId, empleadoraCuit: null, cuil: { $in: cuils } })
                .select("cuil primeraAlta ultimaFecha diasTrabajados antiguedadDesdePrimeraAlta cantidadContratos empresas tieneRelacionAbierta calculadoEl")
                .lean();
            for (const f of filas)
                arcaPorCuil.set(f.cuil, f);
        }
    }
    /*
      POR EMPRESA (pedido del 17/10/2026). Cada persona puede haber trabajado para varias empleadoras,
      y la pantalla tiene que poder compararlas: una fila por (persona, empresa) con su antigüedad en
      ESA empresa, sus días por ley y las vacaciones que tomó estando contratada por ella.
       - La antigüedad por empresa sale de las filas por empleadora de `AntiguedadArca`; sin ARCA, de
         los contratos de WeProdu agrupados por su empleadora.
       - Una vacación es de la empresa del contrato que regía el día en que empezó (el contrato tiene
         `empresaContratoId`); si ningún contrato la cubre, queda «Sin empresa».
       - Los días extra, el beneficio y el arrastre son de la PERSONA, no de una empresa: van en la fila
         acumulada y no se reparten.
    */
    const empresasDoc = await Company.find({}).select("cuit razonSocial").lean();
    const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");
    const empresaPorCuit = new Map();
    const empresaPorId = new Map();
    for (const e of empresasDoc) {
        const item = { id: String(e._id), cuit: soloDigitos(e.cuit), nombre: String(e.razonSocial || "") };
        if (item.cuit.length === 11)
            empresaPorCuit.set(item.cuit, item);
        empresaPorId.set(item.id, item);
    }
    const arcaPorEmpresa = new Map();
    {
        const cuils = users.map(cuilDe).filter((c) => c.length === 11);
        if (cuils.length) {
            const filas = await AntiguedadArca.find({ tenantId: tenantObjectId || tenantId, empleadoraCuit: { $ne: null }, cuil: { $in: cuils } })
                .select("cuil empleadoraCuit diasTrabajados ultimaFecha tieneRelacionAbierta cantidadContratos")
                .lean();
            for (const f of filas) {
                if (!arcaPorEmpresa.has(f.cuil))
                    arcaPorEmpresa.set(f.cuil, []);
                arcaPorEmpresa.get(f.cuil).push(f);
            }
        }
    }
    /** Los días por ley (LCT) para `dias` trabajados, proyectados hasta `hasta` si la relación sigue. Misma regla que la fila acumulada. */
    const diasPorLeyDe = (dias, hasta) => {
        const now = new Date();
        let proyectados = dias;
        if (hasta && hasta > now)
            proyectados += Math.max(0, Math.ceil((hasta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const anios = proyectados / 365;
        if (anios < 0.5)
            return Math.floor(proyectados / 20) || 0;
        if (anios < 5)
            return 14;
        if (anios < 10)
            return 21;
        if (anios < 20)
            return 28;
        return 35;
    };
    const yearEndDeProyeccion = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    /** La empresa del contrato que cubría ese día, entre todos los contratos de la persona. */
    const empresaDelDia = (misVinculos, dia) => {
        const t = dia.getTime();
        let mejor = null;
        for (const v of misVinculos) {
            for (const ct of v.contracts || []) {
                if (!ct.fecha_alta_contrato || !ct.empresaContratoId)
                    continue;
                const alta = new Date(ct.fecha_alta_contrato).getTime();
                const baja = ct.fecha_baja_contrato ? new Date(ct.fecha_baja_contrato).setHours(23, 59, 59, 999) : Infinity;
                if (t < alta || t > baja)
                    continue;
                if (!mejor || alta > new Date(mejor.fecha_alta_contrato).getTime())
                    mejor = ct;
            }
        }
        if (!mejor)
            return null;
        return empresaPorId.get(String(mejor.empresaContratoId)) || { id: String(mejor.empresaContratoId), cuit: "", nombre: String(mejor.nombre_empresa_contrato || "Empresa") };
    };
    // Helper: calculate seniority text
    const { differenceInYears, differenceInMonths, differenceInDays } = await import("date-fns");
    const calculateSeniorityText = (hireDate, contractsDays = 0) => {
        if (contractsDays > 0) {
            const years = Math.floor(contractsDays / 365);
            const remainingAfterYears = contractsDays % 365;
            const months = Math.floor(remainingAfterYears / 30);
            const days = remainingAfterYears % 30;
            const parts = [];
            if (years > 0)
                parts.push(`${years} ${years === 1 ? "año" : "años"}`);
            if (months > 0)
                parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
            if (days > 0)
                parts.push(`${days} ${days === 1 ? "día" : "días"}`);
            return parts.length > 0 ? parts.join(", ") : "0 días";
        }
        if (!hireDate)
            return "—";
        const now = new Date();
        const years = differenceInYears(now, hireDate);
        const months = differenceInMonths(now, hireDate) % 12;
        const tempDate = new Date(hireDate);
        tempDate.setFullYear(tempDate.getFullYear() + years);
        tempDate.setMonth(tempDate.getMonth() + months);
        const days = differenceInDays(now, tempDate);
        const parts = [];
        if (years > 0)
            parts.push(`${years} ${years === 1 ? "año" : "años"}`);
        if (months > 0)
            parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
        if (days > 0)
            parts.push(`${days} ${days === 1 ? "día" : "días"}`);
        return parts.length > 0 ? parts.join(", ") : "0 días";
    };
    const responseData = [];
    for (const user of users) {
        const uIdStr = user._id.toString();
        // A. Calculate seniority days from contracts (if any)
        const misVinculos = vinculosPorUsuario.get(uIdStr) || [];
        let contractsDays = 0;
        {
            contractsDays = misVinculos.reduce((acc, p) => {
                if (!p || !p.contracts || !Array.isArray(p.contracts))
                    return acc;
                return (acc +
                    p.contracts.reduce((cAcc, c) => {
                        if (!c.fecha_alta_contrato)
                            return cAcc;
                        const start = new Date(c.fecha_alta_contrato);
                        const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
                        end.setHours(23, 59, 59, 999);
                        const diffTime = end.getTime() - start.getTime();
                        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return cAcc + Math.max(0, days);
                    }, 0));
            }, 0);
        }
        // Si ARCA tiene a la persona, manda su cuenta (ver arriba). Lo de WeProdu viaja aparte, para compararlo.
        const arca = arcaPorCuil.get(cuilDe(user)) || null;
        const diasDeContratosWeProdu = contractsDays;
        if (arca)
            contractsDays = arca.diasTrabajados;
        const fuenteAntiguedad = arca ? "arca" : contractsDays > 0 ? "contratos" : user.hireDate ? "ingreso" : "ninguna";
        // B. Seniority Text (relative to today)
        const seniorityText = calculateSeniorityText(user.hireDate, contractsDays);
        // C. LCT days based on seniority at Dec 31 of selectedYear
        /*
          HASTA CUÁNDO SE PROYECTA. Los días por ley se fijan con la antigüedad al 31/12 del período, así
          que a lo trabajado hasta hoy se le suma lo que falta. Sin ARCA, la única pista es si la persona
          está activa: se supone que sigue hasta fin de año (y a una jornada de un día que ya terminó le
          regalaba 80 días y 4 de vacaciones). Con ARCA se sabe: si tiene una relación abierta se proyecta
          hasta el 31/12; si su última relación termina después de hoy, hasta ese fin (o el 31/12, lo que
          llegue primero); si ya terminó, no se proyecta nada.
        */
        let projectedTotalDays = contractsDays;
        let proyectadoHasta = null;
        {
            const now = new Date();
            const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
            let hasta = null;
            if (arca) {
                if (arca.tieneRelacionAbierta)
                    hasta = yearEnd;
                else if (arca.ultimaFecha && new Date(arca.ultimaFecha) > now)
                    hasta = new Date(Math.min(new Date(arca.ultimaFecha).getTime(), yearEnd.getTime()));
            }
            else if (contractsDays > 0 && user.metadata?.activo !== false) {
                hasta = yearEnd;
            }
            if (hasta && hasta > now) {
                projectedTotalDays += Math.max(0, Math.ceil((hasta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                proyectadoHasta = hasta.toISOString().slice(0, 10);
            }
        }
        let seniorityYears = projectedTotalDays / 365;
        if (contractsDays === 0 && user.hireDate) {
            seniorityYears = differenceInYears(new Date(selectedYear, 11, 31), new Date(user.hireDate));
        }
        let lawDays = 0;
        if (seniorityYears < 0.5) {
            // Less than 6 months: 1 day per 20 worked (approx)
            lawDays = Math.floor(projectedTotalDays / 20) || 0;
        }
        else if (seniorityYears < 5) {
            lawDays = 14;
        }
        else if (seniorityYears < 10) {
            lawDays = 21;
        }
        else if (seniorityYears < 20) {
            lawDays = 28;
        }
        else {
            lawDays = 35;
        }
        // D. Total Dynamic allowed days
        const extraDays = user.extraVacationDays || 0;
        const carryOverDays = user.carryOverVacationDays || 0;
        const calculatedTotalAnnual = lawDays + extraDays + globalBenefitDays + (isArrastreEnabled ? carryOverDays : 0);
        // E. Taken / Pending from vacations list
        let calculatedTaken = 0;
        let calculatedPending = 0;
        const userVacations = userVacationsMap.get(uIdStr) || [];
        for (const v of userVacations) {
            const isSigned = v.signatureStatus === "signed";
            const isDelivered = v.status === "delivered";
            if (isDelivered || isSigned || (v.status === "approved" && !v.requiresSignature)) {
                calculatedTaken += v.daysRequested;
            }
            else {
                calculatedPending += v.daysRequested;
            }
        }
        const calculatedAvailable = Math.max(0, calculatedTotalAnnual - calculatedTaken - calculatedPending);
        const porEmpresa = [];
        /** Los contratos de WeProdu de la persona con esa empleadora (por id de empresa), para el detalle. */
        const contratosDeEmpresa = (empresaId) => {
            const out = [];
            for (const v of misVinculos)
                for (const ct of v.contracts || [])
                    if (String(ct.empresaContratoId || "") === empresaId)
                        out.push({ tipo: String(ct.nombre_contrato || ""), alta: ct.fecha_alta_contrato ? new Date(ct.fecha_alta_contrato).toISOString().slice(0, 10) : "", baja: ct.fecha_baja_contrato ? new Date(ct.fecha_baja_contrato).toISOString().slice(0, 10) : "", proyecto: String(v.nombre_proyecto || "") });
            return out.sort((a, b) => b.alta.localeCompare(a.alta));
        };
        {
            const vacPorClave = new Map();
            for (const v of userVacations) {
                const emp = empresaDelDia(misVinculos, new Date(v.startDate));
                const clave = emp ? emp.cuit || emp.id : "";
                const acc = vacPorClave.get(clave) || { taken: 0, pending: 0 };
                const tomada = v.status === "delivered" || v.signatureStatus === "signed" || (v.status === "approved" && !v.requiresSignature);
                if (tomada)
                    acc.taken += v.daysRequested;
                else
                    acc.pending += v.daysRequested;
                vacPorClave.set(clave, acc);
            }
            const filasArca = arcaPorEmpresa.get(cuilDe(user)) || [];
            if (filasArca.length > 0) {
                for (const f of filasArca) {
                    const emp = empresaPorCuit.get(f.empleadoraCuit);
                    const hasta = f.tieneRelacionAbierta ? yearEndDeProyeccion : f.ultimaFecha && new Date(f.ultimaFecha) > new Date() ? new Date(Math.min(new Date(f.ultimaFecha).getTime(), yearEndDeProyeccion.getTime())) : null;
                    const ley = diasPorLeyDe(f.diasTrabajados, hasta);
                    const vac = vacPorClave.get(f.empleadoraCuit) || vacPorClave.get(emp?.id || "") || { taken: 0, pending: 0 };
                    porEmpresa.push({ cuit: f.empleadoraCuit, nombre: emp?.nombre || f.empleadoraCuit, fuente: "arca", dias: f.diasTrabajados, texto: textoAntiguedad(f.diasTrabajados), tieneRelacionAbierta: !!f.tieneRelacionAbierta, totalAnnual: ley, taken: vac.taken, pending: vac.pending, available: Math.max(0, ley - vac.taken - vac.pending), contratos: emp ? contratosDeEmpresa(emp.id) : [] });
                }
            }
            else {
                // Sin ARCA: los contratos de WeProdu, agrupados por su empleadora (días sumados, como la fila acumulada).
                const porId = new Map();
                for (const v of misVinculos) {
                    for (const ct of v.contracts || []) {
                        if (!ct.fecha_alta_contrato || !ct.empresaContratoId)
                            continue;
                        const id = String(ct.empresaContratoId);
                        const start = new Date(ct.fecha_alta_contrato);
                        const end = ct.fecha_baja_contrato ? new Date(ct.fecha_baja_contrato) : new Date();
                        end.setHours(23, 59, 59, 999);
                        const dias = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                        const acc = porId.get(id) || { nombre: empresaPorId.get(id)?.nombre || String(ct.nombre_empresa_contrato || "Empresa"), dias: 0, abierta: false };
                        acc.dias += dias;
                        if (!ct.fecha_baja_contrato)
                            acc.abierta = true;
                        porId.set(id, acc);
                    }
                }
                for (const [id, e] of porId) {
                    const emp = empresaPorId.get(id);
                    const ley = diasPorLeyDe(e.dias, e.abierta && user.metadata?.activo !== false ? yearEndDeProyeccion : null);
                    const vac = vacPorClave.get(emp?.cuit || id) || vacPorClave.get(id) || { taken: 0, pending: 0 };
                    porEmpresa.push({ cuit: emp?.cuit || "", nombre: e.nombre, fuente: "contratos", dias: e.dias, texto: textoAntiguedad(e.dias), tieneRelacionAbierta: e.abierta, totalAnnual: ley, taken: vac.taken, pending: vac.pending, available: Math.max(0, ley - vac.taken - vac.pending), contratos: contratosDeEmpresa(id) });
                }
            }
            // Vacaciones que ningún contrato cubre: se ven igual, como «Sin empresa», para que la suma cierre.
            const sueltas = vacPorClave.get("");
            if (sueltas && (sueltas.taken > 0 || sueltas.pending > 0))
                porEmpresa.push({ cuit: "", nombre: "Sin empresa", fuente: "contratos", dias: 0, texto: "—", tieneRelacionAbierta: false, totalAnnual: 0, taken: sueltas.taken, pending: sueltas.pending, available: 0 });
            porEmpresa.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        }
        const empresas = porEmpresa.filter((e) => e.nombre !== "Sin empresa").map((e) => e.nombre);
        // F. Fetch overrides
        const override = overridesMap.get(uIdStr);
        const displayTotalAnnual = override?.totalAnnual ?? calculatedTotalAnnual;
        const displayTaken = override?.taken ?? calculatedTaken;
        const displayPending = override?.pending ?? calculatedPending;
        const displayAvailable = override?.available ?? Math.max(0, displayTotalAnnual - displayTaken - displayPending);
        responseData.push({
            userId: uIdStr,
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            email: user.email,
            hireDate: user.hireDate ? user.hireDate.toISOString().split("T")[0] : null,
            cuil: cuilDe(user),
            seniority: seniorityText,
            // Las empleadoras para las que trabajó («FZERO S.R.L | GRINI S.R.L.») y la cuenta por cada una (pestaña «Por empresa»).
            empresas,
            porEmpresa,
            // De dónde salió la antigüedad y cómo se llegó a los días por ley: es lo que explica el modal de la grilla.
            antiguedad: {
                fuente: fuenteAntiguedad,
                dias: contractsDays,
                diasWeProdu: diasDeContratosWeProdu,
                diasProyectadosAl31: Math.round(projectedTotalDays),
                /** Hasta qué día se supuso que sigue trabajando (null = no se proyectó: la relación ya terminó). */
                proyectadoHasta,
                aniosAl31: Math.round(seniorityYears * 100) / 100,
                diasLey: lawDays,
                arca: arca
                    ? {
                        primeraAlta: isoDe(arca.primeraAlta),
                        ultimaFecha: isoDe(arca.ultimaFecha),
                        diasTrabajados: arca.diasTrabajados,
                        antiguedadDesdePrimeraAlta: arca.antiguedadDesdePrimeraAlta,
                        cantidadContratos: arca.cantidadContratos,
                        empresas: arca.empresas || [],
                        tieneRelacionAbierta: !!arca.tieneRelacionAbierta,
                        calculadoEl: arca.calculadoEl,
                    }
                    : null,
            },
            // Días extra: beneficio de la compañía por encima de los que fija la LCT. Ya está sumado en
            // `calculated.totalAnnual`, pero se devuelve aparte para poder verlo y editarlo en la grilla.
            extraVacationDays: extraDays,
            calculated: {
                totalAnnual: calculatedTotalAnnual,
                taken: calculatedTaken,
                pending: calculatedPending,
                available: calculatedAvailable,
            },
            override: override
                ? {
                    totalAnnual: override.totalAnnual,
                    taken: override.taken,
                    pending: override.pending,
                    available: override.available,
                }
                : undefined,
            display: {
                totalAnnual: displayTotalAnnual,
                taken: displayTaken,
                pending: displayPending,
                available: displayAvailable,
            },
            // Meta field for filters in frontend
            projectIds: user.projectIds?.map((p) => (p._id || p).toString()) || [],
            metadata: user.metadata,
            /*
              LO QUE LA PANTALLA SACABA DE LOS VÍNCULOS, YA RESUELTO.
      
              Antes recorría `metadata.projects` con todos los contratos adentro para sacar estas tres
              cosas. Se calculan acá, con las mismas funciones, y viajan como tres campos.
            */
            rolEmpresa: rolEmpresaDe(misVinculos, rolesPropiosDe(user)),
            contratoQueRige: contratoQueRigeDe.get(uIdStr) || null,
            // Para el filtro por rol empresa, que mira el vínculo y no el contrato. Suma los roles propios
            // de la ficha, como el filtro `rolFrame` de `routes/users.ts`: si no, filtrar por FOTOGRAFO
            // escondería a quien la columna muestra como FOTOGRAFO. Su id es el `_id` del RoleFrame (no
            // `null`), para que no empate por `==` con un rol sin `externalId`.
            rolesFrame: [
                ...misVinculos.map((v) => ({ rol_frame_id: v.rol_frame_id ?? null, nombre_rol_frame: v.nombre_rol_frame || "" })),
                ...rolesPropiosDe(user).map((r) => ({ rol_frame_id: r.id, nombre_rol_frame: r.nombre })),
            ],
        });
    }
    return responseData;
}
