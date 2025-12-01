# 🚀 Quick Start: Módulos Dev Templates

Guía rápida para usar los módulos de desarrollo inmediatamente.

---

## ⚡ Acceso Rápido

### Módulos Disponibles

```bash
# Vacaciones Dev (Template Base)
http://localhost:5173/vacations-dev

# Bonos Dev (Ejemplo Adaptado)
http://localhost:5173/bonus-dev
```

---

## 🎯 ¿Qué Puedes Hacer?

### En 5 Minutos
1. Acceder a `/vacations-dev` o `/bonus-dev`
2. Explorar los 5 tabs (Config, Reglas, Catálogo, Gestión, Balance)
3. Probar crear, editar y eliminar elementos
4. Ver cómo funcionan las validaciones
5. Experimentar con aprobar/rechazar solicitudes

### En 30 Minutos
1. Leer `frontend/src/pages/VacationsDev/README.md`
2. Entender la estructura del template
3. Revisar el mock JSON en `frontend/src/mocks/vacationsDev/`
4. Comparar VacationsDev vs BonusDev
5. Planificar tu propio módulo

### En 1-2 Horas
1. Copiar template base
2. Adaptar mock JSON para tu caso de uso
3. Modificar interfaces TypeScript
4. Ajustar UI según necesites
5. Agregar ruta y probar tu módulo nuevo

---

## 📋 Tabs Disponibles

### 1️⃣ Configuración
- Toggle On/Off del módulo
- Selector de visibilidad
- Opciones de aprobación
- Guardar cambios

### 2️⃣ Reglas
- Ver todas las reglas
- Crear nueva regla (cargo + nivel + valor)
- Editar reglas existentes
- Eliminar reglas

### 3️⃣ Catálogo
- Sub-tab: Cargos
  - Ver, crear, editar, eliminar cargos
- Sub-tab: Niveles
  - Ver, crear, editar, eliminar niveles
  - Asociados a cargos

### 4️⃣ Gestión
- Lista de solicitudes
- Ver detalles completos
- Aprobar solicitudes pendientes
- Rechazar solicitudes pendientes
- Estados visuales con badges

### 5️⃣ Balance
- Ver balance por usuario
- Métricas asignadas/usadas/disponibles
- Barras de progreso
- Totales y porcentajes

---

## 🎨 Características

### ✅ Funciona Sin Backend
- Todo en memoria (useState)
- No necesita MongoDB
- No necesita APIs
- Ideal para prototipado

### ✅ UI Profesional
- Dark mode completo
- Mobile-first responsive
- Animaciones suaves
- Componentes reutilizables

### ✅ CRUD Completo
- Crear elementos
- Editar existentes
- Eliminar con confirmación
- Validaciones integradas

---

## 🛠️ Crear Tu Módulo

### Opción Rápida (Copiar y Adaptar)

```bash
# 1. Copiar template
cp -r frontend/src/pages/VacationsDev frontend/src/pages/MiModuloDev
cp -r frontend/src/mocks/vacationsDev frontend/src/mocks/miModuloDev

# 2. Renombrar archivos
cd frontend/src/pages/MiModuloDev
mv VacationsDevPage.tsx MiModuloDevPage.tsx

cd ../../mocks/miModuloDev
mv vacationsDev.mock.json miModuloDev.mock.json

# 3. Editar archivos (cambiar imports, títulos, campos)
# 4. Agregar ruta en App.tsx
# 5. Probar en /mi-modulo-dev
```

### Campos a Cambiar

**En el componente (.tsx):**
- [ ] Import del JSON: línea ~17
- [ ] Título PageLayout: línea ~221
- [ ] Icono faIcon: línea ~221
- [ ] Interfaces: líneas 8-55
- [ ] Nombres de columnas en tablas
- [ ] Labels en formularios

**En el mock JSON:**
- [ ] Campos de `rules`
- [ ] Campos de `records`
- [ ] Campos de `balances`
- [ ] Datos de ejemplo

**En App.tsx:**
- [ ] Import: línea ~66-67
- [ ] Route: línea ~596-611

---

## 📚 Documentación

### Lectura Recomendada (en orden)

1. **Este archivo** (5 min)
   - Acceso rápido y overview

2. **IMPLEMENTATION_SUMMARY.md** (10 min)
   - Qué se implementó
   - Estadísticas del proyecto

3. **frontend/src/pages/VacationsDev/README.md** (20 min)
   - Template base completo
   - Instrucciones paso a paso

4. **frontend/src/pages/BonusDev/README.md** (15 min)
   - Ejemplo de adaptación
   - Cambios realizados

5. **TEMPLATE_MODULES_GUIDE.md** (30 min)
   - Guía maestra completa
   - Casos de uso reales
   - Best practices

---

## ❓ FAQ Rápido

### ¿Los datos se guardan?
No, todo es in-memory. Al refrescar la página se resetean.

### ¿Puedo modificar el JSON?
Sí, edita `frontend/src/mocks/<modulo>/<modulo>.mock.json`

### ¿Necesito backend?
No, es 100% frontend con datos simulados.

### ¿Funciona con autenticación?
Sí, está dentro de ProtectedRoute, pero no valida roles específicos.

### ¿Puedo agregar más campos?
Sí, edita las interfaces TypeScript y el JSON.

### ¿Dark mode funciona?
Sí, completamente implementado en todos los tabs.

### ¿Es responsive?
Sí, mobile-first con breakpoints estándar.

---

## 🎯 Próximos Pasos

### Para Explorar
1. Accede a `/vacations-dev`
2. Explora cada tab
3. Prueba crear/editar/eliminar
4. Observa las validaciones

### Para Aprender
1. Lee el README de VacationsDev
2. Compara con BonusDev
3. Revisa el código fuente
4. Entiende la estructura

### Para Crear
1. Decide qué módulo necesitas
2. Copia el template
3. Adapta según tu caso
4. Agrega ruta y prueba

---

## 🆘 Ayuda

### Si algo no funciona:
1. Verifica la ruta en el navegador
2. Revisa la consola del navegador (F12)
3. Comprueba que el import del JSON sea correcto
4. Lee la sección Troubleshooting en los READMEs

### Si tienes dudas:
1. Lee TEMPLATE_MODULES_GUIDE.md
2. Revisa ejemplos en VacationsDev y BonusDev
3. Compara tu código con el template base

---

## ✨ Tips Rápidos

💡 **Usa dark mode:** Toggle en la esquina superior derecha

💡 **Mobile test:** Abre DevTools y simula mobile

💡 **Copy-paste friendly:** Todo el código es reutilizable

💡 **TypeScript first:** Interfaces bien tipadas

💡 **Validations included:** Ya tiene validaciones básicas

💡 **No backend needed:** Perfecto para demos

---

**¡Empieza ahora! Accede a `/vacations-dev` y explora** 🚀

---

**Documentación completa:** Ver archivos .md en el proyecto
**Soporte:** Revisar READMEs y guías incluidas
**Versión:** 1.0.0
