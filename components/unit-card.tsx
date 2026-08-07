import React from 'react';
import { BookOpen, MapPin, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UnitData {
  code: string;
  title: string;
  creditPoints: number | null;
  campus: string;
  synopsis: string;
}

interface UnitCardProps {
  unit: UnitData;
  type: 'core' | 'major' | 'minor' | 'elective' | 'qutyou';
  isHovered: boolean;
  isRelated: boolean;
  isDimmed: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  id?: string;
}

const TYPE_STYLES = {
  core: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/5',
    border: 'border-blue-500/30 dark:border-blue-500/20',
    hoverBorder: 'hover:border-blue-500 dark:hover:border-blue-400',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
    glow: 'shadow-[0_0_15px_rgba(59,130,246,0.15)] border-blue-500 dark:border-blue-400',
  },
  major: {
    bg: 'bg-violet-500/10 dark:bg-violet-500/5',
    border: 'border-violet-500/30 dark:border-violet-500/20',
    hoverBorder: 'hover:border-violet-500 dark:hover:border-violet-400',
    text: 'text-violet-600 dark:text-violet-400',
    badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20',
    glow: 'shadow-[0_0_15px_rgba(139,92,246,0.15)] border-violet-500 dark:border-violet-400',
  },
  minor: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/5',
    border: 'border-emerald-500/30 dark:border-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500 dark:hover:border-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)] border-emerald-500 dark:border-emerald-400',
  },
  elective: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/5',
    border: 'border-amber-500/30 dark:border-amber-500/20',
    hoverBorder: 'hover:border-amber-500 dark:hover:border-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
    glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)] border-amber-500 dark:border-amber-400',
  },
  qutyou: {
    bg: 'bg-pink-500/10 dark:bg-pink-500/5',
    border: 'border-pink-500/30 dark:border-pink-500/20',
    hoverBorder: 'hover:border-pink-500 dark:hover:border-pink-400',
    text: 'text-pink-600 dark:text-pink-400',
    badge: 'bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20',
    glow: 'shadow-[0_0_15px_rgba(236,72,153,0.15)] border-pink-500 dark:border-pink-400',
  },
};

export const UnitCard: React.FC<UnitCardProps> = ({
  unit,
  type,
  isHovered,
  isRelated,
  isDimmed,
  onClick,
  onMouseEnter,
  onMouseLeave,
  id,
}) => {
  const styles = TYPE_STYLES[type] || TYPE_STYLES.elective;

  return (
    <div
      id={id}
      className={cn(
        'group relative flex flex-col justify-between p-4 rounded-xl border transition-all duration-300 cursor-pointer backdrop-blur-md',
        styles.bg,
        styles.border,
        styles.hoverBorder,
        isHovered || isRelated ? styles.glow : '',
        isDimmed ? 'opacity-30 blur-[0.5px] scale-[0.98]' : 'opacity-100 scale-100',
        'hover:scale-[1.02] hover:-translate-y-[2px]'
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Background glow trail on hover */}
      <div className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div>
        <div className="flex justify-between items-start gap-2 mb-2">
          <span className={cn('text-sm font-bold tracking-wider font-mono', styles.text)}>
            {unit.code}
          </span>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-semibold border uppercase tracking-wider', styles.badge)}>
            {type === 'qutyou' ? 'QUT You' : type}
          </span>
        </div>

        <h3 className="font-semibold text-sm leading-tight text-foreground/90 group-hover:text-foreground line-clamp-2 min-h-[2.5rem]">
          {unit.title}
        </h3>
      </div>

      <div className="flex items-center justify-between mt-4 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Award className="w-3.5 h-3.5" />
          <span>{unit.creditPoints || 12} CP</span>
        </div>
        <div className="flex items-center gap-1 max-w-[55%]">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{unit.campus || 'Gardens Point'}</span>
        </div>
      </div>
    </div>
  );
};
