import { useId, useState } from 'react';
import { useFieldValidation } from './BootstrapForm.jsx';

export default function PasswordInput({ label = 'Mot de passe', required = false, ...props }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const validation = useFieldValidation(props.name, id, props['aria-describedby']);
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      <div
        className={
          'input-group password-input-group' + (validation.message ? ' has-validation' : '')
        }
      >
        <input
          {...props}
          id={id}
          className={'form-control' + (validation.message ? ' is-invalid' : '')}
          {...validation.attributes}
          type={visible ? 'text' : 'password'}
          required={required}
        />
        <button
          type="button"
          className="btn btn-outline-secondary password-toggle"
          aria-controls={id}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="m3 3 18 18" />}
          </svg>
        </button>
        {validation.message && (
          <div className="invalid-feedback" id={validation.feedbackId}>
            {validation.message}
          </div>
        )}
      </div>
    </div>
  );
}
