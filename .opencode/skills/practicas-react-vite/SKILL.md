---
name: practicas-react-vite
description: Aplicar prácticas de React y rendimiento al crear, revisar o refactorizar componentes del cliente React 19 + Vite de este proyecto.
---

# Prácticas de React para Vite

Esta guía adapta principios de rendimiento de Vercel React Best Practices al
cliente React + Vite de Carnavales. No usar recomendaciones específicas de
Next.js, React Server Components ni APIs no presentes en el stack.

## Componentes y estado

- Mantén componentes enfocados; extrae subcomponentes cuando mejoren claridad o
  reutilización, no solo para perseguir un límite arbitrario de líneas.
- Define componentes en el ámbito del módulo, no dentro de otros componentes.
- Deriva valores simples durante el render en vez de duplicarlos en estado y
  sincronizarlos mediante efectos.
- Usa actualizaciones funcionales de estado cuando dependan del valor anterior.
- No agregues `memo`, `useMemo` o `useCallback` para expresiones triviales; úsalos
  solo cuando resuelvan trabajo medible o identidad referencial relevante.
- Coloca lógica de interacción en el manejador del evento que la origina; reserva
  `useEffect` para sincronizar con sistemas externos.

## Renderizado y experiencia

- Evita trabajo costoso en cada render; mide antes de agregar optimizaciones.
- En listas grandes, evita búsquedas repetidas innecesarias y considera una
  estructura `Map` o `Set` cuando corresponda.
- Usa renderizado condicional explícito (`condición ? ... : ...`) cuando `&&`
  pudiera mostrar accidentalmente `0` u otro valor.
- Conserva accesibilidad, estados de carga/error y mensajes claros al optimizar.
- No sacrifiques legibilidad ni corrección funcional por micro-optimizaciones.

## Red y tamaño del cliente

- Ejecuta en paralelo solicitudes independientes con `Promise.all`; conserva el
  orden cuando exista una dependencia real.
- Mantén las importaciones directas y evita incorporar dependencias pesadas sin
  necesidad concreta.
- Carga de forma diferida una parte realmente pesada solo si mejora el uso
  percibido y se maneja su estado de carga/error.
- Si se usa `localStorage` para información funcional, define y valida un formato
  versionado; no guardes secretos, tokens ni más datos de los necesarios.

## En este repositorio

- Revisa componentes y patrones existentes en `client/src/` antes de introducir
  nuevas abstracciones o dependencias.
- La aplicación usa JavaScript/JSX con React 19 y Vite; no supongas TypeScript,
  Tailwind, React Router, SWR ni una biblioteca de UI.
- Valida comportamientos con las pruebas existentes de `client/test/` y ejecuta
  `npm run build` si el cambio afecta al empaquetado.
- Respeta las reglas de autenticación, roles y seguridad de `AGENTS.md`; la
  interfaz no es la autoridad para permisos.

## Origen

Adaptación de `vercel-react-best-practices` de
[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills),
licencia MIT. La skill aparecía entre las más instaladas de skills.sh (más de
900 mil en la consulta de noviembre de 2026); el repositorio contaba con más de
34 mil estrellas.
