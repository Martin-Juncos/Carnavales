# Cliente web

Cliente React/Vite para acceso con contraseña y OTP, invitaciones, recuperación
de contraseña, selección del rol activo y administración de usuarios, roles e
invitaciones.

## Desarrollo

```sh
npm ci
npm run dev
```

Vite sirve el cliente y reenvía `/api` y `/health` a
`http://127.0.0.1:3000`. Para usar otra dirección, define `API_ORIGIN`.
Inicia primero la API; consulta [su guía](../api/README.md).

## Pruebas

```sh
npm test
```

Para validar producción, ejecuta `npm run build`. El cliente no implementa aún
la experiencia de votación/PWA descrita en los documentos de diseño.
