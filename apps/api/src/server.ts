import { createApp } from "./app";

const PORT = Number(process.env.PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET ?? "";

if (JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be set to at least 32 characters (see .env.example).");
  process.exit(1);
}

const app = createApp({
  jwtSecret: JWT_SECRET,
  databaseFile: process.env.DATABASE_FILE ?? "ledgerly.db",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim()),
});

app.server.listen(PORT, () => {
  console.log(JSON.stringify({ level: "info", msg: "ledgerly api listening", port: PORT }));
});

// Graceful shutdown: stop accepting connections, then close SQLite.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(JSON.stringify({ level: "info", msg: "shutting down", signal }));
    await app.close();
    process.exit(0);
  });
}
