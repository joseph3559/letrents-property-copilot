'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Droplets,
  ImagePlus,
  Loader2,
  Menu,
  MessageSquarePlus,
  PanelRight,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  AuditView,
  ConversationSummary,
  DEMO_PROMPTS,
  MaintenanceView,
  StatusView,
  TurnResult,
} from './api';
import { ApprovalCard, TurnCards } from './ResultCards';
import StepTimeline from './StepTimeline';
import Typewriter from './Typewriter';

const PROMPT_ICONS = [Droplets, ShieldAlert, Zap, BarChart3, Waves];

function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
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
      <span className="text-sm font-medium text-slate-600">
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
  const [rightTab, setRightTab] = useState<'records' | 'activity'>('records');
  const [input, setInput] = useState('');
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [busyApproval, setBusyApproval] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [mobileInspector, setMobileInspector] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshSide = useCallback(async (conversationId?: string) => {
    try {
      const [st, recs, acts, convos] = await Promise.all([
        api.status(),
        api.maintenance(),
        api.activity(conversationId),
        api.conversations(),
      ]);
      setStatus(st);
      setRecords(recs);
      setActivity(acts);
      setConversations(convos);
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
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to open conversation');
      }
    },
    [status?.engine, status?.model]
  );

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      setSending(true);
      setError(null);
      setMobileNav(false);
      try {
        const result = await api.send(content, activeId, imageDataUrl);
        setTurn(result);
        setFreshTurn(true);
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
    [activeId, imageDataUrl, sending, refreshSide]
  );

  const decide = useCallback(
    async (approvalId: string, decision: 'approve' | 'reject') => {
      setBusyApproval(approvalId);
      setError(null);
      try {
        const result = await api.decide(approvalId, decision);
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
    setInput('');
    setImageName(null);
    setImageDataUrl(undefined);
    setError(null);
    setMobileNav(false);
  }, []);

  const lastAssistantId =
    turn && freshTurn
      ? [...turn.conversation.messages].reverse().find((m) => m.role === 'assistant')?.id
      : undefined;

  const sidebar = (
    <div className="flex h-full flex-col bg-letrents-navy text-white">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/letrents-logo-light.png" alt="LETRENTS" className="h-7 w-auto" />
        <div className="leading-tight">
          <div className="text-[13px] font-bold">Property Copilot</div>
          <div className="text-[11px] text-slate-300/80">AI operations assistant</div>
        </div>
      </div>
      <div className="px-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={newChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-letrents-blue px-3 py-2.5 text-sm font-bold text-white shadow transition hover:bg-blue-500"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New conversation
        </motion.button>
      </div>
      <div className="px-3 pb-2 pt-4">
        <div className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-300/70">
          Try a scenario
        </div>
        <div className="space-y-1">
          {DEMO_PROMPTS.map((p, i) => {
            const Icon = PROMPT_ICONS[i % PROMPT_ICONS.length];
            return (
              <button
                key={p}
                onClick={() => send(p)}
                disabled={sending}
                className="group flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left text-xs leading-snug text-slate-100 transition hover:border-letrents-teal/60 hover:bg-white/10 disabled:opacity-50"
              >
                <Icon className="h-4 w-4 shrink-0 text-letrents-teal" />
                <span className="line-clamp-2">{p}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-300/70">
        Conversations
      </div>
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-1">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition ${
                c.id === activeId
                  ? 'bg-white/15 font-semibold text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="truncate">{c.title || 'Untitled'}</div>
              <div className="text-[10px] text-slate-400">
                {c.messageCount} message{c.messageCount === 1 ? '' : 's'}
              </div>
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="px-1 text-xs text-slate-400">No conversations yet.</div>
          )}
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-2.5 text-[10px] text-slate-400">
        Demo workspace · synthetic data
      </div>
    </div>
  );

  const inspector = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex border-b border-slate-200">
        {(
          [
            { id: 'records', label: `Maintenance (${records.length})`, icon: ClipboardList },
            { id: 'activity', label: 'Activity', icon: Activity },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
              rightTab === tab.id
                ? 'border-b-2 border-letrents-blue text-letrents-navy'
                : 'text-slate-400 hover:text-slate-600'
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
            <AnimatePresence initial={false}>
              {records.map((r) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-400">{r.reference}</span>
                    <span
                      className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${
                        r.status === 'resolved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : r.status === 'rejected'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {r.status === 'resolved' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <CircleDashed className="h-3 w-3" />
                      )}
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold text-slate-800">{r.title}</div>
                  <div className="text-slate-500">
                    {r.category.replace(/_/g, ' ')} · {r.urgency}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {records.length === 0 && <div className="text-xs text-slate-400">No records.</div>}
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
                  className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm"
                >
                  <div className="font-mono text-[11px] text-letrents-blue">{a.action}</div>
                  <div className="mt-0.5 text-slate-700">{a.detail}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {new Date(a.createdAt).toLocaleString()}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {activity.length === 0 && <div className="text-xs text-slate-400">No activity yet.</div>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-letrents-mist">
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
        <aside className="hidden w-72 shrink-0 md:block">{sidebar}</aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="z-10 flex items-center gap-2 border-b border-slate-200/80 bg-white/85 px-3 py-2.5 backdrop-blur">
            <button
              onClick={() => setMobileNav(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-900">
                {turn?.conversation.title || 'New conversation'}
              </div>
              <div className="hidden text-[11px] text-slate-500 sm:block">
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
                <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 sm:inline">
                  {status.pendingApprovals} pending
                </span>
              </div>
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            )}
            <button
              onClick={() => setMobileInspector(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
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
                <h1 className="mt-4 text-2xl font-black tracking-tight text-letrents-navy sm:text-3xl">
                  From complaints to action.
                </h1>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                  Describe a maintenance issue or ask about your portfolio. The Copilot pulls real
                  records, analyzes the problem, and prepares approvals — you stay in control.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
                  {DEMO_PROMPTS.map((p, i) => {
                    const Icon = PROMPT_ICONS[i % PROMPT_ICONS.length];
                    return (
                      <motion.button
                        key={p}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.08 }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => send(p)}
                        disabled={sending}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-letrents-blue/50 hover:shadow disabled:opacity-50"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-letrents-mist text-letrents-blue">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-[13px] font-medium leading-snug text-slate-700">{p}</span>
                      </motion.button>
                    );
                  })}
                </div>
                {status && !status.metaConfigured && (
                  <p className="mt-4 text-xs text-amber-700">
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
                        className="flex justify-end"
                      >
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-letrents-navy px-4 py-2.5 text-sm leading-relaxed text-white shadow">
                          {m.content}
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm"
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
                  (turn.analysis || turn.approval || turn.safetyGuidance || turn.duplicateOf) && (
                    <TurnCards
                      turn={turn}
                      busyApproval={busyApproval}
                      onDecide={(approvalId, decision) => decide(approvalId, decision)}
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

          <div className="border-t border-slate-200/80 bg-white/90 px-3 py-3 backdrop-blur">
            <div className="mx-auto max-w-3xl">
              <AnimatePresence>
                {imageName && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-2 flex items-center justify-between overflow-hidden rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600"
                  >
                    <span className="flex items-center gap-1.5">
                      <ImagePlus className="h-3.5 w-3.5" /> {imageName}
                    </span>
                    <button
                      className="font-semibold underline"
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
              <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-letrents-blue focus-within:ring-2 focus-within:ring-letrents-blue/20">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-letrents-navy"
                  title="Attach a maintenance photo (optional)"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>
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
                  className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
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
              <div className="mt-1.5 text-center text-[11px] text-slate-400">
                Enter to send · Shift+Enter for a new line · Photos help the AI assess damage
              </div>
            </div>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 border-l border-slate-200/80 lg:block">{inspector}</aside>
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
                className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10"
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
    </div>
  );
}
