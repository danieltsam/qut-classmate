import React, { useEffect } from 'react';
import { X, BookOpen, MapPin, Award, ArrowRight, Link as LinkIcon, CheckCircle2 } from 'lucide-react';
import { UnitData } from './unit-card';
import { getPrerequisites, getUnlocks } from '@/lib/qut/dependencies';
import { cn } from '@/lib/utils';

interface UnitDetailsDrawerProps {
  unit: UnitData | null;
  isOpen: boolean;
  onClose: () => void;
  onJumpToUnit: (code: string) => void;
  allUnitsMap: Map<string, UnitData>;
  isCompleted: boolean;
  onToggleCompleted: (code: string) => void;
  assessmentsData?: Record<string, {
    hasExam: boolean;
    assessmentCount: number;
    items: Array<{
      name: string;
      description: string;
      weight?: number | null;
      individualGroup?: string;
      dueDate?: string;
    }>;
  }>;
}

export const UnitDetailsDrawer: React.FC<UnitDetailsDrawerProps> = ({
  unit,
  isOpen,
  onClose,
  onJumpToUnit,
  allUnitsMap,
  isCompleted,
  onToggleCompleted,
  assessmentsData,
}) => {
  // Lock scroll on body when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!unit) return null;

  const prereqCodes = getPrerequisites(unit.code);
  const unlockCodes = getUnlocks(unit.code);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 pointer-events-none transition-all duration-500',
        isOpen ? 'pointer-events-auto' : ''
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-background/40 backdrop-blur-sm transition-opacity duration-500 ease-out',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-full max-w-lg bg-card/90 border-l border-border/40 shadow-2xl backdrop-blur-xl flex flex-col transition-transform duration-500 ease-out translate-x-full',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/40 bg-gradient-to-r from-primary/10 to-transparent">
          <div>
            <span className="text-xs font-mono font-bold text-primary tracking-widest uppercase">
              Unit Specification
            </span>
            <h2 className="text-2xl font-bold text-foreground font-sans mt-1">
              {unit.code}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {/* Title and Complete Button */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <h1 className="text-xl font-bold text-foreground leading-snug flex-1">
              {unit.title}
            </h1>
            <button
              onClick={() => onToggleCompleted(unit.code)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all duration-300 flex items-center gap-1.5 shrink-0 shadow-sm",
                isCompleted
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/25"
                  : "bg-primary/5 border-primary/20 text-primary hover:bg-primary/20"
              )}
            >
              <CheckCircle2 className={cn("w-4 h-4", isCompleted ? "fill-emerald-500/10" : "")} />
              {isCompleted ? "Completed" : "Mark Completed"}
            </button>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-4 p-4 rounded-xl bg-muted/30 border border-border/20">
            <div className="flex flex-col items-center justify-center text-center p-2">
              <Award className="w-5 h-5 text-primary mb-1.5" />
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Credit Points
              </span>
              <span className="text-sm font-semibold text-foreground mt-0.5">
                {unit.creditPoints || 12} CP
              </span>
            </div>

            <div className="flex flex-col items-center justify-center text-center p-2 border-x border-border/30">
              <MapPin className="w-5 h-5 text-primary mb-1.5" />
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Campus
              </span>
              <span className="text-sm font-semibold text-foreground mt-0.5 truncate max-w-full px-1">
                {unit.campus || 'Gardens Point'}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center text-center p-2">
              <BookOpen className="w-5 h-5 text-primary mb-1.5" />
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Study Load
              </span>
              <span className="text-sm font-semibold text-foreground mt-0.5">
                Standard
              </span>
            </div>
          </div>

          {/* Synopsis */}
          <div className="space-y-2">
            <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
              Synopsis
            </h3>
            <p className="text-sm leading-relaxed text-foreground/80 text-justify">
              {unit.synopsis || 'No description available for this unit.'}
            </p>
          </div>

          {/* Assessment Structure */}
          <div className="space-y-3 pt-4 border-t border-border/30">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
                Assessment Structure
              </h3>
              {assessmentsData && assessmentsData[unit.code] && (
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider",
                  assessmentsData[unit.code].hasExam
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                )}>
                  {assessmentsData[unit.code].hasExam ? "📝 Exam Required" : "🛡️ No Exam"}
                </span>
              )}
            </div>

            {assessmentsData && assessmentsData[unit.code] ? (
              <div className="space-y-2.5">
                {assessmentsData[unit.code].items && assessmentsData[unit.code].items.length > 0 ? (
                  assessmentsData[unit.code].items.map((item, index) => (
                    <div key={index} className="p-3.5 rounded-xl border border-border/30 bg-muted/20 space-y-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-foreground block">
                          {item.name}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {item.weight !== undefined && item.weight !== null && (
                            <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full border border-primary/20">
                              🎯 {item.weight}%
                            </span>
                          )}
                          {item.individualGroup && (
                            <span className="bg-blue-500/10 text-blue-500 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/20">
                              👤 {item.individualGroup}
                            </span>
                          )}
                          {item.dueDate && (
                            <span className="bg-purple-500/10 text-purple-500 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-500/20">
                              ⏳ {item.dueDate}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs leading-normal text-muted-foreground text-justify">
                        {item.description || "No description provided for this assessment task."}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground italic bg-muted/10 p-3 rounded-lg border border-border/20">
                    No assessment tasks specified for this unit in the handbook outlines.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic bg-muted/10 p-3 rounded-lg border border-border/20">
                Assessment structure not yet loaded. Scraping public outlines in background...
              </p>
            )}
          </div>

          {/* Prerequisite Relations */}
          <div className="space-y-4 pt-4 border-t border-border/30">
            {/* Prerequisites */}
            <div className="space-y-2">
              <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
                Prerequisites ({prereqCodes.length})
              </h3>
              {prereqCodes.length > 0 ? (
                <div className="space-y-2">
                  {prereqCodes.map(code => {
                    const related = allUnitsMap.get(code);
                    return (
                      <div
                        key={code}
                        onClick={() => onJumpToUnit(code)}
                        className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-muted/10 hover:bg-muted/50 cursor-pointer transition-colors duration-200 group/item"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-xs font-mono font-bold text-primary">
                            {code}
                          </span>
                          <span className="text-xs text-foreground/80 truncate">
                            {related?.title || 'Unknown Title'}
                          </span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover/item:text-primary transition-transform duration-200 translate-x-0 group-hover/item:translate-x-1" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">None (Entry-level unit)</p>
              )}
            </div>

            {/* Unlocks / Career Progression */}
            <div className="space-y-2 pt-2">
              <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
                Unlocks Subsequent Units ({unlockCodes.length})
              </h3>
              {unlockCodes.length > 0 ? (
                <div className="space-y-2">
                  {unlockCodes.map(code => {
                    const related = allUnitsMap.get(code);
                    return (
                      <div
                        key={code}
                        onClick={() => onJumpToUnit(code)}
                        className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-muted/10 hover:bg-muted/50 cursor-pointer transition-colors duration-200 group/item"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {code}
                          </span>
                          <span className="text-xs text-foreground/80 truncate">
                            {related?.title || 'Unknown Title'}
                          </span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover/item:text-emerald-500 transition-transform duration-200 translate-x-0 group-hover/item:translate-x-1" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">None (Terminal capstone or elective)</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer info link */}
        <div className="p-4 border-t border-border/40 bg-muted/20 flex items-center justify-center gap-4 text-xs">
          <a
            href={`https://www.qut.edu.au/study/unit?unitCode=${unit.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-primary hover:underline font-semibold"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            Official QUT Page
          </a>
          <span className="text-muted-foreground/30">|</span>
          <a
            href="https://www.grademate.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
          >
            🎓 GradeMate Calculator
          </a>
        </div>
      </div>
    </div>
  );
};
