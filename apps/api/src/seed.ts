/**
 * Seeds a local database with the demo books (clients, a year of invoices, expenses)
 * so the full stack looks like the live demo. Local development only.
 */
import { demoData } from "@ledgerly/shared";
import { hashPassword } from "./auth";
import { Store } from "./db";

const EMAIL = "demo@ledgerly.dev";
const PASSWORD = "ledgerly-demo-password";
const store = new Store(process.env.DATABASE_FILE ?? "ledgerly.db");

const user = store.findUserByEmail(EMAIL) ?? store.createUser("Hanzala Saqib", EMAIL, hashPassword(PASSWORD));
const { clients, invoices, expenses } = demoData();
for (const c of clients) store.createClient(user.id, c, `${user.id}:${c.id}`);
for (const inv of invoices) store.importInvoice(user.id, { ...inv, id: `${user.id}:${inv.id}`, clientId: `${user.id}:${inv.clientId}` });
for (const e of expenses) store.createExpense(user.id, e);

console.log(`Seeded ${clients.length} clients, ${invoices.length} invoices and ${expenses.length} expenses.`);
console.log(`Sign in as ${EMAIL} / ${PASSWORD}`);
store.close();
