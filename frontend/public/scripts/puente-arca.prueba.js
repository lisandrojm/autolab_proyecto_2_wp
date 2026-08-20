/*
  PRUEBA DEL MECANISMO — no es el puente, no valida nada.

  Sirve para contestar una sola pregunta, aislada de los 500 renglones de la lógica real:
  ¿la cáscara puede traer código por red y ejecutarlo con `new Function`? (Tampermonkey y Chrome
  pueden bloquearlo según versión y modo.)

  CÓMO USARLA (30 segundos, y se deshace igual de rápido):

    cd frontend/public/scripts
    cp puente-arca.js puente-arca.real.js && cp puente-arca.prueba.js puente-arca.js
    # recargar WeProdu con la cáscara instalada y mirar la consola
    mv puente-arca.real.js puente-arca.js          # volver atrás

  QUÉ MIRAR, sin tocar nada:

    document.documentElement.dataset.weproduPuente

    'ok'          la cáscara trajo la lógica y la ejecutó  → el mecanismo funciona
    'error'       la trajo pero `new Function` explotó     → PLAN B (ver el .user.js congelado)
    'sin-logica'  no la pudo traer de ningún origen        → red / @connect / servidor caído
    'cargando'    quedó a mitad de camino
    (vacío)       la cáscara no está instalada o no corre  → es Tampermonkey, no esto
*/
document.documentElement.setAttribute('data-weprodu-prueba', 'ok');
console.log('[WeProdu] PRUEBA: la lógica traída por red se ejecutó. GM_getValue es', typeof GM_getValue, '· cáscara v' + ((typeof WEPRODU !== 'undefined' && WEPRODU && WEPRODU.version) || '?'));
