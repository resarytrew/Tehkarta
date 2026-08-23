import { type FormEvent, useState } from 'react';

interface LoginScreenProps {
  busy: boolean;
  error: string | null;
  onLogin(email: string, password: string): Promise<void>;
}

export function LoginScreen({ busy, error, onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setLocalError('Введите email и пароль.');
      return;
    }

    try {
      await onLogin(normalizedEmail, password);
    } catch (submitError) {
      setLocalError(
        submitError instanceof Error ? submitError.message : 'Не удалось выполнить вход.'
      );
    }
  }

  return (
    <main className="connection-page">
      <div className="connection-card login-card">
        <div className="brand-mark brand-mark--large">ТК</div>
        <div className="connection-card__copy">
          <span className="eyebrow">Tehkarta · рабочая среда педагога</span>
          <h1>Вход в платформу</h1>
          <p>
            После входа платформа сама определит доступные рабочие области. Сессионный токен
            хранится только в защищённой HttpOnly cookie и недоступен JavaScript.
          </p>
        </div>

        <form onSubmit={(event) => void submit(event)} className="connection-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teacher@example.ru"
              autoComplete="username"
              disabled={busy}
              autoFocus
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите пароль"
              autoComplete="current-password"
              disabled={busy}
            />
          </label>

          {localError ?? error ? (
            <div className="inline-error" role="alert">
              {localError ?? error}
            </div>
          ) : null}

          <button
            className="button button-primary button-wide"
            type="submit"
            disabled={busy || !email.trim() || !password}
          >
            {busy ? 'Входим…' : 'Войти'}
          </button>
        </form>

        <div className="connection-note">
          Tehkarta не передаёт пароль в сторонние AI-сервисы и не хранит его в открытом виде.
        </div>
      </div>
    </main>
  );
}
