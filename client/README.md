<!--
  Documentación de la pantalla de login "Portal de votación" del cliente.
  Explica ejecución, estructura, design tokens, recursos y decisiones de implementación.
-->
# Portal de votación — Carnavales Goyanos

Cliente responsive de Carnavales Goyanos, construido con **React + Vite +
CSS Modules**. Incluye acceso con Better Auth y OTP, panel administrativo con
asistente por etapas y consulta de resultados, planillas del Jurado con soporte
sin conexión y Mesa de Escribano (cierre de noche, penalizaciones digitales,
cierre total y resultados/publicación).

> **Autoridad:** el cliente valida entradas y estados para mejorar la experiencia
> de uso, pero la API y PostgreSQL son siempre la autoridad de permisos,
> inmutabilidad e integridad.

---

## Ejecución

Requisitos: Node.js 22 LTS o superior (se recomienda una versión LTS; las dependencias de prueba declaran soporte para Node 22/24/26).

```bash
cd client
npm install
npm run dev        # servidor de desarrollo de Vite
npm test           # pruebas con Vitest + Testing Library
npm run build      # bundle de producción (validado por CI)
```

### Acceso

El cliente usa la API de autenticación para iniciar sesión, validar el OTP y
recuperar contraseñas. Usá una cuenta de desarrollo creada por el flujo de
bootstrap o invitación; consultá la [guía de uso](../docs/user-guide.md).

---

## Árbol de carpetas

```text
client/
├── index.html                  Documento HTML de entrada, lang="es" y montaje de #root.
├── package.json                Dependencias, scripts de Vite/Vitest y metadatos del cliente.
├── package-lock.json           Lockfile generado por npm para instalaciones reproducibles.
├── vite.config.js              Configuración de Vite y del entorno de pruebas jsdom.
├── README.md                   Este documento: ejecución, arquitectura, tokens y flujos.
└── src/
    ├── main.jsx                Monta React, importa tokens y estilos globales.
    ├── App.jsx                 Composición raíz: acceso, selección de rol o panel activo.
    ├── styles/
    │   ├── tokens.css          Fuente única de colores, radios, eco, opacidad y tipografía.
    │   └── global.css          Reset, tipografía base y foco visible.
    ├── test/
    │   └── setup.js            Setup de Vitest: jest-dom y limpieza del DOM.
    ├── img/
    │   └── icons/              Recursos gráficos del login (isotipo, logotipo blanco, pluma).
    ├── components/
    │   ├── Button/             Botón reutilizable con variantes primary/error/secondary.
    │   └── Modal/              Modal accesible (portal, overlay, Escape y focus trap) y ErrorModal.
    └── features/
        ├── auth/               LoginPage, BrandPanel, LoginCard, FeatherBackground, AccessCodeModal,
        │                       invitaciones, recuperación/restablecimiento y cliente de auth real.
        ├── admin/              PanelAdministracion con barra lateral y tres vistas: Panel de control
        │   │                   (Mis eventos), Asignaciones y Personas y accesos.
        │   ├── ediciones/      Asistente en 4 etapas (ConfiguracionEdicion, PasoReglamento —incluye
        │   │                   categorías de rubro—, PasoPadron —incluye integrantes de sujetos GRUPO
        │   │                   y representación textual del sujeto—, PasoOrdenSalida,
        │   │                   PasoPlanillaYHabilitacion, PasoOperacionEnVivo) y PlanillasNoche.
        │   ├── asignaciones/   PanelAsignaciones (altas, revocaciones, suplencias y relevos) en su propia vista.
        │   └── usuarios/       PanelUsuarios y PanelInvitaciones en Personas y accesos.
        ├── jurado/             PanelJurado (flujo paso a paso con confirmación por voto y logo de comparsa),
        │                       RecepcionPlanilla y persistencia local offline (planilla-local.js).
        ├── escribano/          PanelEscribano con barra lateral (Cierre de noche, PenalizacionesEscribano,
        │                       Cierre total y acceso a Resultados y publicación).
        └── resultados/         ResultadosEdicion (cálculo, resolución manual de empates, publicación y
                                consulta post-cierre compartida por Escribano y Administración).
```

---

## Design tokens

