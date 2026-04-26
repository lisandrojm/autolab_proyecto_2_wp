# Documentación del Backend - Weprodu

El backend es una API REST robusta construida con **Node.js**, **Express** y **TypeScript**.

## Secciones

1.  **[Modelos y Schemas](./models.md)**: Detalle de los datos (Usuarios, Proyectos, Vacaciones).
2.  **[API Endpoints](./api-endpoints.md)**: Mapa de rutas y controladores.

## Características Técnicas

- **Auth**: Autenticación vía JWT.
- **Multi-tenancy**: Filtrado de datos por organización (`tenantId`).
- **Validación**: Uso de `express-validator` para asegurar la integridad de los datos de entrada.
- **Scripts**: Incluye sistemas de seeding y verificación de roles al inicio.

---

## Estructura de src

```text
server/src/
├── controllers/    # Lógica de manejo de peticiones
├── middleware/     # Auth, Error handling, Tenant validation
├── models/         # Definiciones de Mongoose (Schemas)
├── routes/         # Definición de rutas Express
├── services/       # Lógica de negocio reutilizable
└── scripts/        # Tareas de mantenimiento y siembra de datos
```
