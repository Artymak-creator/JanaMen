
import { useState, type FormEvent } from "react";
import { login, register } from "./lib/auth";
import "./AuthForm.css";

type Props = {
  onSuccess: () => void;
};

export default function AuthForm({ onSuccess }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email.trim(), password);
        onSuccess();
      } else {
        const data = await register(email.trim(), password);

        if (data.session) {
          onSuccess();
        } else {
          setMessage(
            "Регистрация почти завершена. Проверьте почту и подтвердите адрес, затем войдите."
          );
          setMode("login");
        }
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось выполнить операцию."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-logo">J</div>
        <h1>JanaМен</h1>
        <p className="auth-subtitle">Портал сотрудника</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "auth-tab active" : "auth-tab"}
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === "register" ? "auth-tab active" : "auth-tab"}
            onClick={() => {
              setMode("register");
              setMessage("");
            }}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="auth-email">Электронная почта</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />

          <label htmlFor="auth-password">Пароль</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Не менее 6 символов"
          />

          {message && (
            <p className="auth-message" role="status">
              {message}
            </p>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? "Подождите..."
              : mode === "login"
                ? "Войти"
                : "Создать аккаунт"}
          </button>
        </form>

        <p className="auth-footer">
          Ваши данные защищаются системой авторизации Supabase.
        </p>
      </section>
    </main>
  );
}
