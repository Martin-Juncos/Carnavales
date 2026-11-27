<!--
  Documentación de la API local de desarrollo para el Portal de votación.
  Explica alcance, ejecución, endpoints, configuración y límites de seguridad.
-->
# API local — Carnavales Goyanos

API de desarrollo para probar el login del **Portal de votación** sin depender de la API real ni de PostgreSQL. Implementa el flujo email/contraseña + código de acceso de cinco dígitos y mantiene desafíos y sesiones **en memoria**.

> **Alcance:** solo autenticación de demostración para desarrollo local. No implementa votación, roles reales, persistencia ni reglas del reglamento. No usar en producción. La API de `api/` y PostgreSQL siguen siendo la autoridad del sistema.

---

## Ejecución

Requisitos: Node.js 22.9 o superior. No tiene dependencias externas (`npm install` no es necesario).

```bash
cd server-local
npm start        # API en http://127.0.0.1:4000
npm run dev      # igual, con reinicio automático al cambiar archivos
npm test         # pruebas de integración con node:test
```

El cliente Vite reenvía `/api` a `http://127.0.0.1:4000` (ver `client/vite.config.js`).

### Cuenta y código de acceso

| Dato | Valor |
| --- | --- |
| Email | `jurado@carnavalesgoyanos.gob.ar` |
| Contraseña | `carnaval2027` |
| Código | Se imprime en la terminal al iniciar sesión |

Ejemplo de salida al iniciar sesión:

```text
[server-local] Código de acceso para jurado@carnavalesgoyanos.gob.ar: 48213 (vence 14:32:10)
```

Para una demo sin mirar la terminal, definir `DEV_ACCESS_CODE=12345` en `.env` (copiar `.env.example`).

---

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Estado del servicio. |
| `POST` | `/api/auth/login` | Valida credenciales y emite un desafío de código. |
| `POST` | `/api/auth/verify-code` | Verifica el código y emite una sesión Bearer. |
| `POST` | `/api/auth/resend-code` | Reenvía un código nuevo con cooldown. |
| `GET` | `/api/auth/session` | Devuelve la sesión vigente (`Authorization: Bearer <token>`). |
| `POST` | `/api/auth/logout` | Invalida la sesión. |

### `POST /api/auth/login`

```json
{ "email": "jurado@carnavalesgoyanos.gob.ar", "password": "carnaval2027" }
```

Respuesta `200`:

```json
{
  "challengeId": "…",
  "maskedEmail": "j*****@*****************.***.ar",
  "expiresAt": "2026-11-24T17:35:00.000Z",
  "resendAvailableAt": "2026-11-24T17:31:00.000Z"
}
```

Credenciales inválidas → `401` con `{ "error": "credenciales_invalidas", "message": "Email y/o contraseña incorrecto." }`.

### `POST /api/auth/verify-code`

```json
{ "challengeId": "…", "code": "48213" }
```

Respuesta `200`:

```json
{
  "token": "…",
  "user": { "email": "jurado@carnavalesgoyanos.gob.ar", "role": "jurado" },
  "expiresAt": "2026-11-25T01:30:00.000Z"
}
```

Código incorrecto → `401`; desafío inexistente → `404`; código vencido → `410`; intentos agotados → `429`. Un replay del mismo código ya verificado devuelve la misma sesión (idempotente).

### `POST /api/auth/resend-code`

```json
{ "challengeId": "…" }
```

Respuesta `200`: `{ "sent": true, "expiresAt": "…", "resendAvailableAt": "…" }`. Antes del cooldown responde `429` (`reenvio_en_espera`).

---

## Configuración

Se lee de variables de entorno o de un archivo `.env` opcional (ver `.env.example`):

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interfaz de escucha. |
| `PORT` | `4000` | Puerto HTTP. |
| `CORS_ORIGINS` | Vite en 5173/4173 | Orígenes permitidos, separados por coma. |
| `DEMO_EMAIL` | `jurado@carnavalesgoyanos.gob.ar` | Cuenta demo. |
| `DEMO_PASSWORD` | `carnaval2027` | Contraseña demo. |
| `DEV_ACCESS_CODE` | vacío | Si se define, fija el código de acceso. |
| `CHALLENGE_TTL_MS` | 300000 (5 min) | Vigencia del desafío. |
| `RESEND_COOLDOWN_MS` | 60000 (1 min) | Espera mínima entre reenvíos. |
| `MAX_CODE_ATTEMPTS` | 5 | Intentos por código. |
| `SESSION_TTL_MS` | 28800000 (8 h) | Vigencia de la sesión. |
| `MAX_LOGIN_ATTEMPTS` | 10 | Intentos de login por ventana. |
| `LOGIN_WINDOW_MS` | 60000 (1 min) | Ventana del límite de login. |

---

## Estructura y decisiones

```text
server-local/
├── package.json          Scripts start/dev/test; sin dependencias.
├── .env.example          Variables disponibles.
├── .gitignore            Excluye .env y artefactos.
├── README.md             Este documento.
├── src/
│   ├── index.js          Arranque, impresión del código y cierre ordenado.
│   ├── config.js         Lectura de entorno con valores de desarrollo.
│   ├── app.js            Ruteo HTTP y manejo uniforme de errores.
│   ├── http.js           CORS, lectura de JSON y respuestas.
│   └── auth-service.js   Desafíos, códigos, sesiones y límites en memoria.
└── test/
    └── auth.test.js      Pruebas de integración del flujo completo.
```

- **Sin dependencias:** usa `node:http` y `node:crypto`; no requiere instalar paquetes ni compilar.
- **Contraseña:** comparación con `timingSafeEqual`; nunca se registra en logs.
- **Código:** se genera con `crypto.randomInt`; solo se imprime en terminal porque no hay envío de correo.
- **Idempotencia:** verificar dos veces el mismo desafío devuelve la misma sesión, útil para reintentos del cliente.
- **Sesiones:** token opaco de 32 bytes en `sessionStorage` del cliente; no se guarda en el repositorio.
- **Errores:** respuestas JSON uniformes `{ error, message, details? }`; los errores internos no exponen stack traces.
- **Límites:** rate limit de login por IP+email, máximo de intentos por código y cooldown de reenvío.

## Límites conocidos

- Todo vive en memoria: reiniciar el proceso invalida desafíos y sesiones.
- No hay envío de emails; el código se lee en la terminal.
- No hay persistencia, auditoría durable, recuperación de contraseña ni RBAC completo.
- No debe publicarse fuera de la máquina de desarrollo.
