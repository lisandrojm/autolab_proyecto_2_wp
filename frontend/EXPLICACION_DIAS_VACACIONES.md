# Explicación del Cálculo y Visualización de Días de Vacaciones

Este documento detalla cómo el sistema calcula y muestra los días de vacaciones restantes del usuario, asegurando que siempre se vea el saldo actualizado.

A diferencia de un saldo estático que se va "restando" en la base de datos, el sistema realiza un **cálculo dinámico** combinando varias fuentes de datos.

## 1. Fuentes de Datos

Para determinar cuántos días tiene un usuario, el sistema consulta:

1.  **Antigüedad del Usuario**: Se calcula desde la fecha de ingreso (`hireDate`) o sumando los contratos registrados en el perfil.
2.  **Configuración Global (`VacationConfig`)**: Define reglas generales como _días de beneficio_ extra para todos los empleados.
3.  **Perfil del Usuario (`Profile`)**: Contiene ajustes individuales como _días extra_ (`extraVacationDays`) o _días de arrastre_ del año anterior (`carryOverVacationDays`).
4.  **Historial de Solicitudes (`VacationRequest`)**: Todas las vacaciones que el usuario ha pedido.

## 2. La Fórmula del Cálculo

El cálculo se realiza en tiempo real en la aplicación (`Vacations.tsx`) siguiendo esta lógica:

### A. Cálculo del TOTAL ANUAL (Haber)

Es la suma de todo lo que el usuario _tiene derecho_ a tomarse en el año.

$$
Total = (Días por Ley) + (Beneficio Empresa) + (Extras Individuales) + (Arrastre Año Anterior)
$$

- **Días por Ley (LCT)**: Se calcula automáticamente según la antigüedad (ej. < 5 años = 14 días).
- **Beneficio Empresa**: Días adicionales que la empresa regala a todos (configurado globalmente).
- **Extras Individuales**: Días puntuales agregados manualmente al perfil de un usuario.
- **Arrastre**: Días sobrantes del año anterior (si la configuración lo permite).

### B. Cálculo del CONSUMO (Debe)

Es la suma de los días que el usuario ya ha "gastado" o "comprometido".

- **Días Gozados (`Used`)**: Suma de días de solicitudes con estado `approved`, `delivered`, etc.
- **Días Pendientes (`Pending`)**: Suma de días de solicitudes que aún están en espera de aprobación (`pending`, `pre_approved`). **Estos se descuentan preventivamente del saldo disponible.**

### C. Cálculo del DISPONIBLE (Saldo)

Finalmente, el saldo que ve el usuario es:

$$
Disponibles = Total - (Gozados + Pendientes)
$$

## 3. Ejemplo Práctico

Imaginemos un usuario con 3 años de antigüedad:

1.  **Total**:
    - Ley (LCT): **14 días**
    - Beneficio Global: **1 día**
    - Extra Manual: **0 días**
    - Arrastre: **2 días**
    - **TOTAL = 17 días**

2.  **Consumo**:
    - Vacaciones en Enero (Aprobadas): **10 días**
    - Solicitud actual para Marzo (Pendiente): **4 días**
    - **CONSUMO = 14 días**

3.  **Resultado**:
    - **DISPONIBLES = 3 días** (17 - 14)

## 4. Visualización y Bloqueo

En la pantalla "Mis Vacaciones", el sistema muestra estos tres valores (Total, Disponibles, Pendientes) claramente.

Cuando el usuario intenta pedir nuevas vacaciones:

1.  El calendario verifica el valor de **Disponibles**.
2.  Si el usuario selecciona un rango de fechas mayor a su saldo disponible (ej. intenta pedir 5 días cuando le quedan 3), el sistema **bloquea la solicitud** y muestra un mensaje de error explicando el límite.
3.  Si el saldo llega a 0, el calendario se deshabilita preventivamente.
