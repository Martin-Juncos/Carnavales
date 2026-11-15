import pg from "pg";

// Crea el pool de conexiones a PostgreSQL. Cada consulta toma una conexión libre del pool
// y la devuelve al terminar, así no se abre una conexión nueva por petición.
export function createPool(databaseUrl) {
  return new pg.Pool({ connectionString: databaseUrl });
}
