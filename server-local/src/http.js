/*
 * Utilidades HTTP de la API local: CORS, lectura de JSON y respuestas.
 * Sin dependencias externas; usa los módulos nativos de Node.
 */
import { ApiError } from './auth-service.js';

const MAX_BODY_BYTES = 16 * 1024;

export function applyCors(req, res, config) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export async function readJson(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ApiError(413, 'cuerpo_demasiado_grande', 'El cuerpo de la solicitud es demasiado grande.');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');

  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('El cuerpo debe ser un objeto JSON.');
    }
    return parsed;
  } catch {
    throw new ApiError(400, 'json_invalido', 'El cuerpo de la solicitud no es JSON válido.');
  }
}

export function getBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? (token ?? '') : '';
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'desconocida';
}
