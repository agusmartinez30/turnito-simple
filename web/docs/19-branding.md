# 19 — Marca por complejo: logo y colores

## Objetivo

Que cada complejo use **su** logo y **sus** colores en lugar del ícono genérico, el índigo y el
lima de Clubix, en el panel `/admin` y en el link público `/app/[slug]`, sin que ninguna pantalla
quede ilegible.

El admin sube un archivo y elige dos hex en `/admin/settings/appearance`
([`09-admin-settings.md`](./09-admin-settings.md)); todo lo demás se deriva.

## Modelo

| Campo | Dónde | Formato |
|---|---|---|
| `primaryColor` | `Complex` | `#rrggbb` en minúsculas, o `null` |
| `secondaryColor` | `Complex` | idem |
| `logoUrl` | `Complex` | URL pública del bucket, o `null`. **Solo lectura**: se cambia subiendo un archivo |

`null` = paleta Clubix / ícono genérico. Los tres viajan en `GET /complex` (panel) y en
`GET /public/c/:slug/complex` (link público, sin auth). Contrato en
[`api/docs/08-admin-complex.md`](../../api/docs/08-admin-complex.md).

## El generador — `src/lib/theme.ts`

### Punto de partida

`globals.css` **ya es la salida de un generador**, solo que calculado a mano: `#1800AC` es
exactamente `oklch(0.344 0.228 268.603)`, y las rampas del sidebar y de la superficie pública
son desplazamientos fijos de L con decaimiento de croma sobre ese primario:

| token | ΔL desde `--primary` | factor de croma |
|---|---|---|
| `--sidebar-accent` | `+0.046` | `×0.965` |
| `--sidebar-active` | `+0.151` | `×0.811` |
| `/app` `--secondary` / `--muted` | `+0.066` | `×0.921` |
| `/app` `--accent` | `+0.111` | `×0.855` |

Así que el trabajo no fue inventar un algoritmo sino **escribir el generador que reproduce el
archivo** y después alimentarlo con otro hex. Esas constantes viven en `RAMP`.

### Por qué un helper propio y no una librería

Hace falta medir contraste WCAG para elegir la tinta, y eso pide JS igual. `color-mix(in oklab, …)`
puro no alcanza: no puede ramificar según un contraste medido, no reconstruye una rampa a croma
fijo (interpolar hacia blanco sube L y baja C a la vez) y deja el gamut mapping en manos del
browser, con lo cual lo que medimos en JS dejaría de describir lo que se pinta. Una librería de
color resolvería solo la conversión y agregaría una dependencia que cargan los clientes en
`/app`. El módulo son ~170 líneas sin dependencias, y es verificable: el test compara su salida
contra `globals.css`.

### La regla que decide cada token

- **Color crudo** donde la superficie es grande y la tinta puede adaptarse: `--sidebar`, el
  `--background` de `/app`, `--highlight`. Ahí el complejo ve su color exacto.
- **Color ajustado por contraste** donde el token se usa como tinta o filete sobre una
  superficie clara: `--primary`, `--ring`, `--chart-1`, `--highlight-strong`. Ahí manda la
  legibilidad. Es la misma doctrina que en `globals.css` separó `--highlight` (relleno) de
  `--highlight-strong` (trazo), generalizada.

Dos primitivas hacen ese trabajo: `ink(bg, hue)` elige entre casi-blanco y tinta oscura y empuja
la L hasta pasar 4.5:1 sobre `bg`; `against(color, bg, min)` conserva matiz y croma y mueve la L
hasta pasar `min`.

### Los neutros: rotar el matiz, no tocar L ni C

`--background`, `--foreground`, `--secondary`, `--muted`, `--accent`, `--border`, `--input` y las
tintas neutras se re-tiñen con el matiz del primario pero **conservan L y C literales de
`globals.css`**. Con `C ≤ 0.048`, rotar el matiz mueve la luminancia WCAG menos del 1%: todos los
pares AA ya verificados siguen valiendo sin re-auditarlos complejo por complejo.

Los estados de negocio (`--destructive*`, `--success*`, `--warning*`) **no se tocan nunca**: un
mismo estado tiene que leerse igual en el mostrador y en el teléfono del cliente. La única
excepción es `--warning-foreground`, que es tinta neutra teñida y sigue al matiz nuevo.

### Cuatro inversiones que hacen falta con un primario claro

1. **La rampa del sidebar se invierte** (`dir = primary.L < 0.6 ? 1 : -1`): aclarar un base ya
   claro borra el hover y el ítem activo.
2. **Los bordes alfa de `/app` también**: `oklch(1 0 0 / 22%)` es blanco translúcido e invisible
   sobre un canvas claro, así que pasan a negro.