Todos los valores viven en `src/styles/tokens.css`. Los CSS Modules los consumen mediante `var(--token)`; no se declaran colores literales en los componentes.

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-rose` | `#e91e63` | Fondo general y tarjeta magenta opaca |
| `--color-coral` | `#ff5252` | Plumas, bordes de campos/modales, enlaces y botón de error |
| `--color-blue` | `#3f51b5` | Botones Ingresar y Enviar |
| `--color-yellow` | `#ffc107` | Título "Portal de votación" |
| `--color-blue-dark` | `#283593` | Eco de los botones principales |
| `--color-coral-dark` | `#c62828` | Eco del botón de error y texto de validación |
| `--color-secondary-echo` | `#d8c5cb` | Eco del botón secundario blanco |
| `--color-ink` | `#2b1520` | Texto principal sobre superficies claras |
| `--color-ink-placeholder` | `#8a6a76` | Placeholder `email@example.com` |
| `--glass-card-alpha` | `0.6` | Opacidad ajustable de la tarjeta blanca |
| `--color-glass-card` | `rgba(255,255,255,0.6)` | Fondo translúcido de la tarjeta de login |
| `--color-overlay` | `rgba(48,8,26,0.62)` | Capa oscura detrás de los modales |
| `--font-size-link` | `1.1875rem` (19px) | Enlaces coral en negrita; habilita el umbral AA de texto grande |
| `--radius-card` | `50px` | Tarjetas y modales |
| `--radius-button` | `12px` | Todos los botones |
| `--radius-field` | `12px` | Campos Email y Contraseña |
| `--radius-code-cell` | `12px` | Casillas del código de acceso |
| `--echo-offset` | `4px` | Desplazamiento X/Y del eco de botones |
| `--echo-offset-x` / `--echo-offset-y` | `4px` / `4px` | Ejes del `box-shadow` sólido |
| `--page-gutter` | `clamp(20px, 4vw, 56px)` | Margen exterior responsive |
| `--card-padding` | `clamp(28px, 3.4vw, 52px)` | Padding interno de tarjetas y modales |

Los radios se expresan siempre en píxeles, nunca en porcentaje, para que escalen con el diseño.

---

## Cómo se aplica #ff5252 a la pluma

La pluma original es magenta y **no se edita el archivo**. `FeatherBackground` la utiliza como **máscara alfa**:

```css
background-color: var(--feather-tint); /* #ff5252 */
-webkit-mask-image: url('pluma_magenta_fondo_patron.webp');
mask-image: url('pluma_magenta_fondo_patron.webp');
mask-size: contain;
```

El WebP tiene fondo transparente. La máscara conserva únicamente la silueta y el relleno se pinta con `#ff5252`; por eso el magenta del archivo nunca aparece en pantalla. Se incluyen las propiedades `-webkit-mask-*` para navegadores basados en WebKit.

La distribución de las 30 plumas se genera con un PRNG mulberry32 de semilla fija (`seededRandom.js`). Esto produce una composición que parece aleatoria (tamaños, rotaciones, volteos y opacidades variables) pero es estable entre renders y pruebas. Las posiciones van de `-8%` a `108%` para que algunas plumas queden cortadas por los bordes, como pide el diseño.

---

## Recursos gráficos

| Archivo | Dónde se usa | Tratamiento |
| --- | --- | --- |
| `isotipo.webp` | Parte superior de la tarjeta blanca, centrado | Se muestra tal cual, con `alt=""` decorativo |
| `logotipo_monocromatico_blanco.webp` | Tarjeta magenta izquierda, encima del título | Se muestra tal cual, blanco |
| `pluma_magenta_fondo_patron.webp` | Fondo de toda la pantalla | Máscara alfa recoloreada a `#ff5252` |
| `logotipo.webp` | **No se usa** | El logotipo completo a color no forma parte del login |

El isotipo conserva los colores de la ilustración original provista (incluye un verde); no se recolorea porque la especificación solo exige el cambio de la pluma.

---

## Comportamiento y accesibilidad

