import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { IconClose, IconError, IconInfo, IconSuccess, IconWarning } from './Icons';

export type ToastKind = 'success' | 'warning' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind, ms?: number) => void>(() => undefined);

const KIND_ICON: Record<ToastKind, ReactNode> = {
  success: <IconSuccess size={17} />,
  warning: <IconWarning size={17} />,
  error: <IconError size={17} />,
  info: <IconInfo size={17} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (message: string, kind: ToastKind = 'success', ms = 4000) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-icon">{KIND_ICON[t.kind]}</span>
            <span className="toast-text">{t.message}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" title="Dismiss" onClick={() => dismiss(t.id)}>
              <IconClose size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
