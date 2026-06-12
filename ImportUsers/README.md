# Módulo de Importación y Sincronización de Usuarios (FRAME)

Este módulo contiene la lógica completa para importar, actualizar y sincronizar de forma total o parcial (incremental) el personal registrado en el sistema externo **FRAME** hacia una base de datos local de MongoDB utilizando Node.js, Express y Mongoose.

---

## Estructura del Módulo

*   **`models/User.ts`**: Esquema de Mongoose para el usuario local (`User`). Almacena los datos de autenticación, perfil del usuario y el objeto estructurado `metadata` (de tipo `IUserMetadata`) que mapea todos los campos provistos por la API de FRAME (como datos personales, bancarios y de obra social).
*   **`models/UserProject.ts`**: Esquema de Mongoose para la colección intermedia `users_&_projects`. Representa la relación contractual histórica de un empleado con sus respectivos proyectos en FRAME.
*   **`services/ExternalApiService.ts`**: Servicio centralizado que gestiona la comunicación con la API externa de FRAME (Autenticación por JWT Bearer, consultas a `/empleado` y `/proyecto-empleado/empleado/v2/:id`).
*   **`controllers/userController.ts`**: Controladores de Express que manejan la lógica de pre-chequeo (`checkImportUsers`) e importación efectiva (`importUsers`).
*   **`routes/userRoutes.ts`**: Definición de rutas Express expuestas al cliente.

---

## Flujos de Trabajo (Workflows)

### 1. Sincronización Parcial (Rápida / Incremental)
Diseñada para importar ágilmente solo aquellos empleados agregados recientemente en FRAME sin sobrecargar el servidor con peticiones innecesarias.

1.  **Chequeo Previo (`POST /import/check`)**:
    *   El frontend envía un número de días hacia atrás (ej: `sinceDays: 7`).
    *   El servicio obtiene todos los empleados de FRAME, calcula la fecha límite (`thresholdDate`) y filtra a los empleados cuya fecha de contratación/alta (`fechaAlta`) esté dentro del rango especificado.
    *   Responde con el conteo (`count`) y el listado simplificado de empleados (`name`, `email`, `fechaAlta`).
2.  **Confirmación Visual**: El frontend muestra la lista detallada al usuario.
3.  **Importación (`POST /import`)**: Al confirmar, se envía la orden de importación enviando `{ sinceDays, syncProjects }`. El backend filtra la importación de la misma manera y persiste únicamente los registros válidos.

### 2. Sincronización Completa
*   Se ejecuta omitiendo el parámetro `sinceDays` en la petición `POST /import`.
*   Obtiene y actualiza todos los empleados registrados en FRAME. Si un usuario ya existe en base al email, sus datos de perfil y metadatos son actualizados/sobrescritos. Si no existe, se crea el documento con una contraseña por defecto (`ChangeMe123!`).

---

## Dependencias Requeridas
Asegúrate de tener instaladas las siguientes dependencias en el archivo `package.json` de tu proyecto:
```json
{
  "dependencies": {
    "axios": "^1.x.x",
    "mongoose": "^8.x.x",
    "express": "^4.x.x",
    "bcryptjs": "^2.x.x",
    "date-fns": "^3.x.x"
  },
  "devDependencies": {
    "@types/express": "^4.x.x",
    "@types/bcryptjs": "^2.x.x"
  }
}
```

---

## Variables de Entorno (.env)
El módulo requiere que configures las siguientes claves en tu entorno:
```env
# URL base de la API de FRAME (ej: https://frame.weprodu.com/api)
FRAME_API_URL=https://frame.weprodu.com/api

# Credenciales de acceso para autenticación en la API de FRAME
FRAME_API_USER=usuario_de_conexion@weprodu.com
FRAME_API_PASSWORD=contraseña_secreta
```

---

## Pasos para la Integración en tu Código

1.  **Copia los archivos** de este módulo respetando la estructura (`models`, `services`, `controllers`, `routes`) dentro de tu directorio fuente.
2.  **Registra los modelos Mongoose** en tu archivo principal de arranque de base de datos para asegurar su instanciación inicial.
3.  **Configura las variables de entorno** en tu archivo de inicio (`dotenv.config()`).
4.  **Monta las rutas** en tu servidor Express:
    ```typescript
    import userRoutes from "./routes/userRoutes.js";
    // ...
    app.use("/api/v1/users", userRoutes);
    ```
5.  **Asegura las rutas**: Los endpoints utilizan un middleware de autenticación `protect` que debe estar implementado en tu proyecto para inyectar al usuario autenticado y su inquilino (`req.user.tenantId`).
