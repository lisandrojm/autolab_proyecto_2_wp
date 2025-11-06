# Sistema de Nomenclatura de Eventos del Calendario

Este documento explica cómo funciona el sistema de tipos de eventos del calendario y cómo agregar nuevos tipos en el futuro.

## Estructura Actual

El calendario utiliza un sistema de nomenclatura visual basado en:
- **Iconos FontAwesome**: Identifican visualmente el tipo de evento
- **Colores**: Diferencian el estado (para posts) o tipo de evento
- **Labels**: Describen el tipo de evento en texto

## Tipos de Eventos Soportados

### Activos
- **📱 Post** (`faPaperPlane`): Publicaciones en redes sociales

### En Desarrollo (Próximamente)
- **✓ Tarea** (`faListCheck`): Tareas o actividades pendientes
- **👥 Reunión** (`faUsers`): Reuniones con clientes o equipo
- **⏰ Fecha límite** (`faClock`): Fechas límite importantes
- **📢 Campaña** (`faBullhorn`): Hitos de campañas de marketing

## Cómo Agregar un Nuevo Tipo de Evento

### 1. Actualizar el Type (calendarEvents.ts)

```typescript
export type EventType = "post" | "task" | "meeting" | "deadline" | "campaign" | "nuevo_tipo";
```

### 2. Importar el Icono de FontAwesome (calendarEvents.ts)

```typescript
import { faPaperPlane, faListCheck, faUsers, faClock, faBullhorn, faTarget } from "@fortawesome/free-solid-svg-icons";
```

### 3. Agregar Configuración (calendarEvents.ts)

```typescript
export const eventTypeConfig: Record<EventType, EventTypeConfig> = {
  // ... tipos existentes
  nuevo_tipo: {
    icon: faTarget,  // Icono de FontAwesome
    label: "Nuevo Tipo",
    bgColor: "#10b981",  // Color en formato hex
    description: "Descripción del nuevo tipo de evento",
  },
};
```

### 3. Habilitar el Tipo (calendarEvents.ts)

```typescript
export const isEventTypeEnabled = (type: EventType): boolean => {
  return type === "post" || type === "nuevo_tipo";
};
```

### 4. Crear Fuente de Datos

Crea una función para obtener los eventos del nuevo tipo:

```typescript
const fetchNuevoTipo = async () => {
  try {
    const response = await fetch(`${API_URL}/nuevo-tipo`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching nuevo tipo:", error);
    return [];
  }
};
```

### 5. Integrar en el Calendario (CalendarPage.tsx)

```typescript
const [nuevosTipos, setNuevosTipos] = useState([]);

useEffect(() => {
  fetchPosts();
  fetchNuevoTipo().then(setNuevosTipos);
}, []);

const events: CalendarEvent[] = useMemo(() => {
  const postEvents = posts.map((post) => ({
    id: post._id,
    title: formatEventTitle("post", post.title),
    start: new Date(post.createdAt),
    end: new Date(post.createdAt),
    resource: post,
    eventType: "post" as EventType,
  }));

  const nuevoTipoEvents = nuevosTipos.map((item) => ({
    id: item._id,
    title: formatEventTitle("nuevo_tipo", item.nombre),
    start: new Date(item.fecha),
    end: new Date(item.fecha),
    resource: item,
    eventType: "nuevo_tipo" as EventType,
  }));

  return [...postEvents, ...nuevoTipoEvents];
}, [posts, nuevosTipos]);
```

### 6. Manejar Navegación

Actualiza el handler de selección para dirigir al lugar correcto:

```typescript
const handleSelectEvent = useCallback((event: CalendarEvent) => {
  switch (event.eventType) {
    case "post":
      navigate(`/posts/${event.id}`);
      break;
    case "nuevo_tipo":
      navigate(`/nuevo-tipo/${event.id}`);
      break;
    default:
      console.warn("Tipo de evento no manejado:", event.eventType);
  }
}, [navigate]);
```

## Paleta de Colores Recomendada

Para mantener consistencia visual, usa estos colores de Tailwind:

- **Azul** (#3b82f6): Posts, contenido social
- **Violeta** (#8b5cf6): Tareas, trabajo interno
- **Cyan** (#06b6d4): Reuniones, colaboración
- **Ámbar** (#f59e0b): Deadlines, urgencias
- **Rosa** (#ec4899): Campañas, marketing
- **Verde** (#10b981): Completado, éxito
- **Rojo** (#ef4444): Cancelado, error

## Iconos FontAwesome Recomendados por Categoría

### Contenido y Publicaciones
- `faPaperPlane` - Social Media Posts
- `faFileAlt` - Blog/Artículo
- `faVideo` - Video
- `faImage` - Foto
- `faBullhorn` - Anuncio

### Trabajo y Tareas
- `faListCheck` - Tarea
- `faClipboardList` - Lista
- `faTarget` - Meta/Objetivo
- `faCog` - Configuración
- `faBug` - Bug/Error

### Reuniones y Eventos
- `faUsers` - Reunión
- `faPhone` - Llamada
- `faGraduationCap` - Training/Capacitación
- `faPartyHorn` - Evento
- `faChartLine` - Presentación

### Tiempo y Deadlines
- `faClock` - Deadline
- `faBell` - Recordatorio
- `faCalendarDay` - Fecha importante
- `faExclamationCircle` - Alerta

## Ejemplo Completo: Agregar "Llamadas"

```typescript
// 1. Type
export type EventType = "post" | "task" | "meeting" | "deadline" | "campaign" | "call";

// 2. Import Icon
import { faPaperPlane, faListCheck, faUsers, faClock, faBullhorn, faPhone } from "@fortawesome/free-solid-svg-icons";

// 3. Config
call: {
  icon: faPhone,
  label: "Llamada",
  bgColor: "#14b8a6",
  description: "Llamada programada con cliente",
}

// 4. Enable
export const isEventTypeEnabled = (type: EventType): boolean => {
  return ["post", "call"].includes(type);
};

// 5. En CalendarPage
const [calls, setCalls] = useState([]);

const callEvents = calls.map((call) => ({
  id: call._id,
  title: call.clientName,  // Ya no se usa formatEventTitle, el icono se renderiza automáticamente
  start: new Date(call.scheduledAt),
  end: new Date(call.scheduledAt),
  resource: call,
  eventType: "call" as EventType,
}));
```

## Best Practices

1. **Usa iconos claros de FontAwesome**: Selecciona iconos que representen inequívocamente el tipo de evento
2. **Iconos monocromáticos**: Usa iconos solid de FontAwesome (`@fortawesome/free-solid-svg-icons`)
3. **Colores distintos**: Cada tipo debe tener un color único para fácil identificación
4. **Tooltips informativos**: Usa la propiedad `description` para ayudar al usuario
5. **Consistencia**: Mantén el estilo de naming (singular, minúsculas en el type)
6. **Testing**: Prueba que el evento se muestre correctamente en todas las vistas (mes, semana, día, agenda)
7. **Accesibilidad**: Los iconos con fondos de color aseguran buena visibilidad en modo claro y oscuro

## Mantenimiento

- Revisa periódicamente si hay tipos "próximamente" que puedan activarse
- Elimina tipos que no se usarán en el futuro previsible
- Mantén actualizada esta documentación con cambios importantes
