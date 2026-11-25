import { createServer } from "node:http";
import {
  cashFlow,
  ClientInput,
  CURRENCIES,
  ExpenseInput,
  InvoiceInput,
  LoginInput,
  PaymentInput,
  RegisterInput,
  summarize,
  topClients,
  type Currency,
} from "@ledgerly/shared";
import { bearer, hashPassword, RateLimiter, signToken, verifyPassword, verifyToken } from "./auth";
import { Store } from "./db";
import { HttpError, Router, type Ctx } from "./http";

export interface AppConfig {
  jwtSecret: string;
  databaseFile?: string;
  corsOrigins?: string[];
  /** Injectable clock for tests. */
  today?: () => string;
}

export function createApp(config: AppConfig) {
  const store = new Store(config.databaseFile);
  const router = new Router();
  const authLimiter = new RateLimiter(10, 15 * 60 * 1000);
  const today = config.today ?? (() => new Date().toISOString().slice(0, 10));

  const server = createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin && config.corsOrigins?.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    void router.handle(req, res);
  });

  const owner = (ctx: Ctx) => verifyToken(bearer(ctx.req.headers.authorization), config.jwtSecret).sub;
  const session = (u: { id: string; name: string; email: string }) => ({ token: signToken(u.id, u.name, config.jwtSecret), user: { id: u.id, name: u.name, email: u.email } });

  router
    .get("/api/health", () => ({ ok: true }))

    /* auth */
    .post(
      "/api/auth/register",
      async (ctx) => {
        authLimiter.take(ctx.ip);
        const input = await ctx.body(RegisterInput);
        return session(store.createUser(input.name, input.email, hashPassword(input.password)));
      },
      201,
    )
    .post("/api/auth/login", async (ctx) => {
      authLimiter.take(ctx.ip);
      const input = await ctx.body(LoginInput);
      const user = store.findUserByEmail(input.email);
      if (!user || !verifyPassword(input.password, user.passwordHash)) throw new HttpError(401, "Wrong email or password");
      return session(user);
    })

    /* clients */
    .get("/api/clients", (ctx) => store.listClients(owner(ctx)))
    .post("/api/clients", async (ctx) => store.createClient(owner(ctx), await ctx.body(ClientInput)), 201)
    .on("PUT", "/api/clients/:id", async (ctx) => store.updateClient(owner(ctx), ctx.params.id, await ctx.body(ClientInput)))

    /* invoices */
    .get("/api/invoices", (ctx) => store.listInvoices(owner(ctx)))
    .post("/api/invoices", async (ctx) => store.createInvoice(owner(ctx), await ctx.body(InvoiceInput)), 201)
    .get("/api/invoices/:id", (ctx) => store.getInvoice(owner(ctx), ctx.params.id))
    .on("PUT", "/api/invoices/:id", async (ctx) => store.updateInvoice(owner(ctx), ctx.params.id, await ctx.body(InvoiceInput)))
    .delete("/api/invoices/:id", (ctx) => store.deleteInvoice(owner(ctx), ctx.params.id))
    .post("/api/invoices/:id/send", (ctx) => store.transition(owner(ctx), ctx.params.id, "sent"))
    .post("/api/invoices/:id/void", (ctx) => store.transition(owner(ctx), ctx.params.id, "void"))
    .post("/api/invoices/:id/payments", async (ctx) => store.recordPayment(owner(ctx), ctx.params.id, await ctx.body(PaymentInput)))
    .post("/api/invoices/:id/duplicate", (ctx) => store.duplicateInvoice(owner(ctx), ctx.params.id, today()), 201)

    /* expenses */
    .get("/api/expenses", (ctx) => store.listExpenses(owner(ctx)))
    .post("/api/expenses", async (ctx) => store.createExpense(owner(ctx), await ctx.body(ExpenseInput)), 201)
    .delete("/api/expenses/:id", (ctx) => store.deleteExpense(owner(ctx), ctx.params.id))

    /* reports */
    .get("/api/reports/summary", (ctx) => {
      const me = owner(ctx);
      const base = (ctx.query.get("base") ?? "USD") as Currency;
      if (!CURRENCIES.includes(base)) throw new HttpError(400, `base must be one of ${CURRENCIES.join(", ")}`);
      const invoices = store.listInvoices(me);
      return {
        base,
        summary: summarize(invoices, base, today()),
        cashFlow: cashFlow(invoices, store.listExpenses(me), base, today()),
        topClients: topClients(invoices, base),
      };
    });

  return {
    server,
    store,
    close: () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          store.close();
          resolve();
        }),
      ),
  };
}
