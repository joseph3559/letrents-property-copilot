'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/** Display-only streaming effect. Respects prefers-reduced-motion. Click to skip. */
export default function Typewriter({
  text,
  speed = 9,
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
        // Ease: reveal faster as the message grows.
        const next = prev + (text.length > 600 ? 6 : text.length > 250 ? 3 : 1);
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
        <motion.span
          className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 rounded-sm bg-letrents-blue"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        />
      )}
    </span>
  );
}
