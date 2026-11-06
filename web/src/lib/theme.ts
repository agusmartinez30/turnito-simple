/**
 * Colores de marca por complejo (docs/19-branding.md).
 *
 * `globals.css` ya es la salida de un generador calculado a mano: el índigo #1800AC es
 * `oklch(0.344 0.228 268.603)` y las rampas del sidebar y de la superficie pública son
 * desplazamientos fijos de L con decaimiento de croma sobre ese primario (ver `RAMP`).
 * Este módulo escribe ese generador y lo alimenta con el hex que eligió el complejo.
 *
 * La regla que decide qué token sale crudo y cuál ajustado:
 *
 * - **Crudo** donde la superficie es grande y la tinta puede adaptarse: `--sidebar`, el
 *   `--background` de /app, `--highlight`. Ahí el complejo ve su color exacto.
 * - **Ajustado por contraste** donde el token se usa como tinta o filete sobre una superficie
 *   clara: `--primary`, `--ring`, `--chart-1`, `--highlight-strong`. Ahí manda la legibilidad.
 *   Es la misma doctrina que en `globals.css` separó `--highlight` de `--highlight-strong`.
 *
 * Los neutros se re-tiñen con el matiz del primario pero conservan L y C literales de
 * `globals.css`: a C ≤ 0.048 rotar el matiz mueve la luminancia WCAG menos del 1%, así que
 * todos los pares AA ya verificados siguen valiendo sin re-auditar complejo por complejo.
 * Los estados de negocio (destructive / success / warning) no se tocan nunca: un mismo estado
 * se lee igual en el mostrador y en el teléfono del cliente.
 *
 * Si se agrega un token de marca a `globals.css`, hay que agregarlo también acá.
 */

export interface Oklch {
  L: number;
  C: number;
  H: number;
}

/** Marca por defecto: índigo #1800AC + lima #ABEA5C. */
export const CLUBIX_PRIMARY = '#1800ac';
export const CLUBIX_SECONDARY = '#abea5c';

const HEX = /^#[0-9a-f]{6}$/i;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/**
 * Hex → OKLCh, ya mapeado a gamut sRGB. Devuelve `null` para cualquier cosa que no sea
 * `#rrggbb`: es la única barrera entre un valor corrupto en la base y el CSS que inyectamos,
 * así que nada que no haya pasado por acá llega a la hoja.
 */
export function parseHex(hex: string | null | undefined): Oklch | null {
  if (!hex || !HEX.test(hex)) return null;
  const n = Number.parseInt(hex.slice(1), 16);
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return fit({
    L,
    C: Math.hypot(A, B),
    H: (Math.atan2(B, A) * 180) / Math.PI,
  });
}

function linearRgb({ L, C, H }: Oklch): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c: Oklch) =>
  linearRgb(c).every((v) => v >= -0.0001 && v <= 1.0001);

/**
 * Baja el croma a L y H fijos hasta entrar en sRGB. Lo hacemos acá y no en el browser a
 * propósito: si el browser clampara por su cuenta, el contraste que medimos en JS describiría
 * un color distinto del que se pinta.
 */
function fit(c: Oklch): Oklch {
  const out = {
    L: clamp01(c.L),
    C: Math.max(0, c.C),
    H: ((c.H % 360) + 360) % 360,
  };
  if (inGamut(out)) return out;
  let lo = 0;
  let hi = out.C;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...out, C: mid })) lo = mid;
    else hi = mid;
  }
  return { ...out, C: lo };
}

