import { getMigrations } from "better-auth/db/migration";
import { createAuthOptions } from "./auth.config.js";
const opts = createAuthOptions({ databaseUrl: process.env.DATABASE_URL });
const plan = await getMigrations(opts, { throwOnUnsafe: false });
console.log("result keys:", Object.keys(plan));
for (const t of plan.toBeCreated) console.log("CREATE", t.table, Object.keys(t.fields).join(","));
for (const t of plan.toBeAdded) console.log("ADD", t.table, Object.keys(t.fields).join(","));
if (plan.unsafeChanges?.length) console.log("UNSAFE", plan.unsafeChanges);
process.exit(0);
