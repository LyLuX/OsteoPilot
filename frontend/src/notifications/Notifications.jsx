import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Toast from 'bootstrap/js/dist/toast';
const NotificationContext = createContext(null);
const ignoreNotification = () => {};
export function useNotifications() {
  return useContext(NotificationContext) || ignoreNotification;
}

function NotificationToast({ notification, dismiss }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    const closed = () => dismiss(notification.id);
    const toast = new Toast(node, { autohide: true, delay: 2000, animation: false });
    node.addEventListener('hidden.bs.toast', closed);
    toast.show();
    return () => {
      node.removeEventListener('hidden.bs.toast', closed);
      toast.dispose();
    };
  }, [notification.id, dismiss]);
  const urgent = notification.tone === 'danger';
  return (
    <div
      ref={ref}
      className={
        'toast notification-toast bg-' +
        notification.tone +
        '-subtle text-' +
        notification.tone +
        '-emphasis border-' +
        notification.tone +
        '-subtle'
      }
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className="d-flex align-items-center">
        <div className="toast-body flex-grow-1">{notification.message}</div>
        <button
          type="button"
          className="btn-close flex-shrink-0"
          data-bs-dismiss="toast"
          aria-label="Fermer la notification"
        />
      </div>
    </div>
  );
}
export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const nextId = useRef(0);
  const [target, setTarget] = useState(() => document.body);
  const refreshTarget = useCallback(
    () => setTarget(document.querySelector('dialog[open]') || document.body),
    [],
  );
  useLayoutEffect(refreshTarget, [notifications, refreshTarget]);
  useEffect(() => {
    document.addEventListener('close', refreshTarget, true);
    return () => document.removeEventListener('close', refreshTarget, true);
  }, [refreshTarget]);
  const notify = useCallback(({ message, tone = 'danger' }) => {
    if (typeof message !== 'string' || !message.trim()) return;
    const validTone = ['success', 'danger', 'warning', 'info'].includes(tone) ? tone : 'info';
    const notification = { id: ++nextId.current, message, tone: validTone };
    setNotifications((current) =>
      current.some((item) => item.message === message && item.tone === validTone)
        ? current.map((item) =>
            item.message === message && item.tone === validTone ? notification : item,
          )
        : [...current.slice(-4), notification],
    );
  }, []);
  const dismiss = useCallback(
    (id) => setNotifications((current) => current.filter((item) => item.id !== id)),
    [],
  );
  return (
    <NotificationContext.Provider value={notify}>
      {children}
      {createPortal(
        <div
          className="toast-container notification-container position-fixed top-0 end-0 p-3"
          aria-label="Notifications"
        >
          {notifications.map((notification) => (
            <NotificationToast
              key={notification.id}
              notification={notification}
              dismiss={dismiss}
            />
          ))}
        </div>,
        target,
      )}
    </NotificationContext.Provider>
  );
}
