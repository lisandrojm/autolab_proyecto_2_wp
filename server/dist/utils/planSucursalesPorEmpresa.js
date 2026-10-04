import { codigoActividad, codigoSucursal } from "../compartido/sucursalesDeEmpresa.js";
const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");
/** Texto de un domicilio para comparar por igualdad exacta: mayúsculas, sin acentos, un solo espacio. */
export const normalizarDomicilio = (v) => String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
const actividadesIguales = (a, b) => a.length === b.length && a.every((x, i) => codigoActividad(x.codigo) === codigoActividad(b[i].codigo) && String(x.descripcion || "") === String(b[i].descripcion || ""));
export function planSucursalesPorEmpresa(o) {
    const nomenclador = new Set([...o.actividadesDelNomenclador].map(codigoActividad).filter(Boolean));
    const porDomicilio = new Map(o.catalogo.map((d) => [normalizarDomicilio(d.domicilio), d]));
    const domicilioDe = new Map(o.catalogo.map((d) => [String(d._id), d.domicilio]));
    const porCuit = new Map(o.empresas.map((e) => [soloDigitos(e.cuit), e]));
    const plan = { empresas: [], empresasFaltantes: [], domiciliosFaltantes: [], actividadesFaltantes: [] };
    for (const dato of o.datos) {
        const empresa = porCuit.get(soloDigitos(dato.cuit));
        if (!empresa) {
            plan.empresasFaltantes.push({ cuit: dato.cuit, razonSocial: dato.razonSocial });
            continue;
        }
        const cambios = [];
        const previas = new Map((empresa.sucursalActividades || []).map((f) => [String(f.sucursalId), f]));
        const idsPrevios = (empresa.sucursalIds || []).map(String);
        // Lo que ARCA tiene, resuelto contra el catálogo de domicilios.
        const deArca = [];
        for (const s of dato.sucursales) {
            const domicilio = porDomicilio.get(normalizarDomicilio(s.domicilio));
            if (!domicilio) {
                plan.domiciliosFaltantes.push({ cuit: dato.cuit, codigo: codigoSucursal(s.codigo), domicilio: s.domicilio });
                continue;
            }
            for (const a of s.actividades)
                if (!nomenclador.has(codigoActividad(a.codigo)))
                    plan.actividadesFaltantes.push({ cuit: dato.cuit, sucursal: `${codigoSucursal(s.codigo)} ${s.domicilio}`, codigo: codigoActividad(a.codigo), descripcion: a.descripcion });
            const previa = previas.get(String(domicilio._id));
            // Una actividad que la empresa ya tenía conserva su descripción (la del nomenclador con el que
            // se cargó): lo que manda es el CÓDIGO, y reescribir el texto sería un cambio que no cambia nada.
            const descripcionPrevia = new Map((previa?.actividades || []).map((a) => [codigoActividad(a.codigo), String(a.descripcion || "")]));
            const fila = {
                sucursalId: String(domicilio._id),
                codigo: codigoSucursal(s.codigo),
                origen: "arca",
                actividades: s.actividades.map((a) => ({ codigo: codigoActividad(a.codigo), descripcion: descripcionPrevia.get(codigoActividad(a.codigo)) || a.descripcion })),
            };
            deArca.push(fila);
            const rotulo = `${fila.codigo} ${domicilio.domicilio}`;
            if (!idsPrevios.includes(fila.sucursalId))
                cambios.push(`+ se asocia ${rotulo}`);
            const codigoPrevio = codigoSucursal(previa?.codigo);
            if (codigoPrevio !== fila.codigo)
                cambios.push(`código de ${domicilio.domicilio}: ${codigoPrevio || `(sin código propio; regía el del catálogo: ${codigoSucursal(domicilio.codigo) || "ninguno"})`} ⇒ ${fila.codigo}`);
            if (!previa || !actividadesIguales(previa.actividades || [], fila.actividades))
                cambios.push(`actividades de ${rotulo}: [${(previa?.actividades || []).map((a) => codigoActividad(a.codigo)).join(", ") || "ninguna"}] ⇒ [${fila.actividades.map((a) => a.codigo).join(", ")}]`);
            else if (previa.origen !== "arca")
                cambios.push(`${rotulo}: se marca como leída de ARCA`);
        }
        // Lo que la base tiene y ARCA no.
        const idsArca = new Set(deArca.map((f) => f.sucursalId));
        const sobran = [...new Set([...idsPrevios, ...previas.keys()])].filter((id) => !idsArca.has(id)).map((id) => ({ sucursalId: id, domicilio: domicilioDe.get(id) || `(domicilio ${id} que ya no está en el catálogo)`, quitada: !!o.quitar }));
        for (const s of sobran)
            cambios.push(o.quitar ? `− se quita ${s.domicilio}: ARCA no la tiene para este CUIT` : `! ${s.domicilio} está asociada y ARCA no la tiene para este CUIT (se quita con --quitar)`);
        // Cómo queda: lo de ARCA, más —si no se quita— lo que sobraba, tal como estaba.
        const conservadas = o.quitar
            ? []
            : sobran
                .filter((s) => previas.has(s.sucursalId))
                .map((s) => {
                const f = previas.get(s.sucursalId);
                return { sucursalId: s.sucursalId, codigo: codigoSucursal(f.codigo), ...(f.origen === "arca" || f.origen === "manual" ? { origen: f.origen } : {}), actividades: (f.actividades || []).map((a) => ({ codigo: a.codigo, descripcion: a.descripcion || "" })) };
            });
        const sucursalActividades = [...deArca, ...conservadas];
        const sucursalIds = [...deArca.map((f) => f.sucursalId), ...(o.quitar ? [] : sobran.filter((s) => idsPrevios.includes(s.sucursalId)).map((s) => s.sucursalId))];
        // El domicilio habitual.
        const habitualPrevio = empresa.habitualId ? String(empresa.habitualId) : null;
        let habitual;
        if (!habitualPrevio) {
            habitual = sucursalIds.length === 1 ? { accion: "cambia", de: null, a: sucursalIds[0], nota: `no tenía domicilio habitual y le queda una sola sucursal: pasa a ser ${domicilioDe.get(sucursalIds[0])}` } : { accion: "sin_habitual", de: null, a: null, nota: "no tiene domicilio habitual; no se elige uno por ella" };
        }
        else if (sucursalIds.includes(habitualPrevio)) {
            habitual = { accion: "queda", de: habitualPrevio, a: habitualPrevio, nota: `sigue siendo ${domicilioDe.get(habitualPrevio)}` };
        }
        else if (sucursalIds.length === 1) {
            habitual = { accion: "cambia", de: habitualPrevio, a: sucursalIds[0], nota: `apuntaba a ${domicilioDe.get(habitualPrevio) || habitualPrevio}, que ya no tiene; le queda una sola sucursal y pasa a ser ${domicilioDe.get(sucursalIds[0])}` };
        }
        else {
            habitual = { accion: "sin_resolver", de: habitualPrevio, a: null, nota: `apunta a ${domicilioDe.get(habitualPrevio) || habitualPrevio}, que ya no tiene, y le quedan ${sucursalIds.length} sucursales: elegí la habitual en la ficha de la empresa` };
        }
        if (habitual.accion === "cambia")
            cambios.push(`domicilio habitual: ${habitual.nota}`);
        if (habitual.accion === "sin_resolver")
            cambios.push(`! domicilio habitual: ${habitual.nota}`);
        const mismasIds = sucursalIds.length === idsPrevios.length && sucursalIds.every((id) => idsPrevios.includes(id));
        const mismasFilas = sucursalActividades.length === (empresa.sucursalActividades || []).length &&
            sucursalActividades.every((f) => {
                const p = previas.get(f.sucursalId);
                return !!p && codigoSucursal(p.codigo) === f.codigo && (p.origen || undefined) === f.origen && actividadesIguales(p.actividades || [], f.actividades);
            });
        plan.empresas.push({
            cuit: dato.cuit,
            razonSocial: empresa.razonSocial || dato.razonSocial,
            empresaId: String(empresa._id),
            cambia: !(mismasIds && mismasFilas) || habitual.accion === "cambia",
            sucursalIds,
            sucursalActividades,
            cambios,
            sobran,
            habitual,
        });
    }
    return plan;
}
