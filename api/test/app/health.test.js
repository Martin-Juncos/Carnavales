import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../../src/app.js";

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("GET /health reports the database as healthy after a successful query", async () => {
  const app = createApp({
    pool: { query: async () => ({ rows: [{ "?column?": 1 }] }) },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      database: "ok",
    });
  });
});

test("GET /health hides database errors and reports the service unavailable", async () => {
  const app = createApp({
    pool: {
      query: async () => {
        throw new Error("postgresql://private-user:private-password@db/private");
      },
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(body), {
      status: "error",
      database: "unavailable",
    });
    assert.doesNotMatch(body, /private-password|private-user|postgresql:\/\//);
  });
});
