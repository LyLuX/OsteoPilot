import metadata from '../../package.json';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Alert, Field, useTask } from '../components/shared.jsx';
export default function LoginPage() {
  const auth = useAuth();
  const task = useTask();
  const [values, setValues] = useState({ email: '', password: '' });
  const change = (key, value) => setValues({ ...values, [key]: value });
  if (auth.user) return <Navigate to="/dashboard" replace />;
  return (
    <main className="login-page">
      <div className="login-intro">
        <div className="brand">
          <span className="brand-mark">O</span>OsteoPilot
        </div>
        <p className="eyebrow">L’essentiel, à portée de main</p>
        <h1>
          Votre cabinet.
          <br />
          L’esprit libre.
        </h1>
        <p>Un espace simple et sécurisé pour prendre soin de votre patientèle, au quotidien.</p>
        <span className="intro-note">
          Pensé pour votre pratique. Accessible sur tous vos écrans.
        </span>
      </div>
      <section className="login-card">
        <p className="eyebrow">Bienvenue dans votre espace</p>
        <h2>Connexion</h2>
        <p className="muted">Retrouvez votre cabinet en toute confidentialité.</p>
        <Alert>{auth.notice}</Alert>
        <Alert>{task.error}</Alert>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            task.run(() => auth.login(values.email, values.password));
          }}
        >
          <Field
            label="Adresse email"
            name="email"
            type="email"
            value={values.email}
            onChange={change}
            required
            autoComplete="username"
            maxLength={254}
          />
          <Field
            label="Mot de passe"
            name="password"
            type="password"
            value={values.password}
            onChange={change}
            required
            autoComplete="current-password"
            maxLength={72}
          />
          <button className="btn btn-primary w-100" disabled={task.busy}>
            {task.busy ? 'Connexion…' : 'Se connecter →'}
          </button>
        </form>
        <p className="login-help">
          L’accès est réservé aux utilisateurs autorisés du cabinet. Contactez votre administrateur
          pour obtenir un compte.
        </p>
      </section>
      <footer>OsteoPilot · {metadata.version}</footer>
    </main>
  );
}
