'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/** Display-only streaming effect. Respects prefers-reduced-motion. Click to skip. */
export default function Typewriter({
  text,
  speed = 30,
  className,
  onDone,
}: {
  text: string;
  speed?: number;
  className?: string;
  onDone?: () => void;
}) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    doneRef.current = false;
    if (reduced) {
      setShown(text.length);
      onDone?.();
      return;
    }
    setShown(0);
    if (text.length === 0) {
      onDone?.();
      return;
    }
    const timer = setInterval(() => {
      setShown((prev) => {
        // Ease: reveal faster as the message grows. Chunks are scaled to the
        // 30ms tick so perceived speed matches the old 9ms cadence with ~1/3
        // the re-renders.
        const next = prev + (text.length > 600 ? 20 : text.length > 250 ? 10 : 4);
        if (next >= text.length) {
          clearInterval(timer);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone?.();
          }
          return text.length;
        }
        return next;
      });
    }, speed);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <span
      className={className}
      onClick={() => {
        setShown(text.length);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      }}
      title="Click to show full message"
    >
      {text.slice(0, shown)}
      {shown < text.length && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 rounded-sm bg-letrents-blue motion-safe:animate-pulse"
        />
      )}
    </span>
  );
}
