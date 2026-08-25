/**
 * En qué sistema está la persona que mira la pantalla.
 *
 * Se usa para ofrecerle UN botón de descarga y las instrucciones de SU sistema, en vez de tres
 * botones y las instrucciones de todos. Elegir mal el archivo no da un error entendible.
 *
 * SE PREGUNTA EL SISTEMA, NO LA ARQUITECTURA, y eso es deliberado: el navegador no puede saber si
 * una Mac es Apple Silicon o Intel de forma confiable. `navigator.platform` dice `"MacIntel"` en
 * TODAS las Macs, incluidas las M1/M2/M3 — es el caso clásico de dato que parece la respuesta y es
 * siempre el mismo. Si alguna vez alguien lo agrega «para afinar la detección», va a estar
 * empeorando las cosas con algo que parece funcionar.
 *
 * La arquitectura se resuelve donde SÍ se sabe: en la máquina. Ver `sistemaProbable()` en
 * `api/asistente.ts` para el desempate del build de Mac, que es asimétrico a propósito.
 */
export type Sistema = 'windows' | 'mac' | 'otro';

export function detectarSistema(): Sistema {
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const ua = navigator.userAgent || '';

  /*
    Un iPad con Safari se declara `Macintosh`. Sin este descarte le ofreceríamos un ejecutable de
    escritorio a una tablet, que no lo puede correr de ninguna manera. Las Macs no tienen pantalla
    táctil, así que `maxTouchPoints` los separa.
  */
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'otro';

  // `userAgentData.platform` es low-entropy: no pide permiso, no es asincrónico y el reduced-UA no lo
  // recorta. Solo existe en Chromium; el `userAgent` cubre a Safari y Firefox.
  const plataforma = String(uaData?.platform || '').toLowerCase();
  if (plataforma) {
    if (plataforma.includes('win')) return 'windows';
    if (plataforma.includes('mac')) return 'mac';
    return 'otro';
  }

  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  return 'otro';
}
