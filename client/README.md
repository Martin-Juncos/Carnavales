<!--
  Documentación de la pantalla de login "Portal de votación" del cliente.
  Explica ejecución, estructura, design tokens, recursos y decisiones de implementación.
-->
# Portal de votación — Carnavales Goyanos

Cliente responsive de Carnavales Goyanos, construido con **React + Vite +
CSS Modules**. Incluye acceso y OTP, paneles administrativos, planillas del
Jurado y cierre de noche del Escribano. Esta página también describe los
componentes visuales de inicio de sesión.

> **Alcance actual:** la autenticación y el OTP son simulados en el cliente (`src/lib/auth.js`) porque el contrato de autenticación real todavía no está integrado. Este login no es una barrera de seguridad: la API y PostgreSQL siguen siendo la autoridad.

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
├── .gitignore                  Excluye node_modules, dist, coverage y logs.
├── README.md                   Este documento: ejecución, tokens, recursos y decisiones.
├── CHANGELOG.md                Bitácora de creación y modificación de cada archivo.
└── src/
    ├── main.jsx                Monta React, importa tokens y estilos globales.
    ├── App.jsx                 Composición raíz: acceso o paneles según sesión y rol.
    ├── styles/
    │   ├── tokens.css          Fuente única de colores, radios, eco, opacidad y tipografía.
    │   └── global.css          Reset, fondo rosa, tipografía base y foco visible.
    ├── lib/
    │   ├── auth.js             Validación de email, enmascaramiento y mocks de auth/OTP.
    │   ├── seededRandom.js     PRNG mulberry32 para distribuir plumas de forma estable.
    │   └── auth.test.js        Pruebas de validación, máscara y credenciales demo.
    ├── test/
    │   └── setup.js            Setup de Vitest: jest-dom y limpieza del DOM.
    ├── img/
    │   └── icons/
    │       ├── isotipo.webp                        Isotipo del formulario (tarjeta blanca).
    │       ├── logotipo_monocromatico_blanco.webp  Logotipo blanco de la tarjeta magenta.
    │       ├── pluma_magenta_fondo_patron.webp     Pluma usada como máscara del fondo.
    │       └── logotipo.webp                       Recurso NO utilizado en el login.
    └── components/
        ├── LoginPage/
        │   ├── LoginPage.jsx            Orquesta composición, modales y estado de autenticación.
        │   ├── LoginPage.module.css     Layout de tarjetas superpuestas y comportamiento responsive.
        │   └── LoginPage.test.jsx       Pruebas de validación, modales, OTP y foco.
        ├── BrandPanel/
        │   ├── BrandPanel.jsx           Tarjeta magenta opaca con logotipo y título amarillo.
        │   └── BrandPanel.module.css    Fondo rosa, radio 50px y tipografía del título.
        ├── LoginCard/
        │   ├── LoginCard.jsx            Formulario Email/Contraseña, validación y envío.
        │   └── LoginCard.module.css     Tarjeta translúcida, campos blancos y bordes coral.
        ├── FeatherBackground/
        │   ├── FeatherBackground.jsx    Genera y renderiza 30 plumas pseudoaleatorias.
        │   └── FeatherBackground.module.css  Máscara alfa + relleno coral de cada pluma.
        ├── Button/
        │   ├── Button.jsx               Botón reutilizable con variantes primary/error/secondary.
        │   └── Button.module.css        Radios de 12px y efecto eco sólido de 4px 4px.
        └── Modal/
            ├── Modal.jsx                Modal base: portal, overlay, Escape y focus trap.
            ├── Modal.module.css         Fondo oscuro y tarjeta blanca con borde coral.
            ├── ErrorModal.jsx           Modal de error reutilizable con Aceptar coral.
            ├── ErrorModal.module.css    Layout del mensaje, enlace y acción.
            ├── AccessCodeModal.jsx      Cinco casillas, auto-avance, pegado y reenvío.
            └── AccessCodeModal.module.css  Casillas coral, estados y acción azul.
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
noche abierta. El navegador guarda cada puntuación en este perfil. Si se corta
la red con la planilla abierta, podés seguir puntuando y confirmar.
Si todas las filas son informativas, podés confirmar sin ingresar puntajes.

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

## Suplencias y cierre de noche (P5)

En **Asignaciones de jurado**, Administración puede registrar y activar
suplentes con confirmación explícita. Si el dispositivo del jurado activo
ya abrió la planilla para editar, debe congelar el borrador y confirmar el
acuse del servidor. El suplente solo completa las filas que faltan.

En **Cierre de noche**, el Escribano consulta el estado y confirma el cierre.
La API vuelve a comprobar los acuses esperados. El panel no muestra puntajes
ni conteos y no ofrece cierre total ni resultados. Ver la
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
