'use client';

import { motion } from 'framer-motion';
import { ScanSearch } from 'lucide-react';
import { SegmentView } from './api';

const BOX_COLORS = ['#0264FD', '#23A2C7', '#F59E0B', '#10B981', '#EF4444'];

/** Maintenance photo with SAM 3.1 damage-region overlays. */
export default function SegmentOverlay({
  imageDataUrl,
  segments,
  index = 0,
}: {
  imageDataUrl: string;
  segments: SegmentView[];
  index?: number;
}) {
  const dims = segments[0];
  const viewBox = dims ? `0 0 ${dims.width} ${dims.height}` : '0 0 100 100';
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.12, type: 'spring', stiffness: 160, damping: 22 }}
      className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(1,28,71,0.08)] dark:border-white/10 dark:bg-letrents-nightcard"
    >
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 dark:border-white/5 dark:bg-white/5">
        <ScanSearch className="h-4 w-4 text-letrents-blue dark:text-letrents-teal" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Damage regions · SAM 3.1 ({segments.length})
        </span>
      </div>
      <div className="relative bg-slate-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageDataUrl} alt="Maintenance photo with detected damage regions" className="h-auto w-full" />
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
        >
          {segments.map((s, i) => {
            const color = BOX_COLORS[i % BOX_COLORS.length];
            const label = `${s.phrase}${s.confidence !== null ? ` ${(s.confidence * 100).toFixed(0)}%` : ''}`;
            return (
              <motion.g
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.18 }}
              >
                <rect
                  x={s.x1}
                  y={s.y1}
                  width={Math.max(s.x2 - s.x1, 4)}
                  height={Math.max(s.y2 - s.y1, 4)}
                  fill={color}
                  fillOpacity={0.14}
                  stroke={color}
                  strokeWidth={Math.max(dims.width / 400, 3)}
                />
                <text
                  x={s.x1}
                  y={Math.max(s.y1 - 10, 28)}
                  fill={color}
                  fontSize={Math.max(dims.width / 42, 26)}
                  fontWeight={700}
                  stroke="#0b1526"
                  strokeWidth={4}
                  paintOrder="stroke"
                >
                  {label}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>
    </motion.div>
  );
}
