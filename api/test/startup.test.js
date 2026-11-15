import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const entryPoint = fileURLToPath(new URL("../src/index.js", import.meta.url));

test("startup rejects a missing database URL without printing connection data", () => {
  const result = spawnSync(process.execPath, [entryPoint], {
    cwd: apiRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /DATABASE_URL/);
  assert.doesNotMatch(output, /postgres(?:ql)?:\/\//i);
});
