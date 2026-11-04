'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { ReactNode, useEffect, useRef } from 'react';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  // onClose is an inline callback at call sites: read it through a ref so the
  // Escape listener subscribes once instead of every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  const danger = tone === 'danger';
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => {
            if (!busy) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-letrents-navy/50 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-white/10 dark:bg-letrents-nightcard"
          >
            <div className="flex items-start gap-3 px-5 pt-5">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  danger
                    ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                    : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                }`}
              >
                {danger ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold text-letrents-navy dark:text-white">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {description}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={busy}
                aria-label="Close dialog"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children && <div className="px-5 pt-4">{children}</div>}
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/5"
              >
                {cancelLabel}
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onConfirm}
                disabled={busy || confirmDisabled}
                className={`rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  danger ? 'bg-red-600 hover:bg-red-700' : 'bg-letrents-blue hover:bg-blue-700'
                }`}
              >
                {busy ? 'Working…' : confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
