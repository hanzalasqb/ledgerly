import { z } from "zod";
import { CURRENCIES } from "./money";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const minor = z.number().int("Amounts are whole minor units").min(0).max(1_000_000_000_00);

export const CurrencySchema = z.enum(CURRENCIES);

/** Stored workflow states. "overdue" is derived from `sent` + due date, never stored. */
export const STORED_STATUSES = ["draft", "sent", "paid", "void"] as const;
export const InvoiceStatusSchema = z.enum(STORED_STATUSES);
export type StoredStatus = z.infer<typeof InvoiceStatusSchema>;
export type DisplayStatus = StoredStatus | "overdue" | "partial";

export const PAYMENT_METHODS = ["bank_transfer", "card", "cash", "cheque", "other"] as const;
export const EXPENSE_CATEGORIES = ["software", "contractors", "office", "travel", "marketing", "hardware", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const LineItemSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1, "Describe the item").max(200),
  quantity: z.number().positive("Quantity must be above zero").max(100_000),
  unitPrice: minor,
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const PaymentSchema = z.object({
  id: z.string(),
  amount: minor.refine((v) => v > 0, "Payment must be above zero"),
  date: isoDate,
  method: z.enum(PAYMENT_METHODS),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const ClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  company: z.string(),
  country: z.string(),
  currency: CurrencySchema,
  color: z.string(),
  createdAt: z.string(),
});
export type Client = z.infer<typeof ClientSchema>;

export const InvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  clientId: z.string(),
  currency: CurrencySchema,
  issueDate: isoDate,
  dueDate: isoDate,
  items: z.array(LineItemSchema),
  taxRate: z.number(),
  discount: minor,
  notes: z.string(),
  status: InvoiceStatusSchema,
  payments: z.array(PaymentSchema),
  sentAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const ExpenseSchema = z.object({
  id: z.string(),
  date: isoDate,
  vendor: z.string(),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: minor,
  currency: CurrencySchema,
});
export type Expense = z.infer<typeof ExpenseSchema>;

/* ---------- inputs ---------- */

export const RegisterInput = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});
export const LoginInput = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });

export const ClientInput = z.object({
  name: z.string().trim().min(2, "Enter the contact's name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  company: z.string().trim().max(120).default(""),
  country: z.string().trim().max(60).default(""),
  currency: CurrencySchema.default("USD"),
});
export type ClientInput = z.input<typeof ClientInput>;

export const InvoiceInput = z
  .object({
    clientId: z.string().min(1, "Choose a client"),
    currency: CurrencySchema,
    issueDate: isoDate,
    dueDate: isoDate,
    items: z.array(LineItemSchema).min(1, "Add at least one line item").max(100),
    taxRate: z.number().min(0, "Tax can't be negative").max(100),
    discount: minor.default(0),
    notes: z.string().max(2000).default(""),
  })
  .refine((v) => v.dueDate >= v.issueDate, { message: "Due date must be on or after the issue date", path: ["dueDate"] });
export type InvoiceInput = z.input<typeof InvoiceInput>;

export const PaymentInput = PaymentSchema.omit({ id: true });
export type PaymentInput = z.infer<typeof PaymentInput>;

export const ExpenseInput = ExpenseSchema.omit({ id: true }).extend({
  vendor: z.string().trim().min(1, "Enter a vendor").max(80),
  amount: minor.refine((v) => v > 0, "Amount must be above zero"),
});
export type ExpenseInput = z.infer<typeof ExpenseInput>;
