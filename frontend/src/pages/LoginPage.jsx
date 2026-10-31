import BootstrapForm from '../components/BootstrapForm.jsx';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Field, useTask } from '../components/shared.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
export default function LoginPage() {
  const auth = useAuth();
  const task = useTask();
  const [values, setValues] = useState({ email: '', password: '' });
  const change = (key, value) => setValues({ ...values, [key]: value });
  if (auth.user) return <Navigate to="/dashboard" replace />;
  return (
    <main className="login-page">
      <section className="login-card">
        <h1 className="login-brand">
          <img src="/osteopilot-mark.png?v=1" alt="OstéoPilot" width="112" height="112" />
        </h1>
        <BootstrapForm
          errors={task.fieldErrors}
          onSubmit={(e) => {
            e.preventDefault();
            task.run(() => auth.login(values.email, values.password), 'Connexion réussie.');
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
          <PasswordInput
            label="Mot de passe"
            name="password"
            value={values.password}
            onChange={(e) => change('password', e.target.value)}
            required
            autoComplete="current-password"
            maxLength={72}
          />
          <button className="btn btn-outline-success w-100" disabled={task.busy}>
            {task.busy ? 'Connexion…' : 'Se connecter →'}
          </button>
        </BootstrapForm>
        <p className="login-help">
          L’accès est réservé aux utilisateurs autorisés du cabinet. Contactez votre administrateur
          pour obtenir un compte.
        </p>
      </section>
    </main>
  );
}
