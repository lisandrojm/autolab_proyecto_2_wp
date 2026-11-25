# CLAUDE.md — tango-connector

Servicio interno de Lumba: la capa única de acceso a Tango Gestión para los demás proyectos.
Para el contexto, leer `README.md` y `docs/decisiones/`.

## Reglas

- **Secretos:** nunca se commitean. `.env*` y `.vps*` están en `.gitignore`; solo se
  versionan los `*.example`.
- **VPS:** el acceso es **de solo lectura** salvo aprobación explícita del usuario para cada
  cambio. Eso incluye config de frps y nginx, PM2, firewall y la instalación de paquetes.
- **Tango:** no se hacen escrituras (altas, modificaciones, bajas) contra servidores Tango
  reales sin confirmación. Las consultas también se confirman antes de la primera vez.
- **Decisiones técnicas importantes:** se registran como ADR en `docs/decisiones/`.
- **`any` en TypeScript:** requiere un comentario que lo justifique.
- **Origen del código:** la referencia de lo que se toma de lumba-tango
  (`D:\Projects\lumba-tango`) se anota en el commit. lumba-tango **no se modifica** desde
  este proyecto.
