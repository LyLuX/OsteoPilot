import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import {
  Alert,
  Field,
  PageTitle,
  Panel,
  ResourceState,
  useResource,
  useTask,
} from '../components/shared.jsx';
const empty = { firstName: '', lastName: '', phone: '', email: '', address: '' };
function PatientForm({ patient }) {
  const [values, setValues] = useState(
    patient ? Object.fromEntries(Object.keys(empty).map((k) => [k, patient[k]])) : empty,
  );
  const task = useTask();
  const key = useRef(crypto.randomUUID());
  const navigate = useNavigate();
  const change = (name, value) => {
    setValues({ ...values, [name]: value });
    key.current = crypto.randomUUID();
  };
  const save = async (e) => {
    e.preventDefault();
    const result = await task.run(() =>
      patient
        ? api.patch('/patients/' + patient.id, { ...values, version: patient.version })
        : api.post('/patients', values, { headers: { 'Idempotency-Key': key.current } }),
    );
    if (result) navigate('/patients/' + result.id);
  };
  return (
    <form onSubmit={save}>
      <Alert>{task.error}</Alert>
      <div className="form-grid">
        <Field
          label="Nom"
          name="lastName"
          value={values.lastName}
          onChange={change}
          maxLength={100}
          required
          autoComplete="family-name"
        />
        <Field
          label="Prénom"
          name="firstName"
          value={values.firstName}
          onChange={change}
          maxLength={100}
          required
          autoComplete="given-name"
        />
        <Field
          label="Téléphone"
          name="phone"
          type="tel"
          value={values.phone}
          onChange={change}
          maxLength={30}
          autoComplete="tel"
        />
        <Field
          label="Email"
          name="email"
          type="email"
          value={values.email}
          onChange={change}
          maxLength={254}
          autoComplete="email"
        />
        <Field
          label="Adresse"
          name="address"
          value={values.address}
          onChange={change}
          maxLength={300}
          autoComplete="street-address"
        />
      </div>
      <p className="muted">* Champs obligatoires. Coordonnées administratives uniquement.</p>
      <div className="actions">
        <button className="btn btn-primary" disabled={task.busy}>
          {task.busy ? 'Enregistrement…' : 'Enregistrer la fiche'}
        </button>
        <Link className="btn btn-outline-secondary" to="/patients">
          Annuler
        </Link>
      </div>
    </form>
  );
}
function EditForm({ id }) {
  const resource = useResource('/patients/' + id);
  return (
    <>
      <ResourceState resource={resource} />
      {resource.data && <PatientForm key={resource.data.updatedAt} patient={resource.data} />}
    </>
  );
}
export default function PatientFormPage() {
  const { id } = useParams();
  return (
    <>
      <PageTitle
        eyebrow="Gestion patientèle"
        title={id ? 'Modifier un patient' : 'Création d’un patient'}
      />
      <Panel>{id ? <EditForm id={id} /> : <PatientForm />}</Panel>
    </>
  );
}