3. **`--sidebar-primary` y `--sidebar-ring` dejan de ser `var(--highlight)`** y se calculan con
   `against(secundario, primario, 4.5)`. Hoy funcionan solo porque el lima da 8.95:1 sobre el
   índigo; con otra marca podrían borrarse.
4. **`--primary` de `/app` tampoco puede quedar `var(--highlight)`**, por lo mismo: es el acento
   sobre el canvas y necesita 4.5:1 contra él.

### Garantías

El generador asegura, para **cualquier** par de colores: tinta del sidebar y del canvas público
≥ 4.5:1, acento sobre el color de marca ≥ 4.5:1, `--primary` sobre el fondo del panel ≥ 4.5:1 y
`--highlight-strong` sobre blanco ≥ 3:1. `audit` devuelve esos ratios medidos y los avisos que
muestra la UI.

**No hay clamp de luminosidad al color elegido**: un clamp convertiría el amarillo de un complejo
en un ocre y el admin pensaría que la app está rota. La legibilidad se resuelve adaptando la
tinta donde la superficie lo permite y ajustando el color solo donde es trazo sobre claro. Con
`#ffd400` el sidebar queda amarillo pleno con tinta negra (12.6:1) y los links del panel salen en
un ocre legible (4.6:1).

## Inyección

`ComplexTheme` (`src/components/layout/ComplexTheme.tsx`) renderiza un `<style>` con la hoja
generada. No hace la query: recibe los dos hex por props, así sirve igual en server y en cliente.

| Superficie | Dónde | Por qué |
|---|---|---|
| Panel | `AdminShell`, que ya llama `useComplex()` | cero subscriptores nuevos |
| Link público | `app/(open)/app/[slug]/layout.tsx` (server component) | ahí el fondo **entero** es el color de marca: un flash del índigo sería lo primero que ve el cliente |

El layout público resuelve el color con un `fetch` a `GET /public/c/:slug/complex`
(`revalidate: 300`, tag `complex:<slug>`). Si falla, devuelve `null` y quedan los tokens de
Clubix; la página sigue andando porque `OpenShell` hace su propia query igual.

Al guardar desde `/admin/settings/appearance`, el panel llama al route handler interno
`POST /api/revalidate-branding`, que verifica contra `GET /complex` que el slug pertenece al
admin de la sesión y hace `revalidateTag('complex:<slug>', { expire: 0 })`. Así el color nuevo
queda listo para la próxima visita sin esperar los 5 minutos de `revalidate`, y sin abrir la
cache a sesiones ajenas.

En el panel queda un flash de un frame **solo en recarga dura**, la misma ventana que ya tiene el
nombre del complejo en la barra lateral. Se puede cerrar escribiendo los colores en una cookie al
guardar y leyéndola desde `app/(admin)/layout.tsx`; no está hecho.

### Cascada

La hoja generada **no gana por especificidad sino por orden de documento**: sus selectores tienen
la misma que los de `globals.css` (`:root` = 0,1,0; los sub-scopes envueltos en `:where(...)` =
0,0,0) y aparecen después. Por eso los selectores se copian **textuales** a `SELECTORS` en
`theme.ts` — si acá dijera solo `.bg-card`, un elemento con `[data-surface='card']` se quedaría
con los tokens del archivo.

El `<style>` nunca lleva `precedence`: React iza a `<head>` los que lo declaran, y ahí podría
caer antes de la hoja de Tailwind. Se queda inline, igual que el `<style>` de la fuente display
en `app/(open)/app/layout.tsx`.

**Un complejo sin colores propios no inyecta nada** (`buildComplexThemeCss` devuelve `''`): los
valores afinados a mano de `globals.css` quedan intactos.

## El logo

### Dónde se ve

Un solo componente, `ComplexMark` (`src/components/layout/ComplexMark.tsx`), resuelve las tres
ramas en todas las superficies: `Skeleton` mientras carga el complejo, la imagen del logo, o el
ícono de fallback en el cuadrado `bg-highlight`. Es la misma cadena que ya usaba el nombre del
complejo en la barra lateral, así que el header no parpadea más de lo que ya parpadeaba.

| Superficie | Tamaño | Fallback |
|---|---|---|
| `AdminShell`: barra lateral, header móvil y drawer | 24 px, caja cuadrada | `VolleyballIcon` |
| `OpenShell`: header de `/app/[slug]` | 40 px de alto, ancho libre | `<Mark />`, la cancha en miniatura |

### Por qué en `/app` la caja no es fija — `fluid`