/** Luminancia relativa de WCAG 2.x. No confundir con la L de OKLab. */
function luminance(c: Oklch): number {
  const [r, g, b] = linearRgb(c).map(clamp01);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre dos colores. */
export function contrast(a: Oklch, b: Oklch): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Tinta legible **encima** de `bg`, teñida con `hue`. Arranca por el candidato que más
 * contraste da (casi blanco vs tinta oscura) y lo empuja hasta llegar a `min`. Generaliza la
 * regla de `globals.css`: sobre el lima la tinta sale oscura sola, porque es la que gana.
 */
function ink(bg: Oklch, hue: number, min = 4.5): Oklch {
  const light = fit({ L: 0.985, C: 0.012, H: hue });
  const dark = fit({ L: 0.2, C: 0.04, H: hue });
  let out = contrast(bg, light) >= contrast(bg, dark) ? light : dark;
  const step = out.L > 0.5 ? 0.015 : -0.015;
  for (let i = 0; i < 60 && contrast(bg, out) < min; i++) {
    out = fit({ ...out, L: clamp01(out.L + step) });
  }
  return out;
}

/**
 * Mismo matiz y croma, L empujada hasta pasar `min` contra `bg`. Es la razón de ser de
 * `--highlight-strong` en `globals.css`, generalizada a cualquier color de marca.
 */
function against(c: Oklch, bg: Oklch, min: number): Oklch {
  let out = fit(c);
  if (contrast(out, bg) >= min) return out;
  const step = luminance(bg) > 0.18 ? -0.01 : 0.01;
  for (let i = 0; i < 100 && contrast(out, bg) < min; i++) {
    out = fit({ L: clamp01(out.L + step), C: c.C, H: c.H });
  }
  return out;
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** `oklch(L C H)` con la misma precisión que usa `globals.css`. */
function css(c: Oklch): string {
  return `oklch(${round(c.L, 3)} ${round(c.C, 3)} ${round(c.H, 3)})`;
}

/**
 * ΔL y factor de croma calcados de `globals.css`: reproducen `--sidebar-accent` (0.39/0.220),
 * `--sidebar-active` (0.495/0.185) y los neutros de la superficie /app a partir del primario.
 */
const RAMP = {
  sidebarAccent: { dL: 0.046, cf: 0.965 },
  sidebarActive: { dL: 0.151, cf: 0.811 },
  openMuted: { dL: 0.066, cf: 0.921 },
  openAccent: { dL: 0.111, cf: 0.855 },
} as const;

export interface ThemeAudit {
  /** Tinta del sidebar contra el sidebar. */
  sidebarInk: number;
  /** Tinta de /app contra el canvas (misma derivación que `sidebarInk`). */
  canvasInk: number;
  /** Acento de /app contra el canvas. */
  canvasAccent: number;
  /** `--primary` contra el fondo del panel. */
  primaryOnSurface: number;
  /** `--highlight-strong` contra el fondo del panel. */
  highlightStrong: number;
  /** El primario elegido es claro: sidebar y canvas usan tinta oscura. */
  lightBrand: boolean;
  /** Primario y secundario casi no se distinguen. */
  lowSeparation: boolean;
  warnings: string[];
}

type Tokens = Record<string, string>;

export interface ComplexThemeTokens {
  /** `:root` */
  root: Tokens;
  /** `body:has([data-surface='open'])` */
  open: Tokens;
  /** La tarjeta clara sobre el canvas de /app. */
  openCard: Tokens;
  /** Diálogos y menús sobre el canvas de /app. */
  openPopover: Tokens;
  audit: ThemeAudit;
}

/**
 * Deriva el set completo de tokens. Siempre devuelve valores concretos: un hex inválido o
 * ausente cae a la paleta Clubix.
 */
export function buildComplexTheme(
  primaryColor: string | null | undefined,
  secondaryColor: string | null | undefined,
): ComplexThemeTokens {
  const brand = parseHex(primaryColor) ?? (parseHex(CLUBIX_PRIMARY) as Oklch);
  const accent =
    parseHex(secondaryColor) ?? (parseHex(CLUBIX_SECONDARY) as Oklch);
  const H = brand.H;

  const surface = fit({ L: 0.981, C: 0.006, H }); // --background del panel
  const white = { L: 1, C: 0, H: 0 };

  /** Si el primario es oscuro las rampas aclaran; si es claro, oscurecen. */
  const dir = brand.L < 0.6 ? 1 : -1;
  const ramp = ({ dL, cf }: { dL: number; cf: number }) =>
    fit({ L: brand.L + dir * dL, C: brand.C * cf, H });

  const primaryInk = against(brand, surface, 4.5); // tinta sobre superficie clara
  const highlightStrong = against(accent, surface, 3.5);
  const brandInk = ink(brand, H); // tinta sobre el color de marca pleno
  const brandMuted = against(
    fit({ L: brandInk.L - dir * 0.145, C: 0.06, H }),
    brand,
    4.5,
  );
  const brandAccent = against(accent, brand, 4.5); // acento sobre el color de marca

  /** Los bordes de /app y del sidebar son alfa puro: sobre un canvas claro el blanco desaparece. */
  const alpha = luminance(brand) < 0.35 ? '1 0 0' : '0 0 0';

  const root: Tokens = {
    '--background': css(surface),
    '--foreground': css(fit({ L: 0.2, C: 0.04, H })),
    '--card-foreground': css(fit({ L: 0.2, C: 0.04, H })),
    '--popover-foreground': css(fit({ L: 0.2, C: 0.04, H })),
    '--primary': css(primaryInk),
    '--primary-foreground': css(ink(primaryInk, H)),
    '--secondary': css(fit({ L: 0.96, C: 0.011, H })),
    '--secondary-foreground': css(fit({ L: 0.315, C: 0.05, H })),
    '--muted': css(fit({ L: 0.96, C: 0.011, H })),
    '--muted-foreground': css(fit({ L: 0.49, C: 0.048, H })),
    '--accent': css(fit({ L: 0.935, C: 0.019, H })),
    '--accent-foreground': css(fit({ L: 0.315, C: 0.05, H })),
    '--highlight': css(accent),
    '--highlight-foreground': css(ink(accent, H)),
    '--highlight-strong': css(highlightStrong),
    '--warning-foreground': css(fit({ L: 0.2, C: 0.04, H })),
    '--border': css(fit({ L: 0.925, C: 0.016, H })),
    '--input': css(fit({ L: 0.63, C: 0.035, H })),
    '--ring': css(primaryInk),
    '--chart-1': css(primaryInk),
    '--chart-2': css(highlightStrong),
    '--chart-3': css(fit({ L: 0.6, C: 0.2, H })),
    '--sidebar': css(brand),
    '--sidebar-foreground': css(brandInk),
    '--sidebar-muted-foreground': css(brandMuted),
    '--sidebar-primary': css(brandAccent),
    '--sidebar-primary-foreground': css(ink(brandAccent, H)),
    '--sidebar-accent': css(ramp(RAMP.sidebarAccent)),
    '--sidebar-accent-foreground': css(brandInk),
    '--sidebar-active': css(ramp(RAMP.sidebarActive)),
    '--sidebar-border': `oklch(${alpha} / 14%)`,
    '--sidebar-ring': css(brandAccent),
  };

  const open: Tokens = {
    '--background': css(brand),
    '--foreground': css(brandInk),
    '--card-foreground': css(fit({ L: 0.225, C: 0.045, H })),
    '--popover-foreground': css(fit({ L: 0.225, C: 0.045, H })),
    '--primary': css(brandAccent),
    '--primary-foreground': css(ink(brandAccent, H)),
    '--secondary': css(ramp(RAMP.openMuted)),
    '--secondary-foreground': css(brandInk),
    '--muted': css(ramp(RAMP.openMuted)),
    '--muted-foreground': css(brandMuted),
    '--accent': css(ramp(RAMP.openAccent)),
    '--accent-foreground': css(brandInk),
    '--border': `oklch(${alpha} / 22%)`,
    '--input': `oklch(${alpha} / 45%)`,
    '--ring': css(brandAccent),
  };

  /** Dentro de una superficie clara vuelve la tinta oscura y el primario como acento. */
  const onLight: Tokens = {
    '--foreground': css(fit({ L: 0.225, C: 0.045, H })),
    '--muted-foreground': css(fit({ L: 0.47, C: 0.05, H })),
    '--primary': css(primaryInk),
    '--primary-foreground': css(ink(primaryInk, H)),
    '--secondary': css(fit({ L: 0.955, C: 0.016, H })),
    '--secondary-foreground': css(fit({ L: 0.315, C: 0.05, H })),
    '--muted': css(fit({ L: 0.955, C: 0.016, H })),
    '--accent': css(fit({ L: 0.925, C: 0.035, H })),
    '--accent-foreground': css(fit({ L: 0.33, C: 0.1, H })),
    '--border': css(fit({ L: 0.9, C: 0.02, H })),
    '--input': css(fit({ L: 0.63, C: 0.035, H })),
  };

  const warnings: string[] = [];
  const lowSeparation =
    Math.abs(brand.L - accent.L) < 0.15 && hueGap(brand.H, accent.H) < 25;
  if (lowSeparation) {
    warnings.push(
      'El color secundario casi no se distingue del principal: los acentos van a perder fuerza.',
    );
  }
  if (contrast(brand, surface) < 4.5) {
    warnings.push(
      'Tu color principal es muy claro para textos y links sobre fondo blanco: ahí se usa una versión más oscura del mismo color. El color exacto se mantiene en la barra lateral y en el link para tus clientes.',
    );
  }
  if (contrast(accent, surface) < 3.5) {
    warnings.push(
      'El color secundario se oscurece cuando se usa como texto o filete sobre fondo claro. Como relleno (botones, badges) sale tal cual lo elegiste.',
    );
  }

  return {
    root,
    open,
    openCard: onLight,
    openPopover: { ...onLight, '--ring': css(primaryInk) },
    audit: {
      sidebarInk: contrast(brand, brandInk),
      canvasInk: contrast(brand, brandInk),
      canvasAccent: contrast(brand, brandAccent),
      primaryOnSurface: contrast(primaryInk, surface),
      highlightStrong: contrast(highlightStrong, white),
      lightBrand: brand.L >= 0.6,
      lowSeparation,
      warnings,
    },
  };
}

/** Distancia angular entre dos matices, en grados (0–180). */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Selectores copiados **textuales** de `globals.css`. La hoja generada no gana por
 * especificidad sino por orden de documento, así que tienen que coincidir carácter por
 * carácter: si acá dijera solo `.bg-card`, un `[data-surface='card']` se quedaría con los
 * tokens del archivo.
 */
const SELECTORS = {
  root: ':root',
  open: "body:has([data-surface='open'])",
  openCard:
    ":where(body:has([data-surface='open']) :is(.bg-card, [data-surface='card']))",
  openPopover: ":where(body:has([data-surface='open']) .bg-popover)",
} as const;

function rule(selector: string, tokens: Tokens): string {
  const body = Object.entries(tokens)
    .map(([key, value]) => `${key}:${value};`)
    .join('');
  return `${selector}{${body}}`;
}

/**
 * Cache por par de hex: el `<input type="color">` de la vista previa dispara un evento por
 * posición del cursor mientras se arrastra el selector.
 */
const sheets = new Map<string, string>();

function memo(key: string, make: () => string): string {
  const hit = sheets.get(key);
  if (hit !== undefined) return hit;
  if (sheets.size > 200) sheets.clear();
  const value = make();
  sheets.set(key, value);
  return value;
}

/**
 * Hoja completa para la app. Devuelve `''` cuando el complejo no eligió colores: ahí no
 * inyectamos nada y quedan los valores afinados a mano de `globals.css`.
 */
export function buildComplexThemeCss(
  primaryColor: string | null | undefined,
  secondaryColor: string | null | undefined,
): string {
  const primary = parseHex(primaryColor);
  const secondary = parseHex(secondaryColor);
  if (!primary && !secondary) return '';

  return memo(`app|${primaryColor}|${secondaryColor}`, () => {
    const theme = buildComplexTheme(primaryColor, secondaryColor);
    return [
      rule(SELECTORS.root, theme.root),
      rule(SELECTORS.open, theme.open),
      rule(SELECTORS.openCard, theme.openCard),
      rule(SELECTORS.openPopover, theme.openPopover),
    ].join('');
  });
}

/**
 * Hoja para la vista previa, bajo un selector propio. Al revés que `buildComplexThemeCss`,
 * acá los `null` sí resuelven a la paleta Clubix: la vista previa tiene que pintar algo.
 * El canvas público se representa con `[data-preview-surface='open']` adentro del scope.
 */
export function buildComplexThemeScopeCss(
  primaryColor: string | null | undefined,
  secondaryColor: string | null | undefined,
  selector: string,
): string {
  return memo(`${selector}|${primaryColor}|${secondaryColor}`, () => {
    const theme = buildComplexTheme(primaryColor, secondaryColor);
    const open = `${selector} [data-preview-surface='open']`;
    return [
      rule(selector, theme.root),
      rule(open, theme.open),
      rule(
        `:where(${open} :is(.bg-card, [data-surface='card']))`,
        theme.openCard,
      ),
    ].join('');
  });
}
