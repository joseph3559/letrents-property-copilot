'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ClipboardList,
  Droplets,
  ImagePlus,
  Loader2,
  Menu,
  MessagesSquare,
  MessageSquarePlus,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Search,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  AuditView,
  ConversationSummary,
  DEMO_PROMPTS,
  DemoScenario,
  MaintenanceView,
  PortfolioEntry,
  StatusView,
  TurnResult,
} from './api';
import { ApprovalCard, TurnCards } from './ResultCards';
import StepTimeline from './StepTimeline';
import ThemeToggle from './ThemeToggle';
import Typewriter from './Typewriter';
import VoiceRecorder from './VoiceRecorder';

const PROMPT_ICONS = [Droplets, MessagesSquare, ShieldAlert, Zap, Camera, BarChart3];

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

const ticketStatusStyle: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  approved: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  cancelled: 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400',
};

const ticketUrgencyStyle: Record<string, string> = {
  emergency: 'bg-red-600 text-white dark:bg-red-500',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  normal: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  low: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400',
};

function ConversationGroups({
  conversations,
  query,
  activeId,
  onOpen,
}: {
  conversations: ConversationSummary[];
  query: string;
  activeId: string | undefined;
  onOpen: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? conversations.filter((c) => (c.title || 'Untitled').toLowerCase().includes(q))
    : conversations;
  if (filtered.length === 0) {
    return (
      <div className="px-1 text-xs text-slate-400">
        {conversations.length === 0 ? 'No conversations yet.' : 'No matches.'}
      </div>
    );
  }
  const groups: Array<{ label: string | null; items: ConversationSummary[] }> = q
    ? [{ label: null, items: filtered }]
    : [
        { label: 'Today', items: filtered.filter((c) => isToday(c.updatedAt)) },
        { label: 'Earlier', items: filtered.filter((c) => !isToday(c.updatedAt)) },
      ].filter((g) => g.items.length > 0);
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.label ?? 'results'}>
          {group.label && (
            <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {group.label}
            </div>
          )}
          <div className="space-y-1">
            {group.items.map((c, i) => {
              const active = c.id === activeId;
              return (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  onClick={() => onOpen(c.id)}
                  className={`relative w-full rounded-lg px-2.5 py-2 text-left text-xs transition ${
                    active
                      ? 'bg-letrents-blue/10 font-semibold text-letrents-navy dark:bg-white/15 dark:text-white'
                      : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="convo-active-bar"
                      className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-1 rounded-full bg-letrents-teal"
                    />
                  )}
                  <div className="truncate pr-1">{c.title || 'Untitled'}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {c.messageCount} message{c.messageCount === 1 ? '' : 's'}
                    </span>
                    <span>{relativeTime(c.updatedAt)}</span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-letrents-nightcard"
    >
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-letrents-blue"
            animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </span>
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
        Copilot is analyzing records and preparing actions…
      </span>
    </motion.div>
  );
}

export default function CopilotApp() {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [turn, setTurn] = useState<TurnResult | null>(null);
  const [freshTurn, setFreshTurn] = useState(false);
  const [records, setRecords] = useState<MaintenanceView[]>([]);
  const [activity, setActivity] = useState<AuditView[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([]);
  const [rightTab, setRightTab] = useState<'records' | 'portfolio' | 'activity'>('records');
  const [recordFilter, setRecordFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [ticketQuery, setTicketQuery] = useState('');
  const [expandedProperty, setExpandedProperty] = useState<string | null>('prop-sunrise');
  const [resetting, setResetting] = useState(false);
  const [input, setInput] = useState('');
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [lastImage, setLastImage] = useState<string | null>(null);
  // Session-only: user-message id → attached photo. Never persisted (keeps the JSON store lean).
  const [messageImages, setMessageImages] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);
  const [sending, setSending] = useState(false);
  const [busyApproval, setBusyApproval] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileInspector, setMobileInspector] = useState(false);
  const [convoQuery, setConvoQuery] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshSide = useCallback(async (conversationId?: string) => {
    try {
      const [st, recs, acts, convos, port] = await Promise.all([
        api.status(),
        api.maintenance(),
        api.activity(conversationId),
        api.conversations(),
        api.portfolio(),
      ]);
      setStatus(st);
      setRecords(recs);
      setActivity(acts);
      setConversations(convos);
      setPortfolio(port);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh');
    }
  }, []);

  useEffect(() => {
    refreshSide(activeId);
  }, [refreshSide, activeId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [turn, sending]);

  const openConversation = useCallback(
    async (id: string) => {
      setError(null);
      setMobileNav(false);
      try {
        const { conversation, approvals } = await api.conversation(id);
        setActiveId(id);
        setFreshTurn(false);
        setLastImage(null);
        const lastAssistant = [...conversation.messages]
          .reverse()
          .find((m) => m.role === 'assistant');
        setTurn({
          conversation,
          assistantText: lastAssistant?.content ?? '',
          engine: status?.engine ?? 'local',
          model: status?.model ?? '',
          events: [],
          analysis: null,
          property: null,
          unit: null,
          tenant: null,
          history: [],
          duplicateOf: null,
          approval: approvals[0] ?? null,
          recommendations: [],
          tenantDraft: null,
          needsClarification: null,
          safetyGuidance: null,
          segments: [],
          assumedProperty: false,
          clarifyOptions: null,
          suggestions: [],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to open conversation');
      }
    },
    [status?.engine, status?.model]
  );

  const send = useCallback(
    async (text: string, attachedImage?: string) => {
      const content = text.trim();
      if (!content || sending) return;
      setSending(true);
      setError(null);
      setMobileNav(false);
      const outgoingImage = attachedImage ?? imageDataUrl;
      try {
        const result = await api.send(content, activeId, outgoingImage);
        setTurn(result);
        setFreshTurn(true);
        // Keep the previous photo for text follow-ups: a clarification answer
        // reuses the cached original server-side, and its SAM overlay needs it.
        setLastImage(outgoingImage ?? lastImage);
        if (outgoingImage) {
          const lastUser = [...result.conversation.messages].reverse().find((m) => m.role === 'user');
          if (lastUser) {
            setMessageImages((prev) => ({ ...prev, [lastUser.id]: outgoingImage }));
          }
        }
        setActiveId(result.conversation.id);
        setInput('');
        setImageName(null);
        setImageDataUrl(undefined);
        await refreshSide(result.conversation.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [activeId, imageDataUrl, lastImage, sending, refreshSide]
  );

  const [loadingScenario, setLoadingScenario] = useState<string | null>(null);

  const sendScenario = useCallback(
    async (scenario: DemoScenario) => {
      if (sending) return;
      if (!scenario.image) {
        void send(scenario.text);
        return;
      }
      setLoadingScenario(scenario.label);
      try {
        const res = await fetch(scenario.image);
        if (!res.ok) throw new Error('Demo photo unavailable');
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Failed to read demo photo'));
          reader.readAsDataURL(blob);
        });
        await send(scenario.text, dataUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load demo photo');
      } finally {
        setLoadingScenario(null);
      }
    },
    [send, sending]
  );

  const decide = useCallback(
    async (approvalId: string, decision: 'approve' | 'reject', note?: string) => {
      setBusyApproval(approvalId);
      setError(null);
      try {
        const result = await api.decide(approvalId, decision, note);
        setTurn((prev) =>
          prev && prev.approval?.id === approvalId
            ? {
                ...prev,
                approval: result.approval,
                assistantText:
                  decision === 'approve' && result.created
                    ? `${prev.assistantText}\n\nApproved. Maintenance record ${result.created.reference} created${result.created.assignedTo ? ' and assigned' : ''} with status ${result.created.status}.`
                    : `${prev.assistantText}\n\nProposal rejected. No record was created.`,
              }
            : prev
        );
        await refreshSide(activeId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Approval failed');
      } finally {
        setBusyApproval(null);
      }
    },
    [activeId, refreshSide]
  );

  const onFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError('Only jpeg/png/webp images are supported');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Image must be under 4MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result));
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const newChat = useCallback(() => {
    setActiveId(undefined);
    setTurn(null);
    setFreshTurn(false);
    setLastImage(null);
    setMessageImages({});
    setLightbox(null);
    setInput('');
    setImageName(null);
    setImageDataUrl(undefined);
    setError(null);
    setMobileNav(false);
  }, []);

  const resetDemo = useCallback(async () => {
    if (!window.confirm('Reset the demo? This clears all conversations and copilot-created records.')) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      await api.reset();
      setActiveId(undefined);
      setTurn(null);
      setFreshTurn(false);
      setLastImage(null);
      setMessageImages({});
      setLightbox(null);
      await refreshSide(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setResetting(false);
    }
  }, [refreshSide]);

  // ⌘K / Ctrl+K starts a new conversation (unless typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const tag = (document.activeElement?.tagName ?? '').toLowerCase();
        if (tag === 'textarea' || tag === 'input') return;
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat]);

  const lastAssistantId =
    turn && freshTurn
      ? [...turn.conversation.messages].reverse().find((m) => m.role === 'assistant')?.id
      : undefined;

  const sidebar = (
    <div className="relative flex h-full flex-col overflow-hidden border-r border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-800 dark:border-white/10 dark:from-letrents-navy dark:via-[#0a1c44] dark:to-[#060f28] dark:text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_45%_at_50%_0%,rgba(0,102,255,0.10),transparent_70%)] dark:bg-[radial-gradient(120%_45%_at_50%_0%,rgba(45,212,191,0.14),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(1,28,71,0.08)_1px,transparent_1px)] [background-size:16px_16px] dark:bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)]"
      />
      <div className="relative flex h-full min-h-0 flex-col">
      <div className="px-4 pb-2 pt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/letrents-logo.png" alt="LETRENTS" className="h-8 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/letrents-logo-dark.png" alt="" aria-hidden className="hidden h-8 w-auto dark:block" />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight text-letrents-navy dark:text-white">Property Copilot</span>
          <span className="rounded bg-teal-600/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:bg-letrents-teal/20 dark:text-letrents-teal">
            Demo
          </span>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-300/80">AI operations assistant</div>
      </div>
      <div className="px-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={newChat}
          className="group flex w-full items-center justify-center gap-2 rounded-lg bg-letrents-blue px-3 py-2.5 text-sm font-bold text-white shadow transition hover:bg-blue-500"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New conversation
          <kbd className="hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold text-white/90 group-hover:bg-white/25 lg:inline">
            ⌘K
          </kbd>
        </motion.button>
      </div>
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition focus-within:border-letrents-blue/60 dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:focus-within:border-letrents-teal/60">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            value={convoQuery}
            onChange={(e) => setConvoQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
          />
          {convoQuery && (
            <button
              onClick={() => setConvoQuery('')}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-300/70">
          Conversations
        </span>
        <span className="rounded-full bg-slate-900/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
          {conversations.length}
        </span>
      </div>
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <ConversationGroups
          conversations={conversations}
          query={convoQuery}
          activeId={activeId}
          onOpen={(id) => void openConversation(id)}
        />
      </div>
      <div className="border-t border-slate-200/80 px-3 py-3 dark:border-white/10">
        <div className="flex items-center gap-2.5 rounded-lg bg-white px-2.5 py-2 shadow-sm dark:bg-white/5 dark:shadow-none">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-letrents-blue text-xs font-bold text-white">
            DM
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center gap-1 text-xs font-bold text-slate-800 dark:text-white">
              <UserCheck className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
              Demo Manager
            </div>
            <div className="truncate text-[10px] text-slate-500 dark:text-slate-300/80">Sunrise Org · manager role</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 shadow-sm dark:bg-white/5 dark:shadow-none">
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                status?.engine === 'meta' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                status?.engine === 'meta' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </span>
          <span className="truncate text-[11px] font-semibold text-slate-600 dark:text-slate-200" title={status?.model ?? ''}>
            {status ? (status.engine === 'meta' ? `Meta AI · ${status.model}` : 'Local fallback') : 'Connecting…'}
          </span>
        </div>
        <button
          onClick={() => void resetDemo()}
          disabled={resetting}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:shadow-none dark:hover:bg-white/5 dark:hover:text-white"
          title="Clear conversations and copilot-created records; restore seed data"
        >
          <RotateCcw className={`h-3 w-3 ${resetting ? 'animate-spin' : ''}`} />
          {resetting ? 'Resetting…' : 'Reset demo data'}
        </button>
        <div className="mt-1.5 text-center text-[10px] text-slate-400 dark:text-slate-500">Synthetic dataset · no real tenants</div>
      </div>
      </div>
    </div>
  );

  const propertyName = useCallback(
    (propertyId: string) => portfolio.find((p) => p.property.id === propertyId)?.property.name ?? '—',
    [portfolio]
  );
  const unitNumber = useCallback(
    (propertyId: string, unitId: string | null) => {
      if (!unitId) return null;
      const entry = portfolio.find((p) => p.property.id === propertyId);
      return entry?.units.find((u) => u.id === unitId)?.unitNumber ?? null;
    },
    [portfolio]
  );
  const openRecords = records.filter((r) => !['resolved', 'rejected', 'cancelled'].includes(r.status));
  const resolvedRecords = records.filter((r) => ['resolved', 'rejected', 'cancelled'].includes(r.status));
  const recordCounts = { all: records.length, open: openRecords.length, resolved: resolvedRecords.length };
  const urgencyRank: Record<string, number> = { emergency: 0, high: 1, normal: 2, low: 3 };
  const ticketNeedle = ticketQuery.trim().toLowerCase();
  const filteredRecords = (recordFilter === 'all' ? records : recordFilter === 'open' ? openRecords : resolvedRecords)
    .filter((r) => {
      if (!ticketNeedle) return true;
      const haystack =
        `${r.reference} ${r.title} ${r.category} ${propertyName(r.propertyId)} ${unitNumber(r.propertyId, r.unitId) ?? ''}`.toLowerCase();
      return haystack.includes(ticketNeedle);
    })
    .sort(
      (a, b) =>
        (urgencyRank[a.urgency] ?? 9) - (urgencyRank[b.urgency] ?? 9) ||
        a.reference.localeCompare(b.reference)
    );

  const inspector = (
    <div className="flex h-full flex-col bg-white dark:bg-letrents-night">
      <div className="flex border-b border-slate-200 dark:border-white/10">
        {(
          [
            { id: 'records', label: `Tickets (${openRecords.length})`, icon: ClipboardList },
            { id: 'portfolio', label: 'Portfolio', icon: Building2 },
            { id: 'activity', label: 'Activity', icon: Activity },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1 px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide transition ${
              rightTab === tab.id
                ? 'border-b-2 border-letrents-blue text-letrents-navy dark:text-white'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {rightTab === 'records' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={ticketQuery}
                onChange={(e) => setTicketQuery(e.target.value)}
                placeholder="Search tickets…"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-letrents-blue focus:ring-2 focus:ring-letrents-blue/20 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              />
              {ticketQuery && (
                <button
                  onClick={() => setTicketQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {(['all', 'open', 'resolved'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setRecordFilter(f)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize transition ${
                    recordFilter === f
                      ? 'bg-letrents-blue text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15'
                  }`}
                >
                  {f} · {recordCounts[f]}
                </button>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {filteredRecords.map((r) => {
                const unit = unitNumber(r.propertyId, r.unitId);
                const closed = ['resolved', 'rejected', 'cancelled'].includes(r.status);
                return (
                  <motion.button
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => void send(r.reference)}
                    title={`Ask Copilot about ${r.reference}`}
                    className={`w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs shadow-sm transition hover:border-letrents-blue/40 hover:shadow dark:border-white/10 dark:bg-letrents-nightcard dark:hover:border-letrents-blue/50 ${
                      closed ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-400 dark:text-slate-500">{r.reference}</span>
                      <span
                        className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${
                          ticketStatusStyle[r.status] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                        }`}
                      >
                        {r.status === 'resolved' || r.status === 'approved' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : r.status === 'in_progress' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : r.status === 'rejected' || r.status === 'cancelled' ? (
                          <X className="h-3 w-3" />
                        ) : (
                          <CircleDashed className="h-3 w-3" />
                        )}
                        {r.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{r.title}</div>
                    <div className="text-slate-500 dark:text-slate-300">
                      {propertyName(r.propertyId)}
                      {unit ? ` · Unit ${unit}` : ' · common area'} · {r.category.replace(/_/g, ' ')}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          ticketUrgencyStyle[r.urgency] ?? 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                        }`}
                      >
                        {r.urgency}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
            {filteredRecords.length === 0 && (
              <div className="text-xs text-slate-400 dark:text-slate-500">
                {ticketNeedle ? `No tickets match “${ticketQuery.trim()}”.` : 'No tickets match this filter.'}
              </div>
            )}
          </div>
        ) : rightTab === 'portfolio' ? (
          <div className="space-y-2">
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500 dark:bg-white/5 dark:text-slate-400">
              Demo dataset · {portfolio.reduce((n, p) => n + p.totalUnits, 0)} units ·{' '}
              {portfolio.reduce((n, p) => n + p.units.filter((u) => u.tenant).length, 0)} tenants
            </div>
            {portfolio.map((entry) => {
              const expanded = expandedProperty === entry.property.id;
              const openCount = entry.pendingMaintenance + entry.inProgressMaintenance;
              return (
                <div
                  key={entry.property.id}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-letrents-nightcard"
                >
                  <button
                    onClick={() => setExpandedProperty(expanded ? null : entry.property.id)}
                    className="flex w-full items-center gap-2 p-2.5 text-left"
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-letrents-blue" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                        {entry.property.name}
                      </div>
                      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {entry.property.landlord} · {entry.occupiedUnits}/{entry.totalUnits} occupied ·{' '}
                        {openCount} open
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-slate-100 dark:border-white/5"
                      >
                        <ul className="divide-y divide-slate-50 dark:divide-white/5">
                          {entry.units.map((u) => (
                            <li key={u.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                              <span className="font-semibold text-slate-700 dark:text-slate-200">Unit {u.unitNumber}</span>
                              <span className="truncate text-slate-500 dark:text-slate-400">
                                {u.tenant ? u.tenant.fullName : <em>vacant</em>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {portfolio.length === 0 && <div className="text-xs text-slate-400 dark:text-slate-500">No properties.</div>}
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {activity.map((a) => (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm dark:border-white/10 dark:bg-letrents-nightcard"
                >
                  <div className="font-mono text-[11px] text-letrents-blue dark:text-letrents-teal">{a.action}</div>
                  <div className="mt-0.5 text-slate-700 dark:text-slate-200">{a.detail}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                    {new Date(a.createdAt).toLocaleString()}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {activity.length === 0 && <div className="text-xs text-slate-400 dark:text-slate-500">No activity yet.</div>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-letrents-mist dark:bg-letrents-night">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-red-50 text-center text-xs text-red-800"
          >
            <div className="px-4 py-2">
              {error}{' '}
              <button className="ml-2 font-bold underline" onClick={() => setError(null)}>
                dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-h-0 flex-1">
        <motion.aside
          initial={false}
          animate={{ width: sidebarOpen ? 288 : 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="hidden shrink-0 overflow-hidden md:block"
        >
          <div className="h-full w-72">{sidebar}</div>
        </motion.aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="z-10 flex items-center gap-2 border-b border-slate-200/80 bg-white/85 px-3 py-2.5 backdrop-blur dark:border-white/10 dark:bg-letrents-night/85">
            <button
              onClick={() => setMobileNav(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="hidden rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 md:block"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                {turn?.conversation.title || 'New conversation'}
              </div>
              <div className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block">
                Sunrise Apartments · Acacia Heights · Nairobi
              </div>
            </div>
            {status ? (
              <div className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    status.engine === 'meta'
                      ? 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.45)]'
                      : 'bg-amber-400 text-slate-900'
                  }`}
                  title={status.model}
                >
                  <Sparkles className="h-3 w-3" />
                  {status.engine === 'meta' ? `Meta AI · ${status.model}` : 'Local fallback'}
                </span>
                <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300 sm:inline">
                  {status.pendingApprovals} pending
                </span>
              </div>
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            )}
            <ThemeToggle />
            <button
              onClick={() => setMobileInspector(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 lg:hidden"
              aria-label="Open details panel"
            >
              <PanelRight className="h-5 w-5" />
            </button>
          </header>

          <div ref={threadRef} className="thread-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5">
            {!turn && !sending && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="mx-auto max-w-2xl pt-6 text-center"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-letrents-navy text-white shadow-lg"
                >
                  <Building2 className="h-7 w-7" />
                </motion.div>
                <h1 className="mt-4 text-2xl font-black tracking-tight text-letrents-navy dark:text-white sm:text-3xl">
                  From complaints to action.
                </h1>
                <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                  Describe it, speak it, or photograph it. You approve — it executes.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
                  {DEMO_PROMPTS.map((scenario, i) => {
                    const Icon = PROMPT_ICONS[i % PROMPT_ICONS.length];
                    const loading = loadingScenario === scenario.label;
                    return (
                      <motion.button
                        key={scenario.label}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.08 }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => void sendScenario(scenario)}
                        disabled={sending}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-letrents-blue/50 hover:shadow disabled:opacity-50 dark:border-white/10 dark:bg-letrents-nightcard dark:hover:border-letrents-blue/60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-letrents-mist text-letrents-blue dark:bg-white/10 dark:text-letrents-teal">
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </span>
                        <span>
                          <span className="block text-[13px] font-bold text-slate-800 dark:text-slate-100">
                            {scenario.label}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-slate-500 dark:text-slate-400">
                            {scenario.text}
                          </span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
                <p className="mt-4 text-xs tracking-wide text-slate-400 dark:text-slate-500">
                  Powered by Meta AI · Muse Spark · SAM 3.1 · Muse Voice
                </p>
                {status && !status.metaConfigured && (
                  <p className="mt-4 text-xs text-amber-700 dark:text-amber-400">
                    Running on the local fallback engine — add <code className="font-mono">META_API_KEY</code> to
                    use Meta AI.
                  </p>
                )}
              </motion.div>
            )}

            {turn && (
              <div className="mx-auto max-w-3xl space-y-4">
                <AnimatePresence initial={false}>
                  {turn.conversation.messages.map((m) =>
                    m.role === 'user' ? (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-end gap-1.5"
                      >
                        {messageImages[m.id] && (
                          <button
                            onClick={() => setLightbox(messageImages[m.id])}
                            title="View attached photo"
                            className="overflow-hidden rounded-xl border border-slate-200/80 shadow-sm transition hover:opacity-90 dark:border-white/15"
                          >
                            <img
                              src={messageImages[m.id]}
                              alt="Attached maintenance photo"
                              className="h-20 w-20 object-cover"
                            />
                          </button>
                        )}
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-letrents-navy px-4 py-2.5 text-sm leading-relaxed text-white shadow dark:bg-letrents-blue">
                          {m.content}
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm dark:border-white/10 dark:bg-letrents-nightcard dark:text-slate-100"
                      >
                        {m.id === lastAssistantId ? (
                          <Typewriter text={m.content} />
                        ) : (
                          <span>{m.content}</span>
                        )}
                      </motion.div>
                    )
                  )}
                </AnimatePresence>

                {sending && <ThinkingIndicator />}

                {!sending && turn.events.length > 0 && <StepTimeline events={turn.events} />}

                {!sending &&
                  (turn.analysis ||
                    turn.approval ||
                    turn.safetyGuidance ||
                    turn.duplicateOf ||
                    turn.segments.length > 0) && (
                    <TurnCards
                      turn={turn}
                      busyApproval={busyApproval}
                      imageDataUrl={lastImage}
                      onDecide={(approvalId, decision, note) => decide(approvalId, decision, note)}
                      onSelectOption={(label) => void send(label)}
                    />
                  )}

                {!sending && turn.approval && turn.approval.status !== 'pending' && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>
                      Engine: {turn.engine} · {turn.model}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200/80 bg-white/90 px-3 py-3 backdrop-blur dark:border-white/10 dark:bg-letrents-night/90">
            <div className="mx-auto max-w-3xl">
              <AnimatePresence>
                {imageName && imageDataUrl && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-2 flex items-center gap-2.5 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    <img
                      src={imageDataUrl}
                      alt="Photo to attach"
                      className="h-10 w-10 shrink-0 rounded-lg border border-slate-200/80 object-cover dark:border-white/15"
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <ImagePlus className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{imageName}</span>
                    </span>
                    <button
                      className="shrink-0 font-semibold underline"
                      onClick={() => {
                        setImageName(null);
                        setImageDataUrl(undefined);
                      }}
                    >
                      remove
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="relative flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-letrents-blue focus-within:ring-2 focus-within:ring-letrents-blue/20 dark:border-white/15 dark:bg-letrents-nightcard">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-letrents-navy dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                  title="Attach a maintenance photo (optional)"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>
                <VoiceRecorder
                  disabled={sending}
                  onError={(message) => setError(message)}
                  onTranscribed={(text) => setInput(text)}
                />
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={2}
                  placeholder="Describe a complaint or ask about your properties…"
                  className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => send(input)}
                  disabled={sending || !input.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-letrents-blue text-white shadow transition hover:bg-blue-700 disabled:opacity-40"
                  aria-label="Send message"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <SendHorizontal className="h-5 w-5" />
                  )}
                </motion.button>
              </div>
              <div className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
                Enter to send · Shift+Enter for a new line · Photos help the AI assess damage
              </div>
            </div>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 border-l border-slate-200/80 dark:border-white/10 lg:block">{inspector}</aside>
      </div>

      <AnimatePresence>
        {mobileNav && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNav(false)}
              className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-72 md:hidden"
            >
              <button
                onClick={() => setMobileNav(false)}
                className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-slate-500 hover:bg-slate-900/5 dark:text-white/70 dark:hover:bg-white/10"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
              {sidebar}
            </motion.aside>
          </>
        )}
        {mobileInspector && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileInspector(false)}
              className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] lg:hidden"
            >
              <button
                onClick={() => setMobileInspector(false)}
                className="absolute left-2 top-2 z-10 rounded-lg bg-white p-1.5 text-slate-600 shadow hover:bg-slate-100"
                aria-label="Close details panel"
              >
                <X className="h-5 w-5" />
              </button>
              {inspector}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-letrents-navy/70 p-6 backdrop-blur-sm"
          >
            <motion.img
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              src={lightbox}
              alt="Attached maintenance photo, full size"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] max-w-[90vw] rounded-2xl border border-white/20 object-contain shadow-2xl"
            />
            <button
              onClick={() => setLightbox(null)}
              aria-label="Close photo viewer"
              className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
