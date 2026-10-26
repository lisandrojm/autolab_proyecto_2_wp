import { esTextoDeLimite } from "./reglas.js";
export function clasificarPantalla(url, texto) {
    const u = String(url || "");
    const t = String(texto || "");
    if (esTextoDeLimite(t))
        return "limite";
    if (/\/login\b|\/signin\b|\/oauth2\/authorize|accounts\.google|login_email|login_password/i.test(u))
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
export function pasoDeLogin(v) {
    const t = String(v.texto || "");
    const u = String(v.url || "");
    if (/app\.sign\.dropbox\.com/i.test(u) && clasificarPantalla(u, t) === "manage")
        return "listo";
    if (/contrase[ñn]a incorrecta|incorrect password|wrong password|datos incorrectos|no coinciden/i.test(t))
        return "login_clave_incorrecta";
    if (v.hayCaptcha || /captcha|no soy un robot|i'?m not a robot|verifica que eres humano|verify you are human/i.test(t))
        return "login_requiere_captcha";
    if (v.hayCodigo || /c[oó]digo de (verificaci[oó]n|seguridad)|verification code|security code|two-step|verificaci[oó]n en dos pasos|autenticaci[oó]n de dos factores|two-factor|te enviamos un c[oó]digo|we sent (you )?a code|enter the code|ingres[aá] el c[oó]digo/i.test(t))
        return "login_requiere_2fa";
    if (v.hayClave && !v.claveEnviada)
        return "clave";
    if (v.hayEmail && !v.emailCargado && !v.hayClave)
        return "email";
    // La pantalla de consentimiento de OAuth («Permitir» / «Allow»): no se autoriza nada en nombre de nadie.
    if (/\/oauth2\/authorize/i.test(u) && !v.hayEmail && !v.hayClave && /\b(permitir|allow|autorizar|authorize)\b/i.test(t) && /acceso|access/i.test(t))
        return "login_requiere_autorizacion";
    // El login propio de Dropbox Sign que ofrece «Iniciar sesión con Dropbox» antes del formulario.
    if (!v.hayEmail && !v.hayClave && /iniciar sesi[oó]n con dropbox|sign in with dropbox|continuar con dropbox|continue with dropbox/i.test(t))
        return "boton_dropbox";
    return "esperar";
}
