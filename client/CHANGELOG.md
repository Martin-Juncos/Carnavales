<!--
  Bitácora cronológica de la pantalla de login "Portal de votación".
  Registra cada archivo creado o modificado, el cambio y su motivo.
-->
# Changelog — Cliente Carnavales Goyanos

Formato: `fecha — archivo — cambio — motivo`.

## 2026-11-18

### Configuración del cliente

- **`client/package.json`** — Creado. Define React 19, Vite, Vitest, Testing Library y los scripts `dev`, `build`, `preview`, `test` y `test:watch`. Es necesario para ejecutar y probar el cliente.
- **`client/package-lock.json`** — Creado por `npm install`. Fija el árbol de dependencias para instalaciones reproducibles.
- **`client/vite.config.js`** — Creado. Habilita React y configura Vitest con jsdom y el setup de pruebas. Permite testear componentes con CSS Modules.
- **`client/index.html`** — Creado. Documento de entrada en español, metadatos del portal y montaje de `#root`.
- **`client/.gitignore`** — Creado. Excluye `node_modules`, `dist`, `coverage` y logs para no versionar artefactos ni dependencias.

### Estilos y entrada

- **`client/src/styles/tokens.css`** — Creado. Centraliza la paleta, radios de 50px/12px, opacidad de la tarjeta (`0.6`), offset del eco (`4px`), sombras, tipografía y movimiento. Es la única fuente de design tokens.
- **`client/src/styles/global.css`** — Creado. Reset mínimo, fondo rosa, tipografía base, selección y foco visible; reduce animaciones con `prefers-reduced-motion`.
- **`client/src/main.jsx`** — Creado. Monta React en modo estricto e importa tokens antes de los estilos globales.
- **`client/src/App.jsx`** — Creado. Composición raíz que expone `LoginPage` mientras no existen rutas autenticadas.

### Utilidades

- **`client/src/lib/seededRandom.js`** — Creado. Implementa mulberry32 para distribuir plumas de forma pseudoaleatoria pero estable entre renders.
- **`client/src/lib/auth.js`** — Creado. Valida emails, enmascara direcciones, simula autenticación, verificación OTP y reenvío. Se aísla el mock para reemplazarlo por la API real.
- **`client/src/lib/auth.test.js`** — Creado. Pruebas de formato de email, máscara y credenciales demo.

### Componentes

- **`client/src/components/Button/Button.jsx`** — Creado. Botón reutilizable con `forwardRef` y variantes primary/error/secondary.
- **`client/src/components/Button/Button.module.css`** — Creado. Radios de 12px y efecto eco sólido con `box-shadow` de 4px 4px; al presionar, el botón ocupa el lugar del eco.
- **`client/src/components/FeatherBackground/FeatherBackground.jsx`** — Creado. Genera 30 plumas con tamaño, rotación, volteo, opacidad y posición deterministas; permite que los bordes las recorten.
- **`client/src/components/FeatherBackground/FeatherBackground.module.css`** — Creado. Usa el WebP como `mask-image` y lo rellena con `#ff5252`; la pluma original magenta no se pinta.
- **`client/src/components/BrandPanel/BrandPanel.jsx`** — Creado. Tarjeta magenta con logotipo blanco y título "Portal de votación" en amarillo.
- **`client/src/components/BrandPanel/BrandPanel.module.css`** — Creado. Fondo rosa opaco que tapa las plumas, radio 50px, tamaño del logotipo y sombra de texto del título.
- **`client/src/components/LoginCard/LoginCard.jsx`** — Creado. Tarjeta translúcida con isotipo, Email, Contraseña, Ingresar y enlace de recuperación; valida antes de autenticar.
- **`client/src/components/LoginCard/LoginCard.module.css`** — Creado. Vidrio blanco al 60%, campos blancos con borde coral de 1px, etiquetas arriba y estados de error.
- **`client/src/components/Modal/Modal.jsx`** — Creado. Modal base con portal, overlay, `role="dialog"`, `aria-modal`, cierre con Escape, focus trap y restauración de foco.
- **`client/src/components/Modal/Modal.module.css`** — Creado. Tarjeta blanca con borde coral, radio 50px, capa oscura y botón de cierre opcional.
- **`client/src/components/Modal/ErrorModal.jsx`** — Creado. Modal de error reutilizable con mensaje, enlace coral y botón Aceptar coral.
- **`client/src/components/Modal/ErrorModal.module.css`** — Creado. Layout centrado del mensaje, enlace y acción de ancho completo.
- **`client/src/components/Modal/AccessCodeModal.jsx`** — Creado. Cinco casillas con auto-avance, Backspace, flechas, pegado completo, validación de longitud, reenvío y verificación simulada.
- **`client/src/components/Modal/AccessCodeModal.module.css`** — Creado. Casillas coral de 12px, anillo de foco azul, estados de error/éxito y acción azul.
- **`client/src/components/LoginPage/LoginPage.jsx`** — Creado. Orquesta el fondo, las dos tarjetas y los modales; enmascara el email y conecta auth/OTP.
- **`client/src/components/LoginPage/LoginPage.module.css`** — Creado. Composición superpuesta en escritorio y apilada con solape en móvil; oculta el desborde de las plumas.
- **`client/src/components/LoginPage/LoginPage.test.jsx`** — Creado. Pruebas de validación de email, error de credenciales, apertura del OTP, pegado de cinco dígitos, cierre con Escape y restauración de foco.