En el panel el logo es un ícono de navegación al lado del nombre y entra en el cuadrado de 24 px
que ya ocupaba el `VolleyballIcon`. En `/app` es otra cosa: es la marca del complejo al que el
cliente le está por pedir un turno, y es lo primero que ve. Va a 40 px sobre un header de 64.

Con una caja de proporción fija ese alto no se aprovecha, porque el logo lo sube el complejo y
puede venir con cualquier proporción: `object-contain` en una caja apaisada de 28×18 — la que
pedía el ícono de la cancha — deja un logo cuadrado en 18 px, y una caja cuadrada deja un wordmark
de 3:1 en un tercio del alto. Por eso `ComplexMark` toma `fluid`: la caja fija **solo el alto** y
el ancho lo pone el logo, con un `max-w` de 128 px para que un wordmark muy ancho no le coma el
lugar al nombre (ahí sí se achica, con `object-contain`, en vez de recortarse).

El precio es que el ancho no se conoce hasta que la imagen carga. El `Skeleton` reserva un
cuadrado — la proporción más común — y los atributos `width`/`height` del `<img>` son cuadrados
por lo mismo: con un logo cuadrado no hay corrimiento, y con un wordmark el nombre se corre una
vez, en el mismo frame en que aparece, que es cuando el header todavía se está armando.

Se renderiza con `next/image` y **`unoptimized`**, igual que `CourtImage`: es una marca de ~40 px,
el optimizador no ahorra nada, `sharp` no está construido en la web, y `unoptimized` saltea
también el chequeo de `images.remotePatterns` — así el host del bucket no tiene que entrar en
`next.config.ts` como una env horneada en el build.

El layout público sigue resolviendo **solo los colores** en el server: ahí el fondo entero es el
color de marca y un flash del índigo sería lo primero que ve el cliente. El logo es un ícono al
lado de un nombre que ya aparece con `Skeleton`, así que viaja por la query de `OpenShell` y no
necesita plomería nueva.

### Dónde vive el archivo

En un **bucket público de Supabase Storage**. La base sigue siendo el Postgres de siempre;
Supabase entra solo como almacenamiento de objetos. La web **nunca** habla con Supabase: sube el
archivo a nuestra API (`POST /admin/complex/logo`, multipart) y la API lo guarda con su
`service_role` key, que no sale del servidor. Detalle del módulo, límites y validación en
[`api/docs/18-storage.md`](../../api/docs/18-storage.md).

El bucket es público porque el logo lo ven clientes sin cuenta, igual que los colores: firmar cada
lectura agregaría latencia para proteger algo que de todas formas está a la vista.

## Seguridad

`parseHex` devuelve `null` para todo lo que no sea `#rrggbb`, y el generador solo interpola
números que calculó. Un valor corrupto en la base degrada a la paleta por defecto; no puede
cerrar el `<style>` ni inyectar CSS.

`logoUrl` **no es editable por el admin**: no está en `UpdateComplexDto`, así que un
`PATCH /admin/complex { logoUrl }` es `400`. La única forma de cambiarlo es subir un archivo, y la
URL la arma la API a partir de su propio bucket. **SVG no se acepta**: es markup ejecutable subido
por un usuario y servido desde un dominio; aceptarlo convertiría el bucket en un vector de
XSS/phishing. La API tampoco le cree al `Content-Type` que manda el navegador — mira los primeros
bytes del archivo.

## Fuera de alcance

- **Modo oscuro**: los bloques `.dark` de `globals.css` existen pero no hay `ThemeProvider`
  montado, así que el generador no los emite. `ComplexThemeTokens` admite sumarlos el día que se
  monte.
- **Normalizar el logo**: se sirve el archivo tal cual subió el admin, con el tope de 2 MB. Meter
  `sharp` en la API para bajarlo a un WebP de 512 px es la mejora obvia, pero es una dependencia
  nativa más en el build.
- **Logo en los mensajes de WhatsApp**: los avisos siguen siendo texto plano.
- **Logo como favicon / imagen de preview** del link público.
- **Colores por deporte**: `features/courts/sportSurface.ts` tiene el de pádel en el matiz del
  índigo (`oklch(0.5 0.13 268.6)`), así que con una marca roja la miniatura de pádel queda azul
  entre todo lo demás rojo. Es identidad de deporte, no de marca: se deja como está.

## Si se toca `globals.css`

Esos valores son el **default** de Clubix; un complejo con colores propios los pisa con la hoja
de `lib/theme.ts`, que respeta las mismas reglas. **Si se agrega un token de marca al archivo,
hay que agregarlo también al generador**, o ese token se va a quedar en índigo para todos los
complejos que eligieron su color.