- El email se valida con formato antes de llamar a la autenticación; los errores se muestran junto al campo con `role="alert"`.
- Credenciales incorrectas → `ErrorModal` ("Error", "Email y/o contraseña incorrecto", enlace coral y botón Aceptar coral).
- Credenciales correctas → `AccessCodeModal` con el email enmascarado (`a*****@*******.com`).
- Las cinco casillas aceptan un dígito, avanzan el foco automáticamente, retroceden con Backspace, navegan con flechas y permiten pegar el código completo.
- Los modales usan `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, overlay oscuro, cierre con Escape y foco atrapado; al cerrarse, restauran el foco en el disparador.
- El botón de envío usa `aria-disabled` durante la espera para no perder el foco; el guard interno evita envíos duplicados.
- Los formularios tienen `noValidate` porque la validación y los mensajes son propios del componente.
- La paleta es fija por identidad de marca. Los enlaces coral sobre blanco se muestran a 19px en negrita para alcanzar el umbral AA de texto grande (3:1); sobre la tarjeta translúcida rosada el contraste sigue siendo bajo. El título amarillo sobre rosa se refuerza con tamaño, peso y sombra de texto, pero no alcanza 3:1. Cualquier ajuste de contraste debe aprobarse como cambio de identidad visual.

## Planilla del jurado (P3–P4)

En una notebook o tablet, iniciá sesión con conexión y abrí la asignación de una
noche abierta. La planilla presenta tarjetas paso a paso por ítem (mostrando el
logo de la comparsa si fue cargado) con confirmación por voto y guardado local
en el navegador. Si se corta la red con la planilla abierta, podés seguir
puntuando y confirmar. Si todas las filas son informativas, podés confirmar sin
ingresar puntajes.

Al **Guardar y bloquear**, la planilla se guarda con un identificador de
operación estable y con la versión del reglamento. La interfaz deja de mostrar
los puntajes e indica **Pendiente de recepción** hasta guardar el acuse oficial.
El envío se reintenta de forma acotada mientras el panel está abierto; también
podés pulsar **Reintentar ahora**. Un conflicto detiene los reintentos y no
desbloquea la planilla.

Si recargás o cerrás la aplicación, necesitás conexión y acceso a la misma
asignación para volver a abrirla. Usá el mismo perfil del navegador y no borres
los datos del sitio. Hasta que el servidor la reciba, la única copia de una
planilla pendiente está en ese perfil. Las confirmaciones anteriores que no
guardaron la versión se conservan tal como están, sin enviarlas automáticamente.
Un borrador anterior, aún sin confirmar, se puede vincular después de revisar
manualmente los puntajes guardados y comprobar que corresponden a las filas
congeladas.

## Suplencias, Mesa de Escribano y resultados (P5–P6C)

- **Administración:** en **Ediciones** gestiona el ciclo de vida de cada evento
  (asistente en 4 etapas, retiro operativo y eliminación completa con modal),
  en **Asignaciones de jurado** registra y activa suplentes con traspaso
  auditado, y tras el cierre total puede consultar **Resultados** y puntajes
  detallados en solo lectura.
- **Escribano:** la **Mesa de Escribano** incluye una barra lateral por etapas
  con **Cierre de noche** (P5), **Penalizaciones digitales** (P6B), **Cierre
  total de la votación** (P6A) y **Resultados y publicación** (P6C: cálculo de
  snapshots versionados, resolución manual de empates con referencia de acta y
  publicación oficial). Ninguna vista expone puntajes antes del cierre total.
- **Actas oficiales (P6D):** la vista de resultados permite emitir versiones
  PDF/CSV con `operationId` estable, listarlas, descargarlas y verificar su
  hash SHA-256; la emisión y la verificación están disponibles según el rol de
  la sesión. Ver la
  [guía de operación](../docs/user-guide.md#6-operar-una-noche-de-votación).

## Estructura y convenciones

- `src/main.jsx` monta la aplicacion; `src/App.jsx` coordina sesion y pantallas.
- `src/features/<funcionalidad>/`: componentes y logica propios. Administracion agrupa subfuncionalidades (ediciones, usuarios, asignaciones).
- Cada componente tiene carpeta PascalCase con su JSX y, cuando existen, CSS Module y prueba asociada. Dentro de cada feature se crean `components/`, `hooks/`, `api/` y `utils/` solo cuando hay contenido.
- `src/components/`: UI reutilizable sin importar features; `src/shared/api/`: transporte/API compartida; `src/shared/utils/`: utilidades generales sin dependencias de features.
- Hooks y utilidades usan archivos kebab-case; componentes usan PascalCase. Imports relativos explicitos, sin nuevas dependencias ni barrels masivos.
- `src/assets/` y `src/styles/` conservan recursos y estilos globales. Los componentes extraidos del Jurado comparten el CSS Module del panel para conservar estilos y selectores.
- Vitest ejecuta `src/**/*.test.{js,jsx}` con setup en `src/test/`; node:test ejecuta `test/**/*.test.js` agrupados por funcionalidad. `npm test` ejecuta ambos runners; no se migra uno al otro.
- No cambiar claves ni formato de almacenamiento offline al reorganizar archivos. Mantener props, efectos, API y textos visibles.
