'use client';

import { motion } from 'framer-motion';
import {
  BrainCircuit,
  Building2,
  CheckCheck,
  CopyX,
  DoorOpen,
  FileClock,
  History,
  ListChecks,
  ScanSearch,
  Siren,
  Stamp,
  Users,
} from 'lucide-react';
import { useMemo } from 'react';

function iconFor(event: string) {
  const e = event.toLowerCase();
  if (e.includes('safety') || e.includes('escalation')) return Siren;
  if (e.includes('duplicate')) return CopyX;
  if (e.includes('approval')) return Stamp;
  if (e.includes('intent')) return ScanSearch;
  if (e.includes('analyz')) return BrainCircuit;
  if (e.includes('propert')) return Building2;
  if (e.includes('unit')) return DoorOpen;
  if (e.includes('history')) return History;
  if (e.includes('staff') || e.includes('recommend')) return Users;
  if (e.includes('tenant') || e.includes('draft')) return FileClock;
  if (e.includes('retriev') || e.includes('data')) return ListChecks;
  return CheckCheck;
}

function toneFor(event: string): string {
  const e = event.toLowerCase();
  if (e.includes('safety') || e.includes('escalation') || e.includes('duplicate')) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300';
  }
  if (e.includes('fallback') || e.includes('unavailable')) {
    return 'border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-slate-400';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300';
}

/** Animated agent step timeline — turns backend events into visible reasoning. */
export default function StepTimeline({ events }: { events: string[] }) {
  const steps = useMemo(() => events.slice(0, 12), [events]);
  if (steps.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Agent trail
        </span>
      </div>
      <ol className="space-y-1">
        {steps.map((event, i) => {
          const Icon = iconFor(event);
          return (
            <motion.li
              key={`${i}-${event.slice(0, 24)}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.28, type: 'spring', stiffness: 320, damping: 26 }}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-1"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.25 + i * 0.28, type: 'spring', stiffness: 400, damping: 16 }}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${toneFor(event)}`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
              </motion.span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600 dark:text-slate-300" title={event}>
                {event}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
