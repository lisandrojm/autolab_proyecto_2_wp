# Documentación del Frontend - Weprodu

El frontend de Weprodu es una aplicación React de gran escala, diseñada para gestionar flujos complejos de RRHH y proyectos.

## Secciones

1.  **[Arquitectura](./architecture.md)**: Stack tecnológico, estado global y estructura.
2.  **[Páginas y Componentes](./pages.md)**: Guía visual y de módulos.

## Características Técnicas

- **Tailwind CSS**: Diseño responsivo y modo oscuro.
- **Zustand**: Gestión de estado ligera y eficiente.
- **Vite**: Hot module replacement y compilación ultra-rápida.
- **Mobile First**: Optimización para dispositivos táctiles.

---

## Estructura de src

```text
frontend/src/
├── api/            # Configuración de clientes API
├── components/     # UI reusable (modales, botones, cards)
├── hooks/          # Lógica de React personalizada
├── pages/          # Vistas principales de la aplicación
├── stores/         # Estado global con Zustand
└── types/          # Definiciones de interfaces TypeScript
```
