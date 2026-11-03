'use client';

import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Copy,
  DoorOpen,
  Droplets,
  History,
  Package,
  ShieldAlert,
  Sparkles,
  Thermometer,
  User,
  Users,
  Waves,
  Wrench,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import {
  AnalysisView,
  ApprovalView,
  MaintenanceView,
  PropertyView,
  StaffRecView,
  TenantView,
  TurnResult,
  UnitView,
} from './api';
import SegmentOverlay from './SegmentOverlay';
import { ConfirmDialog } from './ConfirmDialog';

const cardMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

function categoryIcon(category: string) {
  switch (category) {
    case 'plumbing':
      return Droplets;
    case 'electrical':
      return Zap;
    case 'security':
      return ShieldAlert;
    case 'structural':
      return Building2;
    case 'water_supply':
      return Waves;
    case 'cleaning':
      return Sparkles;
    case 'hvac':
      return Thermometer;
    case 'general':
      return Wrench;
    default:
      return Package;
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{children}</div>
  );
}

function urgencyClass(urgency: string) {
  return `urgency-${urgency} inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold`;
}

export function AnalysisCard({
  analysis,
  property,
  unit,
  tenant,
  index = 0,
}: {
  analysis: AnalysisView;
  property: PropertyView | null;
  unit: UnitView | null;
  tenant: TenantView | null;
  index?: number;
}) {
  const CategoryIcon = categoryIcon(analysis.category);
  return (
    <motion.div
      {...cardMotion}
      transition={{ delay: 0.15 + index * 0.12, type: 'spring', stiffness: 160, damping: 22 }}
      className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(1,28,71,0.08)] dark:border-white/10 dark:bg-letrents-nightcard"
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-white/5 dark:bg-white/5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-letrents-navy text-white dark:bg-letrents-blue">
          <CategoryIcon className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-slate-900 dark:text-white">{analysis.title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{analysis.category.replace(/_/g, ' ')}</div>
        </div>
        <span className={urgencyClass(analysis.urgency)}>
          {analysis.urgency === 'emergency' && <AlertTriangle className="h-3.5 w-3.5" />}
          {analysis.urgency}
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{analysis.description}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-letrents-blue dark:text-letrents-teal" />
            <div>
              <Label>Property</Label>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{property?.name ?? '—'}</div>
              {property && <div className="text-xs text-slate-500 dark:text-slate-400">{property.address}</div>}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-letrents-blue dark:text-letrents-teal" />
            <div>
              <Label>Unit</Label>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {unit ? `Unit ${unit.unitNumber}` : 'Common area'}
              </div>
              {unit && <div className="text-xs text-slate-500 dark:text-slate-400">{unit.status}</div>}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-letrents-blue dark:text-letrents-teal" />
            <div>
              <Label>Tenant</Label>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tenant?.fullName ?? '—'}</div>
            </div>
          </div>
        </div>
        {analysis.safetyRisk && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-bold">Safety risk: </span>
              {analysis.safetyRisk}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export function HistoryCard({ history, index = 1 }: { history: MaintenanceView[]; index?: number }) {
  return (
    <motion.div
      {...cardMotion}
      transition={{ delay: 0.15 + index * 0.12, type: 'spring', stiffness: 160, damping: 22 }}
      className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(1,28,71,0.08)] dark:border-white/10 dark:bg-letrents-nightcard"
    >
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-slate-400" />
        <Label>
          {history.length > 0 ? `Maintenance history (${history.length})` : 'Maintenance history'}
        </Label>
      </div>
      {history.length === 0 ? (
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">No prior records for this location.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
          {history.slice(0, 5).map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <div className="min-w-0">
                <span className="mr-2 font-mono text-xs text-slate-400">{h.reference}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{h.title}</span>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {h.category.replace(/_/g, ' ')} · {h.urgency}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {h.status.replace(/_/g, ' ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

export function StaffCard({
  recommendations,
  index = 2,
}: {
  recommendations: StaffRecView[];
  index?: number;
}) {
  if (recommendations.length === 0) return null;
  return (
    <motion.div
      {...cardMotion}
      transition={{ delay: 0.15 + index * 0.12, type: 'spring', stiffness: 160, damping: 22 }}
      className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(1,28,71,0.08)] dark:border-white/10 dark:bg-letrents-nightcard"
    >
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-slate-400" />
        <Label>Recommended staff</Label>
      </div>
      <ul className="mt-2 space-y-2">
        {recommendations.map((r, i) => (
          <motion.li
            key={r.staff.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 + index * 0.12 + i * 0.1 }}
            className="flex items-center gap-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-letrents-mist text-xs font-bold text-letrents-navy dark:bg-white/10 dark:text-white">
              {r.staff.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {r.staff.fullName} <span className="font-normal text-slate-500 dark:text-slate-400">· {r.staff.role}</span>
              </div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">{r.reason}</div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span
                className={`h-2 w-2 rounded-full ${r.staff.available ? 'bg-emerald-500' : 'bg-amber-400'}`}
              />
              {r.staff.available ? 'Available' : 'Busy'}
            </span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

export function TenantDraftCard({ draft, index = 3 }: { draft: string; index?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.div
      {...cardMotion}
      transition={{ delay: 0.15 + index * 0.12, type: 'spring', stiffness: 160, damping: 22 }}
      className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 dark:border-white/15 dark:bg-white/5"
    >
      <div className="flex items-center justify-between">
        <Label>Tenant reply — draft, not sent</Label>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(draft).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-200/60 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-1 text-sm italic leading-relaxed text-slate-700 dark:text-slate-200">“{draft}”</p>
    </motion.div>
  );
}

const approvalStatusStyle: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  executed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

const approvalStatusLabel: Record<string, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Approved & executed',
  failed: 'Execution failed',
};

export function ApprovalCard({
  approval,
  onDecide,
  busy,
  index = 4,
}: {
  approval: ApprovalView;
  onDecide: (decision: 'approve' | 'reject', note?: string) => void;
  busy: boolean;
  index?: number;
}) {
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [notifyTenant, setNotifyTenant] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const payload = approval.payload as Record<string, string | null>;
  const pending = approval.status === 'pending';

  const openDialog = (which: 'approve' | 'reject') => {
    setReviewed(false);
    setRejectReason('');
    setDialog(which);
  };
  const approveNote = notifyTenant
    ? 'Approved from Property Copilot. Notify tenant by SMS.'
    : 'Approved from Property Copilot. Do not notify tenant.';
  const rejectNote = rejectReason.trim()
    ? `Rejected from Property Copilot. Reason: ${rejectReason.trim().slice(0, 280)}`
    : undefined;

  return (
    <>
      <motion.div
        {...cardMotion}
        transition={{ delay: 0.15 + index * 0.12, type: 'spring', stiffness: 140, damping: 20 }}
        className={`overflow-hidden rounded-xl border bg-white shadow-[0_1px_3px_rgba(1,28,71,0.08)] dark:bg-letrents-nightcard ${
          pending ? 'approval-pending border-letrents-blue/50' : 'border-slate-200/80 dark:border-white/10'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold text-letrents-navy dark:text-white">{approval.title}</div>
            <div className="truncate text-[13px] text-slate-500 dark:text-slate-400">{approval.summary}</div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${approvalStatusStyle[approval.status] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}
          >
            {approvalStatusLabel[approval.status] ?? approval.status}
          </span>
        </div>
        {payload?.createdReference && (
          <div className="border-t border-emerald-100 bg-emerald-50/60 px-4 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            Created record {String(payload.createdReference)} — visible in Maintenance.
          </div>
        )}
        {pending && (
          <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 dark:border-white/5">
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              onClick={() => openDialog('approve')}
              className="rounded-lg bg-letrents-blue px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              Approve & create
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              onClick={() => openDialog('reject')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/5"
            >
              Reject
            </motion.button>
          </div>
        )}
      </motion.div>

      <ConfirmDialog
        open={dialog === 'approve'}
        title="Approve maintenance request?"
        description={`This creates the record for “${approval.title}” and assigns it. The decision is written to the audit trail.`}
        confirmLabel="Approve & create"
        busy={busy}
        confirmDisabled={!reviewed}
        onConfirm={() => {
          onDecide('approve', approveNote);
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      >
        <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/5">
          <button
            role="switch"
            aria-checked={notifyTenant}
            onClick={() => setNotifyTenant((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-sm font-semibold text-letrents-navy dark:text-white">
                Notify tenant by SMS
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Send the drafted update to the tenant
              </span>
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                notifyTenant ? 'bg-letrents-blue' : 'bg-slate-300 dark:bg-white/20'
              }`}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${
                  notifyTenant ? 'right-0.5' : 'left-0.5'
                }`}
              />
            </span>
          </button>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-letrents-blue"
            />
            <span>I reviewed the category, urgency and assignment above.</span>
          </label>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'reject'}
        title="Reject this proposal?"
        description="No record will be created. The rejection is written to the audit trail."
        confirmLabel="Reject proposal"
        tone="danger"
        busy={busy}
        onConfirm={() => {
          onDecide('reject', rejectNote);
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      >
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={2}
          maxLength={280}
          placeholder="Reason (optional) — e.g. duplicate of MNT-1002"
          className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:focus:border-red-500/50 dark:focus:ring-red-500/10"
        />
      </ConfirmDialog>
    </>
  );
}

export function ClarifyingCard({
  turn,
  index = 0,
  onSelect,
}: {
  turn: TurnResult;
  index?: number;
  onSelect?: (label: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.12, type: 'spring', stiffness: 160, damping: 22 }}
      className="rounded-xl border border-letrents-blue/30 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(1,28,71,0.08)] dark:border-letrents-blue/40 dark:bg-letrents-nightcard"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-letrents-navy dark:text-white">
          Understood so far
        </span>
        {turn.analysis && (
          <>
            <span className={urgencyClass(turn.analysis.urgency)}>{turn.analysis.urgency}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-slate-300">
              {turn.analysis.category.replace(/_/g, ' ')}
            </span>
          </>
        )}
      </div>
      {turn.analysis && (
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{turn.analysis.description}</p>
      )}
      {turn.needsClarification && (
        <p className="mt-2 border-t border-slate-100 pt-2 text-sm font-semibold text-slate-800 dark:border-white/10 dark:text-slate-100">
          {turn.needsClarification}
        </p>
      )}
      {turn.clarifyOptions && turn.clarifyOptions.length > 0 && onSelect && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {turn.clarifyOptions.map((option) => (
            <motion.button
              key={option.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelect(option.label)}
              className="rounded-full border border-letrents-blue/40 bg-letrents-blue/5 px-3.5 py-1.5 text-sm font-semibold text-letrents-blue transition hover:bg-letrents-blue hover:text-white dark:text-letrents-teal dark:hover:bg-letrents-blue dark:hover:text-white"
            >
              {option.label}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function TurnCards({
  turn,
  onDecide,
  busyApproval,
  imageDataUrl,
  onSelectOption,
}: {
  turn: TurnResult;
  onDecide: (approvalId: string, decision: 'approve' | 'reject', note?: string) => void;
  busyApproval: string | null;
  imageDataUrl?: string | null;
  onSelectOption?: (label: string) => void;
}) {
  let cardIndex = 0;
  return (
    <div className="space-y-3">
      {turn.safetyGuidance && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <span>
            <span className="font-bold">Safety escalation: </span>
            {turn.safetyGuidance}
          </span>
        </motion.div>
      )}
      {turn.needsClarification ? (
        <ClarifyingCard turn={turn} index={cardIndex++} onSelect={onSelectOption} />
      ) : (
        turn.analysis && (
          <AnalysisCard
            analysis={turn.analysis}
            property={turn.property}
            unit={turn.unit}
            tenant={turn.tenant}
            index={cardIndex++}
          />
        )
      )}
      {turn.duplicateOf && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <span className="font-bold">Possible duplicate: </span>
          {turn.duplicateOf.reference} — “{turn.duplicateOf.title}” ({turn.duplicateOf.status}). No
          new request was created.
        </motion.div>
      )}
      {turn.analysis && !turn.needsClarification && (
        <HistoryCard history={turn.history} index={cardIndex++} />
      )}
      {turn.segments.length > 0 && imageDataUrl && (
        <SegmentOverlay imageDataUrl={imageDataUrl} segments={turn.segments} index={cardIndex++} />
      )}
      {turn.recommendations.length > 0 && (
        <StaffCard recommendations={turn.recommendations} index={cardIndex++} />
      )}
      {turn.tenantDraft && <TenantDraftCard draft={turn.tenantDraft} index={cardIndex++} />}
      {turn.approval && (
        <ApprovalCard
          approval={turn.approval}
          busy={busyApproval === turn.approval.id}
          onDecide={(decision, note) => onDecide(turn.approval!.id, decision, note)}
          index={cardIndex++}
        />
      )}
      {turn.suggestions.length > 0 && onSelectOption && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + cardIndex * 0.12 }}
          className="flex flex-wrap items-center gap-2 pt-1"
        >
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Follow up:</span>
          {turn.suggestions.map((suggestion) => (
            <motion.button
              key={suggestion}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelectOption(suggestion)}
              className="rounded-full border border-slate-300/80 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-600 shadow-sm transition hover:border-letrents-blue/50 hover:text-letrents-blue dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:border-letrents-teal/50 dark:hover:text-letrents-teal"
            >
              {suggestion}
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
