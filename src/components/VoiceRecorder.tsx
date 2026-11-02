'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Mic, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const SAMPLE_RATE = 16000;
const MAX_SECONDS = 60;

function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read recording'));
    reader.readAsDataURL(blob);
  });
}

/** Mic recorder → 16kHz mono WAV → Muse Voice Transcribe → transcript. */
export default function VoiceRecorder({
  onTranscribed,
  onError,
  disabled,
}: {
  onTranscribed: (text: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const chunksRef = useRef<Float32Array[]>([]);
  const nodesRef = useRef<{
    stream: MediaStream;
    ctx: AudioContext;
    processor: ScriptProcessorNode;
    source: MediaStreamAudioSourceNode;
    sink: GainNode;
    timer: ReturnType<typeof setInterval>;
  } | null>(null);

  const cleanup = useCallback(() => {
    const nodes = nodesRef.current;
    nodesRef.current = null;
    if (!nodes) return;
    clearInterval(nodes.timer);
    try {
      nodes.processor.disconnect();
      nodes.source.disconnect();
      nodes.sink.disconnect();
      void nodes.ctx.close();
    } catch {
      /* already torn down */
    }
    nodes.stream.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback(
    async (cancel: boolean) => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      cleanup();
      setRecording(false);
      setElapsed(0);
      if (cancel || chunks.length === 0) return;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      if (total < SAMPLE_RATE / 2) {
        onError('Recording too short — hold the complaint for at least a second.');
        return;
      }
      const merged = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      setTranscribing(true);
      try {
        const dataUrl = await blobToDataUrl(encodeWav(merged));
        const res = await fetch('/api/copilot/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioDataUrl: dataUrl }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          data?: { transcript?: string };
        };
        if (!res.ok || body.success === false || !body.data?.transcript) {
          throw new Error(body.message || `Transcription failed (${res.status})`);
        }
        onTranscribed(body.data.transcript);
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Transcription failed');
      } finally {
        setTranscribing(false);
      }
    },
    [cleanup, onError, onTranscribed]
  );

  const start = useCallback(async () => {
    if (recording || transcribing || disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx({ sampleRate: SAMPLE_RATE });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      chunksRef.current = [];
      processor.onaudioprocess = (event) => {
        chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(sink);
      sink.connect(ctx.destination);
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_SECONDS) void stop(false);
      }, 250);
      nodesRef.current = { stream, ctx, processor, source, sink, timer };
      setRecording(true);
      setElapsed(0);
    } catch {
      onError('Microphone access denied. Allow the microphone to record a voice note.');
    }
  }, [disabled, onError, recording, stop, transcribing]);

  return (
    <>
      <button
        onClick={() => void (recording ? stop(false) : start())}
        disabled={disabled || transcribing}
        className={`rounded-xl p-2.5 transition ${
          recording
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'text-slate-500 hover:bg-slate-100 hover:text-letrents-navy'
        } disabled:opacity-40`}
        title={recording ? 'Stop and transcribe' : 'Record a voice-note complaint'}
        aria-label={recording ? 'Stop recording' : 'Record voice note'}
      >
        {transcribing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : recording ? (
          <Square className="h-5 w-5" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>
      <AnimatePresence>
        {(recording || transcribing) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute inset-x-0 bottom-full z-10 mb-2"
          >
            <div className="flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-2 text-white">
              {recording ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                  </span>
                  <span className="flex items-end gap-0.5" aria-hidden>
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1 rounded-full bg-letrents-teal"
                        animate={{ height: [6, 14 + ((i * 5) % 10), 6] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12 }}
                      />
                    ))}
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {elapsed}s / {MAX_SECONDS}s — describe the issue, then stop
                  </span>
                  <span className="flex-1" />
                  <button
                    onClick={() => void stop(true)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-white/10"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-letrents-teal" />
                  <span className="text-xs font-medium text-slate-200">
                    Transcribing with Muse Voice…
                  </span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
