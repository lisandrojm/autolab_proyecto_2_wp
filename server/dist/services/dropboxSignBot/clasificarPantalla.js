import { esTextoDeLimite } from "./reglas.js";
export function clasificarPantalla(url, texto) {
    const u = String(url || "");
    const t = String(texto || "");
    if (esTextoDeLimite(t))
        return "limite";
    if (/\/login\b|\/signin\b|accounts\.google|login_email|login_password/i.test(u))
        return "login";
    if (/contrase[ñn]a|password/i.test(t) && /iniciar sesi[oó]n|sign in|log in|continuar|continue/i.test(t) && !/firmar documentos|insertar campos|revisar y enviar/i.test(t))
        return "login";
    if (/revisar y enviar|enviar para firmar/i.test(t))
        return "revisar";
    if (/insertar campos|agregar firmantes|seleccionar documentos|documentos seleccionados/i.test(t) || /\/prep\b|\/editor\b|\/request\b/i.test(u))
        return "editor";
    if (/\/home\/manage/i.test(u) || /firmar documentos/i.test(t))
        return "manage";
    return "desconocida";
}
