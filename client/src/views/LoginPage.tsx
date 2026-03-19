import { useState } from "react";
import { useAuth } from "../state/AuthContext";

export const LoginPage = () => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (mode === "register") {
        await register(form);
      } else {
        await login({ email: form.email, password: form.password });
      }
    } catch (submissionError) {
      setError("Could not authenticate. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <p className="eyebrow">Regrip Assignment</p>
        <h1>SyncDoc</h1>
        <p className="hero-copy">
          A collaborative document workspace with real-time editing, role-based
          sharing, live chat, uploads, and Gemini-powered writing support.
        </p>
        <div className="hero-card">
          <div>
            <strong>What&apos;s included</strong>
            <p>Dashboards, presence, per-document chat, file sharing, and AI streams.</p>
          </div>
          <div>
            <strong>RBAC baked in</strong>
            <p>Owners manage access, editors collaborate, viewers stay read-only.</p>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-tabs">
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
            type="button"
          >
            Create account
          </button>
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
            type="button"
          >
            Sign in
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === "register" ? (
            <label>
              Name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Aarav Patel"
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="team@company.com"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="At least 6 characters"
              required
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Working..." : mode === "register" ? "Launch workspace" : "Enter workspace"}
          </button>
        </form>
      </section>
    </main>
  );
};
