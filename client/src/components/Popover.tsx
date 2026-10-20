import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Floating panel anchored to its parent element. Rendered in a top layer so scrolling grids and
// modals can't clip it; closes on outside click or Escape.
export function Popover({ open, onClose, children, align = 'left', className = '' }: { open: boolean; onClose: () => void; children: ReactNode; align?: 'left' | 'right'; className?: string }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = markerRef.current?.parentElement;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight ?? 0;
      const fitsBelow = r.bottom + 4 + panelHeight <= window.innerHeight - 8;
      const top = fitsBelow || r.top - panelHeight - 4 < 8 ? r.bottom + 4 : r.top - panelHeight - 4;
      setPos(align === 'right' ? { top, right: Math.max(8, window.innerWidth - r.right) } : { top, left: Math.max(8, r.left) });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || markerRef.current?.parentElement?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  return (
    <>
      <span ref={markerRef} hidden />
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={`popover ${className}`}
            style={{ top: pos?.top ?? -9999, left: pos?.left, right: pos?.right, visibility: pos ? 'visible' : 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

// Every item reserves the icon slot so labels line up whether or not an icon is given.
export function MenuItem({ children, onClick, disabled, icon }: { children: ReactNode; onClick: () => void; disabled?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" className="menu-item" onClick={onClick} disabled={disabled}>
      <span className="menu-icon" aria-hidden>{icon}</span>
      {children}
    </button>
  );
}
