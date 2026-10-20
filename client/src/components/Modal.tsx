import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconCancel, IconCheck, IconClose, IconError, IconInfo, IconMaximize, IconRestore, IconSuccess, IconWarning } from './Icons';

interface ModalProps {
  title: ReactNode;
  icon?: ReactNode;
  width?: number;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  headerExtra?: ReactNode;
  level?: number;
}

// Fits its content, grows with it up to the window height (then scrolls), resizable and maximizable.
export function Modal({ title, icon, width = 720, onClose, footer, children, headerExtra, level = 0 }: ModalProps) {
  const [maximized, setMaximized] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialogRef.current?.contains(document.activeElement ?? null)) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return createPortal(
    <div className="modal-backdrop" style={{ zIndex: 1000 + level * 10 }}>
      <div
        ref={dialogRef}
        className={`modal ${maximized ? 'modal-max' : ''}`}
        style={maximized ? undefined : { width: `min(${width}px, calc(100vw - 32px))` }}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="modal-header">
          <div className="modal-title">
            {icon}
            <h2>{title}</h2>
          </div>
          <div className="modal-actions">
            {headerExtra}
            <button
              type="button"
              className="icon-btn"
              aria-label={maximized ? 'Restore size' : 'Maximize'}
              title={maximized ? 'Restore size' : 'Maximize'}
              onClick={() => setMaximized((m) => !m)}
            >
              {maximized ? <IconRestore size={16} /> : <IconMaximize size={16} />}
            </button>
            <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
              <IconClose size={18} />
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'OK',
  confirmIcon,
  danger,
  onConfirm,
  onCancel,
  level = 5,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  confirmIcon?: ReactNode;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  level?: number;
}) {
  return (
    <Modal
      title={title}
      icon={<span className={`icon-tile ${danger ? 'icon-tile-danger' : ''}`} aria-hidden>{danger ? <IconWarning size={18} /> : <IconInfo size={18} />}</span>}
      width={460}
      onClose={onCancel}
      level={level}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            <IconCancel size={15} /> Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} autoFocus>
            {confirmIcon ?? <IconCheck size={15} />} {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-text">{message}</p>
    </Modal>
  );
}

export type CalloutKind = 'info' | 'warning' | 'danger' | 'success';

// Inline notice with its icon: info (i), warning (triangle), danger (alert circle), success (check).
export function Callout({ kind, children, className = '' }: { kind: CalloutKind; children: ReactNode; className?: string }) {
  const icon =
    kind === 'warning' ? <IconWarning size={16} /> :
    kind === 'danger' ? <IconError size={16} /> :
    kind === 'success' ? <IconSuccess size={16} /> :
    <IconInfo size={16} />;
  return (
    <div className={`callout callout-${kind} ${className}`} role={kind === 'danger' ? 'alert' : undefined}>
      <span className="callout-icon">{icon}</span>
      <div className="callout-body">{children}</div>
    </div>
  );
}
