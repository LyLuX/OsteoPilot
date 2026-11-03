import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { useNotifications } from '../notifications/Notifications.jsx';
export function usePaymentPatients() {
  const notify = useNotifications();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    const load = async () => {
      const patients = new Map();
      let page = 1;
      let totalPages = 1;
      while (active && page <= totalPages) {
        const response = await api.get('/payments/patients', { page, limit: 100 });
        if (!active) return;
        for (const patient of response.items) patients.set(patient.id, patient);
        totalPages = response.pagination.totalPages;
        page += 1;
      }
      if (active) setData({ items: [...patients.values()] });
    };
    load()
      .catch((error) => {
        if (!active) return;
        const message = errorMessage(error, { includeFields: false });
        setError(message);
        notify({ message, tone: 'danger' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, notify]);
  return { data, loading, error, reload: () => setRevision((value) => value + 1) };
}
