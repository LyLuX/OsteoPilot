import { FormControl } from '../components/BootstrapForm.jsx';
import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { createRequestId } from '../api/request-id.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Alert, ConfirmDialog, PageTitle, Panel, useTask } from '../components/shared.jsx';
export default function TransferPage() {
  const { can } = useAuth();
  const task = useTask();
  const [csv, setCsv] = useState('');
  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState('');
  const key = useRef(null);
  if (key.current === null) key.current = createRequestId();
  const fileInput = useRef(null);
  const load = async (file) => {
    setPreview(null);
    setCsv('');
    setFileError('');
    key.current = createRequestId();
    if (!file) return;
    if (file.size > 512 * 1024) {
      task.setError('');
      setFileError('Le fichier dépasse 512 Kio.');
      return;
    }
    const result = await task.run(async () => {
      let text;
      try {
        const bytes = await file.arrayBuffer();
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        setFileError('Choisissez un fichier CSV encodé en UTF-8.');
        return false;
      }
      setCsv(text);
      setPreview(await api.post('/patients/import/preview', { csv: text }));
      return true;
    });
    if (result === undefined)
      setFileError('Le fichier n’a pas pu être validé. Vérifiez le message ci-dessus.');
  };
  const commit = async () => {
    const result = await task.run(
      () =>
        api.post(
          '/patients/import',
          { csv, fingerprint: preview.fingerprint },
          { headers: { 'Idempotency-Key': key.current } },
        ),
      'Import terminé : toutes les fiches ont été créées.',
    );
    if (result) {
      setCsv('');
      setPreview(null);
      setConfirm('');
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const exportFile = async () => {
    const result = await task.run(
      async () => {
        const blob = await api.post('/patients/export', {}, { responseType: 'blob' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'osteopilot-patients.csv';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
      },
      'Export téléchargé. Conservez ce fichier dans un espace protégé.',
      'info',
    );
    if (result) setConfirm('');
  };
  return (
    <>
      <PageTitle eyebrow="Gestion patientèle" title="Importer / Exporter une patientèle" />
      <div className="form-grid">
        {can('patients.import') && (
          <Panel>
            <h2>Importer un CSV</h2>
            <p>
              UTF-8, virgules, 512 Kio et 1 000 lignes maximum. Colonnes obligatoires, dans cet
              ordre :
            </p>
            <code className="csv-columns">lastName,firstName,phone,email,address</code>
            <p className="muted">
              Nom et prénom requis. Les autres valeurs peuvent être vides. Aucun écrasement : un
              doublon bloque tout l’import.
            </p>
            <label className="field">
              <span>Fichier de patientèle</span>
              <FormControl
                name="csv"
                error={fileError || task.fieldErrors.csv}
                ref={fileInput}
                className="form-control"
                type="file"
                accept=".csv,text/csv"
                disabled={task.busy}
                onChange={(e) => load(e.target.files[0])}
              />
            </label>
            {preview && (
              <div>
                <h3>
                  Aperçu : {preview.total} ligne{preview.total > 1 ? 's' : ''}
                </h3>
                {preview.errors.length > 0 && (
                  <Alert>
                    <ul>
                      {preview.errors.map((e, i) => (
                        <li key={i}>
                          Ligne {e.line} : {e.reason || 'champs invalides : ' + e.fields.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}
                <ul>
                  {preview.preview.filter(Boolean).map((p, i) => (
                    <li key={i}>
                      {p.lastName} {p.firstName}
                    </li>
                  ))}
                </ul>
                <p className="muted">Aperçu limité aux 10 premières lignes.</p>
                <button
                  className="btn btn-success"
                  disabled={!preview.valid || task.busy}
                  onClick={() => setConfirm('import')}
                >
                  Confirmer l’import
                </button>
              </div>
            )}
          </Panel>
        )}
        {can('patients.export') && (
          <Panel>
            <h2>Exporter la patientèle</h2>
            <p>
              Téléchargez les coordonnées administratives des patients actifs au format CSV UTF-8.
            </p>
            <p className="muted">
              L’export est journalisé et limité à 10 000 fiches. Les cellules pouvant être
              interprétées comme des formules sont neutralisées.
            </p>
            <button
              className="btn btn-outline-info"
              disabled={task.busy}
              onClick={() => setConfirm('export')}
            >
              Télécharger le CSV
            </button>
          </Panel>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          tone={confirm === 'import' ? 'success' : 'info'}
          title={
            confirm === 'import' ? 'Confirmer l’import ?' : 'Exporter des données personnelles ?'
          }
          onCancel={() => setConfirm('')}
          busy={task.busy}
          onConfirm={confirm === 'import' ? commit : exportFile}
        >
          {confirm === 'import'
            ? 'Toutes les lignes seront créées ensemble. Toute erreur annule l’import.'
            : 'Vous êtes responsable de la conservation sécurisée du fichier téléchargé.'}
        </ConfirmDialog>
      )}
    </>
  );
}
