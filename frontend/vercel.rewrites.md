# Por qué `vercel.json` está escrito así

Vercel valida el esquema de `vercel.json` y no admite claves que no conoce, así que la explicación no
puede vivir adentro del archivo. Vive acá.

## Vercel NO ejecuta la API: la proxea

Es lo primero que confunde, porque los headers de una respuesta de `/api/v1/...` traen `server: Vercel`
y `x-vercel-id` **y también** los de helmet y `express-rate-limit`. Eso no es Express empaquetado como
Vercel Function: es Vercel haciendo de reverse proxy hacia el Express de siempre.

```
/api/(.*)  ->  https://autolab.fun:7001/api/$1
```

El servidor es un proceso largo en el VPS. Consecuencias que importan al leer el código del server:

- los `setInterval` de los schedulers **corren** (escaneo de Dropbox, paritarias, Dropbox Sign);
- el estado en memoria **sobrevive** entre requests (el candado por tenant del escaneo, el debounce
  del webhook de Dropbox, el store del rate limiter);
- no hace falta `waitUntil` ni ningún adapter serverless: el trabajo lanzado después de responder se
  ejecuta igual.

Si algún día la API se moviera de verdad a funciones serverless, **todo eso deja de ser cierto** y hay
que revisarlo entero antes de mover nada.

## `/api/(.*)` y no `/api/v1/:path*`

La regla era `/api/v1/:path*`, y lo que no matcheaba caía en el catch-all del SPA de más abajo: Vercel
devolvía el `index.html` **con 200**. Dos formas de pegarle a eso, las dos verificadas contra
producción:

| pedido | antes |
|---|---|
| `/api/v1/dropbox/webhook/` (barra final) | HTML 200 |
| `/api/dropbox/webhook` (sin el `v1`) | HTML 200 |

Para el webhook de Dropbox eso es lo peor que puede pasar: el `POST` recibe 200, el organismo anota la
entrega como exitosa, y del otro lado no hay nadie. Falla en silencio y con apariencia de funcionar.

Dos cambios en una línea:

- **`(.*)` en vez de `:path*`** — el segmento con nombre no toma la barra final; el regex sí. Con eso
  el request llega a Express, que no usa `strict routing` y trata `/webhook` y `/webhook/` como la
  misma ruta.
- **va PRIMERA** — cualquier cosa bajo `/api` entra por acá y nunca llega al catch-all del SPA. Una
  ruta inexistente ahora la contesta el `404` JSON del server, que es lo que corresponde a una API.

## `frontend/src/vercel.json`

Existe, tiene solo la regla del SPA, y **no lo lee nadie**: Vercel busca `vercel.json` en la raíz del
proyecto, no adentro de `src/`. Quedó de alguna mudanza. No se borró para no mezclarlo con este
cambio, pero es candidato: tener dos archivos con el mismo nombre y distinto contenido es la forma de
editar el que no se aplica.
