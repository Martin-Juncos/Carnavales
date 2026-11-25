/*
 * Servidor HTTP de la API local.
 * Expone endpoints de salud y del flujo de autenticación del Portal de votación.
 * No implementa reglas de votación: solo permite desarrollar y probar el login.
 */
import { createServer } from 'node:http';
import { ApiError } from './auth-service.js';
import {
  applyCors,
  getBearerToken,
  getClientIp,
  readJson,
  sendJson,
} from './http.js';

function routeNotFound() {
  return new ApiError(404, 'ruta_inexistente', 'La ruta solicitada no existe.');
}

export function createApp({ config, authService, logger = console }) {
  async function handle(req, res) {
    applyCors(req, res, config);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const { pathname } = url;

    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { status: 'ok', service: 'carnavales-server-local' });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/auth/login') {
        const body = await readJson(req);
        const result = authService.login({
          email: body.email,
          password: body.password,
          ip: getClientIp(req),
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/auth/verify-code') {
        const body = await readJson(req);
        const result = authService.verifyCode({
          challengeId: body.challengeId,
          code: body.code,
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/auth/resend-code') {
        const body = await readJson(req);
        const result = authService.resendCode({ challengeId: body.challengeId });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/auth/session') {
        const result = authService.getSession(getBearerToken(req));
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/auth/logout') {
        const result = authService.logout(getBearerToken(req));
        sendJson(res, 200, result);
        return;
      }

      throw routeNotFound();
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = {
          error: error.code,
          message: error.message,
        };
        if (error.details) payload.details = error.details;
        sendJson(res, error.status, payload);
        return;
      }

      logger.error?.('[server-local] Error inesperado:', error);
      sendJson(res, 500, {
        error: 'error_interno',
        message: 'Ocurrió un error inesperado.',
      });
    }
  }

  return handle;
}

export function createServerLocal({ config, authService, logger = console }) {
  return createServer(createApp({ config, authService, logger }));
}
