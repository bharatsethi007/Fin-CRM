import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const toast = {
    success: (msg: string) => addToast(msg, 'success'),
    error: (msg: string) => addToast(msg, 'error'),
    info: (msg: string) => addToast(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={{ toasts, toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}

const TOAST_STYLES: Record<ToastType, React.CSSProperties> = {
  success: { background: '#065f46', borderLeft: '4px solid #10b981' },
  error: { background: '#991b1b', borderLeft: '4px solid #ef4444' },
  info: { background: '#1e3a5f', borderLeft: '4px solid #3b82f6' },
};

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      <style>{`
        @keyframes toast-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes toast-fade-out { from { opacity: 1; } to { opacity: 0; transform: translateX(40px); } }
      `}</style>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            ...TOAST_STYLES[t.type],
            color: 'white',
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 280,
            maxWidth: 420,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            pointerEvents: 'auto',
            animation: 'toast-slide-in 0.25s ease-out',
            cursor: 'pointer',
          }}
          onClick={() => onDismiss(t.id)}
          role="alert"
        >
          <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{ICONS[t.type]}</span>
          <span style={{ lineHeight: 1.4 }}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