### Pruebas y documentación

- **`client/src/test/setup.js`** — Creado. Añade matchers de jest-dom y limpia el DOM entre pruebas.
- **`client/README.md`** — Modificado (antes vacío). Documenta ejecución, credenciales demo, árbol de archivos, design tokens, recoloreado de la pluma, recursos usados, accesibilidad y pendientes.
- **`client/CHANGELOG.md`** — Creado. Este registro de cambios por archivo.

### Ajustes durante la verificación

- **`client/src/components/LoginCard/LoginCard.jsx`** — Modificado. Se cambió `disabled` por `aria-disabled` en el botón de ingreso para conservar el foco del disparador mientras se espera la autenticación; el guard interno sigue evitando envíos duplicados y el modal puede restaurar el foco correctamente.
- **`client/src/components/Modal/AccessCodeModal.jsx`** — Modificado. Se aplicó el mismo patrón `aria-disabled` al botón Enviar para no perder el foco durante la verificación y se selecciona el contenido de cada casilla al enfocarla, para poder reemplazar el dígito escribiendo.
- **`client/src/components/Button/Button.module.css`** — Modificado. Los estados hover/active excluyen `[aria-disabled='true']` y se agregó estilo de espera, evitando que un botón ocupado parezca interactivo.
- **`client/src/lib/auth.test.js`** — Modificado. Se corrigió la expectativa de la máscara para dominios con subdominio (`gob.ar`), que también se enmascara.
- **`client/src/styles/tokens.css`** — Modificado. Se eliminaron tokens declarados pero no utilizados (`--feather-mask-image`, `--color-rose-deep`, `--color-ink-soft`, `--font-size-lg`) y se agregó `--font-size-link` (19px) para que los enlaces coral alcancen el umbral AA de texto grande sobre blanco.
- **`client/src/components/LoginCard/LoginCard.module.css`** — Modificado. El enlace de recuperación usa `--font-size-link` para mejorar su contraste efectivo.
- **`client/src/components/Modal/ErrorModal.module.css`** — Modificado. El enlace de error usa `--font-size-link` por la misma razón.
- **`client/src/components/Modal/AccessCodeModal.module.css`** — Modificado. Se quitó el borde de 2px en estado inválido para respetar el borde coral de 1px, el enlace de reenvío usa `--font-size-link`, el email enmascarado pasa a bloque con `word-break` y se agregó un modo compacto de casillas para pantallas de 360px o menos.
- **`client/src/components/Modal/Modal.module.css`** — Modificado. En pantallas de 360px o menos el título reserva espacio lateral para no quedar debajo del botón de cierre.
- **`client/src/components/LoginPage/LoginPage.test.jsx`** — Modificado. Se agregó una prueba de auto-avance del foco entre casillas y se mantuvieron las pruebas de pegado, cierre y restauración de foco.
- **`client/index.html`** — Modificado. Se agregó el isotipo como favicon para evitar la petición 404 del navegador y reforzar la identidad del portal.
- **`client/README.md`** — Modificado. Se actualizó la tabla de tokens y la nota de contraste para reflejar el tamaño de 19px de los enlaces coral.
