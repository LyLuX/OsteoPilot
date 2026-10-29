import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';

const FormValidation = createContext({ errors: {} });
const EMPTY_ERRORS = Object.freeze({});
export function apiFieldErrors(error) {
  const details = error.response?.data?.error?.details;
  if (!Array.isArray(details)) return {};
  return details.reduce((errors, detail) => {
    const field = typeof detail.field === 'string' ? detail.field.split('.')[0] : '';
    if (field && !Object.hasOwn(errors, field)) {
      errors[field] =
        !detail.message || detail.message === 'Valeur absente, inconnue ou invalide.'
          ? 'Vérifiez la valeur de ce champ.'
          : detail.message;
    }
    return errors;
  }, {});
}

export function controlError(control) {
  if (!control.willValidate) return '';
  const value = control.value;
  const { validity } = control;
  if (validity.valueMissing || (control.required && control.type !== 'checkbox' && !value.trim()))
    return 'Ce champ est obligatoire.';
  if (validity.typeMismatch)
    return control.type === 'email'
      ? 'Saisissez une adresse email valide.'
      : 'Saisissez une valeur au bon format.';
  if (value && control.minLength > 0 && value.length < control.minLength)
    return 'Saisissez au moins ' + control.minLength + ' caractères.';
  if (control.maxLength >= 0 && value.length > control.maxLength)
    return 'Saisissez au maximum ' + control.maxLength + ' caractères.';
  if (control.name === 'password' && new TextEncoder().encode(value).length > 72)
    return 'Le mot de passe est limité à 72 octets.';
  if (control.type === 'tel' && !/^[+()\d .-]*$/.test(value))
    return 'Saisissez un numéro de téléphone valide.';
  if (validity.patternMismatch) return 'Respectez le format demandé.';
  if (validity.rangeUnderflow) return 'La valeur minimale est ' + control.min + '.';
  if (validity.rangeOverflow) return 'La valeur maximale est ' + control.max + '.';
  if (validity.badInput || validity.stepMismatch) return 'Saisissez une valeur valide.';
  return validity.valid ? '' : 'Vérifiez la valeur de ce champ.';
}

export function useFieldValidation(name, id, describedBy, directError, sharedFeedbackId) {
  const { errors } = useContext(FormValidation);
  const message = directError || errors[name] || '';
  const feedbackId = sharedFeedbackId || id + '-feedback';
  return {
    message,
    feedbackId,
    attributes: {
      'aria-invalid': message ? true : undefined,
      'aria-describedby':
        [describedBy, message ? feedbackId : ''].filter(Boolean).join(' ') || undefined,
    },
  };
}

export function FormFeedback({ name, id: suppliedId }) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  const validation = useFieldValidation(name, id, undefined, undefined, suppliedId);
  return validation.message ? (
    <div id={validation.feedbackId} className="invalid-feedback d-block">
      {validation.message}
    </div>
  ) : null;
}

export function FormControl({
  as: Tag = 'input',
  name,
  id: suppliedId,
  className = '',
  'aria-describedby': describedBy,
  error: directError,
  feedbackId: sharedFeedbackId,
  showFeedback = true,
  ...props
}) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  const validation = useFieldValidation(name, id, describedBy, directError, sharedFeedbackId);
  const baseClass =
    props.type === 'checkbox'
      ? 'form-check-input'
      : Tag === 'select'
        ? 'form-select'
        : 'form-control';
  return (
    <>
      <Tag
        {...props}
        id={id}
        name={name}
        className={[baseClass, className, validation.message ? 'is-invalid' : '']
          .filter(Boolean)
          .join(' ')}
        {...validation.attributes}
      />
      {validation.message && showFeedback && (
        <div className="invalid-feedback d-block" id={validation.feedbackId}>
          {validation.message}
        </div>
      )}
    </>
  );
}

function focusFirstError(form, messages) {
  const control = [...(form?.elements || [])].find((item) => messages[item.name] && !item.disabled);
  control?.focus();
}
export default function BootstrapForm({
  errors = EMPTY_ERRORS,
  validate,
  onSubmit,
  onChangeCapture,
  onReset,
  className = '',
  children,
  ...props
}) {
  const formRef = useRef(null);
  const [clientErrors, setClientErrors] = useState({});
  const [dismissed, setDismissed] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const serverErrors = Object.fromEntries(
    Object.entries(errors).filter(([name]) => !dismissed[name]),
  );
  const allErrors = { ...clientErrors, ...serverErrors };
  useEffect(() => {
    setDismissed({});
    focusFirstError(formRef.current, errors);
  }, [errors]);
  const collect = (form) => {
    const messages = {};
    for (const control of form.elements) {
      if (!control.name || control.disabled || !('validity' in control)) continue;
      const message = controlError(control);
      if (message) messages[control.name] = message;
    }
    return { ...messages, ...validate?.(form) };
  };
  const submit = (event) => {
    event.preventDefault();
    const messages = collect(event.currentTarget);
    setClientErrors(messages);
    setDismissed(Object.fromEntries(Object.keys(errors).map((name) => [name, true])));
    setSubmitted(true);
    if (Object.keys(messages).length) {
      focusFirstError(formRef.current, messages);
      return;
    }
    onSubmit?.(event);
  };
  const change = (event) => {
    const control = event.target;
    if (control.name) {
      setDismissed((current) => ({ ...current, [control.name]: true }));
      if (submitted) setClientErrors(collect(event.currentTarget));
    }
    onChangeCapture?.(event);
  };
  return (
    <FormValidation.Provider value={{ errors: allErrors }}>
      <form
        {...props}
        ref={formRef}
        className={'needs-validation ' + className}
        noValidate
        onSubmit={submit}
        onChangeCapture={change}
        onReset={(event) => {
          setClientErrors({});
          setDismissed({});
          setSubmitted(false);
          onReset?.(event);
        }}
      >
        {submitted && Object.keys(clientErrors).length > 0 && (
          <div className="alert alert-danger w-100" role="alert">
            Veuillez corriger les champs signalés avant de continuer.
          </div>
        )}
        {children}
      </form>
    </FormValidation.Provider>
  );
}
