import type { Client, ClientInput, Expense, ExpenseInput, Invoice, InvoiceInput, PaymentInput } from "@ledgerly/shared";

export interface Books {
  user: { name: string; email: string };
  clients: Client[];
  invoices: Invoice[];
  expenses: Expense[];
}

/**
 * The UI depends on this contract only. `httpClient` calls the Node.js API;
 * `demoClient` implements the same rules in the browser for the live demo.
 */
export interface LedgerlyClient {
  readonly mode: "demo" | "live";
  hasSession(): boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): void;
  load(): Promise<Books>;
  createClient(input: ClientInput): Promise<Client>;
  updateClient(id: string, input: ClientInput): Promise<Client>;
  createInvoice(input: InvoiceInput): Promise<Invoice>;
  updateInvoice(id: string, input: InvoiceInput): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;
  sendInvoice(id: string): Promise<Invoice>;
  voidInvoice(id: string): Promise<Invoice>;
  recordPayment(id: string, payment: PaymentInput): Promise<Invoice>;
  duplicateInvoice(id: string): Promise<Invoice>;
  createExpense(input: ExpenseInput): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/** Maps a ZodError (thrown by shared schemas) to the API's error shape. */
export function toApiError(e: unknown): unknown {
  const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (issues) return new ApiError("Validation failed", 400, issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return e;
}
