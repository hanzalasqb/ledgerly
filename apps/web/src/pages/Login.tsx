import { useState, type FormEvent } from "react";
import { LoginInput, RegisterInput } from "@ledgerly/shared";
import { ApiError } from "../api/client";
import { actions } from "../store";
import { Logo } from "../components/ui";

export function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = mode === "login" ? LoginInput.safeParse({ email, password }) : RegisterInput.safeParse({ name, email, password });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await actions.signIn(mode, name, email, password);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Could not reach the server" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <Logo />
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="muted">Invoices, payments and cash flow in one place.</p>
        {mode === "register" && (
          <label className="field">
            <span>Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!errors.name} />
            {errors.name && <small className="field-error">{errors.name}</small>}
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!errors.email} />
          {errors.email && <small className="field-error">{errors.email}</small>}
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={!!errors.password} />
          {errors.password && <small className="field-error">{errors.password}</small>}
        </label>
        {errors.form && (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="link-btn" onClick={() => (setMode(mode === "login" ? "register" : "login"), setErrors({}))}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
