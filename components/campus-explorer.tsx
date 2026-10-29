'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Clock, Compass, Star, X as XIcon, CalendarDays,
  MapPin, Sliders, Filter, ExternalLink, BookOpen, Award,
  ChevronRight, User
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getUnitTitle } from '@/lib/unit-codes';
import { SectionNote } from '@/components/section-note';

interface UnitMetaItem {
  name: string;
  description: string | null;
  weight: number | null;
  individualGroup: string | null;
  dueDate: string | null;
}

interface UnitMeta {
  code: string;
  title: string | null;
  synopsis: string | null;
  hasExam: boolean;
  assessmentCount: number;
  items: UnitMetaItem[];
}

// One entry of data/qut-unit-classes.json. Both files are served by the API
// (/api/unit-classes, /api/units/[code]) and fetched at runtime — importing them
// here is what used to put 2.1 MB of JSON into the first-load bundle.
interface ClassSnapshotEntry {
  offered?: boolean;
  classes?: any[];
}

type SnapshotState =
  | { status: 'loading' }
  | { status: 'ready'; units: Record<string, ClassSnapshotEntry> }
  | { status: 'error'; message: string };

type UnitMetaState =
  | { status: 'loading' }
  | { status: 'ready'; meta: UnitMeta }
  | { status: 'missing' }
  | { status: 'error'; message: string };

const NO_ASSESSMENT = 'No assessment details published for this unit.';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const FACULTIES = [
  'Information Technology', 'Science', 'Business', 'Law',
  'Health', 'Education', 'Creative Industries', 'Other'
] as const;
const CLASS_TYPES = [
  'Lecture', 'Tutorial', 'Practical / Lab', 'Workshop / Studio', 'Other'
] as const;

function getClassKey(cls: any) {
  return `${cls.unitCode}-${cls.activityGroupCode}-${cls.classNumber}-${cls.day}-${cls.startTime}`;
}

function getFaculty(code: string) {
  const p = code.substring(0, 3).toUpperCase();
  if (['CAB','IFB','IAB','IGB','IFN','DSB'].includes(p)) return 'Information Technology';
  if (['MXB','MZB','BVB','CYB','PVB','SEB','MSB','EGB','ENB'].includes(p)) return 'Science';
  if (['AMB','AYB','BSB','EFB','AMN','AYN','BSN','EFN'].includes(p)) return 'Business';
  if (['LLB','LLN'].includes(p)) return 'Law';
  if (['NSB','PUB','PYB','LQB','NSN','PUN','PYN'].includes(p)) return 'Health';
  if (['EUB','EUN'].includes(p)) return 'Education';
  if (['KKB','DXB','DVB','KIB','KKN','DXN','DVN','KIN'].includes(p)) return 'Creative Industries';
  return 'Other';
}

function getClassTypeCategory(activityType: string) {
  const t = activityType.toLowerCase();
  if (t.includes('lecture')) return 'Lecture';
  if (t.includes('tutorial')) return 'Tutorial';
  if (t.includes('practical') || t.includes('laboratory') || t.includes('lab')) return 'Practical / Lab';
  if (t.includes('workshop') || t.includes('seminar') || t.includes('studio')) return 'Workshop / Studio';
  return 'Other';
}

function parseTimeRange(timeDisplay: string): { start: number; end: number } | null {
  if (!timeDisplay) return null;
  const parts = timeDisplay.split('-').map(p => p.trim());
  if (parts.length !== 2) return null;
  const parseTime = (s: string) => {
    const m = s.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!m) return 0;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3]?.toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  };
  return { start: parseTime(parts[0]), end: parseTime(parts[1]) };
}

function fmtHour(h: number) {
  if (h === 12) return '12 PM';
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

// ── Unit Detail Panel ─────────────────────────────────────────────────────────

interface UnitPanelProps {
  unitCode: string;
  unitTitle: string;
  allClassesForUnit: any[];
  starred: Set<string>;
  toggleStar: (key: string) => void;
  currentDay: string;
  isOpen: boolean;
  onClose: () => void;
}

function UnitPanel({
  unitCode,
  unitTitle,
  allClassesForUnit,
  starred,
  toggleStar,
  currentDay,
  isOpen,
  onClose,
}: UnitPanelProps) {
  // The outline (synopsis + assessment) is fetched per open. data/unit-meta.json
  // is 1.3 MB and stays on the server, so a panel open costs one round trip
  // instead of shipping every unit's outline to every visitor.
  const [metaState, setMetaState] = useState<UnitMetaState>({ status: 'loading' });
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [dayFilter, setDayFilter] = useState<'all' | 'remaining'>('all');

  useEffect(() => {
    const controller = new AbortController();
    setMetaState({ status: 'loading' });

    (async () => {
      try {
        const response = await fetch(`/api/units/${encodeURIComponent(unitCode)}`, {
          signal: controller.signal,
        });
        if (response.status === 404) {
          setMetaState({ status: 'missing' });
          return;
        }
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) {
          setMetaState({ status: 'error', message: `Could not load the outline for ${unitCode}.` });
          return;
        }
        setMetaState({
          status: 'ready',
          meta: {
            code: typeof data.code === 'string' ? data.code : unitCode,
            title: typeof data.title === 'string' ? data.title : null,
            synopsis: typeof data.synopsis === 'string' && data.synopsis.trim() ? data.synopsis : null,
            hasExam: data.hasExam === true,
            assessmentCount:
              typeof data.assessmentCount === 'number' ? data.assessmentCount : 0,
            items: Array.isArray(data.items)
              ? data.items
                  .map((item: any) => ({
                    name: typeof item?.name === 'string' && item.name.trim() ? item.name : 'Assessment item',
                    description:
                      typeof item?.description === 'string' && item.description.trim()
                        ? item.description
                        : null,
                    weight: typeof item?.weight === 'number' ? item.weight : null,
                    individualGroup:
                      typeof item?.individualGroup === 'string' && item.individualGroup.trim()
                        ? item.individualGroup
                        : null,
                    dueDate:
                      typeof item?.dueDate === 'string' && item.dueDate.trim() ? item.dueDate : null,
                  }))
              : [],
          },
        });
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        setMetaState({ status: 'error', message: `Could not reach the outline for ${unitCode}.` });
      }
    })();

    return () => controller.abort();
  }, [unitCode]);

  const meta = metaState.status === 'ready' ? metaState.meta : null;
  const synopsis = meta?.synopsis ?? null;
  const assessmentItems = meta?.items ?? [];

  // Count by category
  const counts = useMemo(() => {
    const res: Record<string, number> = { All: allClassesForUnit.length, Lecture: 0, Tutorial: 0, 'Practical / Lab': 0, 'Workshop / Studio': 0, Other: 0 };
    allClassesForUnit.forEach(cls => {
      const cat = getClassTypeCategory(cls.activityType);
      res[cat] = (res[cat] || 0) + 1;
    });
    return res;
  }, [allClassesForUnit]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    const currentDayIdx = DAYS.indexOf(currentDay as any);
    return allClassesForUnit.filter(cls => {
      if (typeFilter !== 'All') {
        const cat = getClassTypeCategory(cls.activityType);
        if (cat !== typeFilter) return false;
      }
      if (dayFilter === 'remaining' && currentDayIdx >= 0) {
        const clsDayIdx = DAYS.indexOf(cls.day as any);
        if (clsDayIdx < currentDayIdx) return false;
      }
      return true;
    });
  }, [allClassesForUnit, typeFilter, dayFilter, currentDay]);

  // Group all class sessions by day
  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    filteredSessions.forEach(cls => {
      if (!map[cls.day]) map[cls.day] = [];
      map[cls.day].push(cls);
    });
    return map;
  }, [filteredSessions]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-gray-950/40 dark:bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 ease-out",
          isOpen ? "opacity-100" : "opacity-0",
          "motion-reduce:transition-none motion-reduce:opacity-100"
        )}
      />

      {/* Panel */}
      <div
        className={cn(
          "relative w-full max-w-lg bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-2xl",
          "transition-transform transition-opacity duration-300 ease-out",
          isOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
          "motion-reduce:transition-none motion-reduce:translate-x-0 motion-reduce:opacity-100"
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#003A6E] dark:text-blue-300">Unit Overview</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">• {allClassesForUnit.length} sessions total</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{unitCode}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-snug">{unitTitle}</p>
          </div>
          <button onClick={onClose} className="shrink-0 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mt-0.5">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Synopsis */}
          <div className="p-5 border-b border-gray-200 dark:border-gray-800/60">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-3.5 h-3.5 text-[#003A6E] dark:text-blue-300" />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-500">Synopsis</span>
            </div>
            {synopsis ? (
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{synopsis}</p>
            ) : metaState.status === 'loading' ? (
              <p className="text-sm text-gray-500 dark:text-gray-500 italic">Loading the unit outline…</p>
            ) : metaState.status === 'error' ? (
              <p className="text-sm text-gray-500 dark:text-gray-500 italic">{metaState.message}</p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-500 italic">
                No synopsis published for this unit.{' '}
                <a
                  href={`https://www.qut.edu.au/study/unit?unitCode=${unitCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#003A6E] hover:text-[#003A6E]/80 dark:text-blue-300 dark:hover:text-blue-200 not-italic underline"
                >
                  View official outline on qut.edu.au
                </a>
              </p>
            )}
          </div>

          {/* Assessments */}
          <div className="p-5 border-b border-gray-200 dark:border-gray-800/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award className="w-3.5 h-3.5 text-[#003A6E] dark:text-blue-300" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-500">Assessment Breakdown</span>
              </div>
              {/* Only claim "no final exam" once the outline has actually loaded
                  and published something. An empty section proves nothing. */}
              {assessmentItems.length > 0 && (
                <span className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full border",
                  meta?.hasExam
                    ? "bg-amber-50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700/40"
                    : "bg-emerald-50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/40"
                )}>
                  {meta?.hasExam ? 'Exam Required' : 'No Final Exam'}
                </span>
              )}
            </div>
            {metaState.status === 'loading' ? (
              <p className="text-xs text-gray-500 dark:text-gray-500 italic">Loading assessment details…</p>
            ) : assessmentItems.length > 0 ? (
              <div className="space-y-2">
                {assessmentItems.map((item, i) => (
                  <div key={i} className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-200">{item.name}</span>
                      {item.weight != null && (
                        <span className="shrink-0 text-xs font-semibold text-[#003A6E] dark:text-blue-300">{item.weight}%</span>
                      )}
                    </div>
                    {item.dueDate && (
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">{item.dueDate}</div>
                    )}
                    {item.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1.5 leading-relaxed">{item.description}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-500 italic">{NO_ASSESSMENT}</p>
            )}
          </div>

          {/* All Session Instances & Tutorials */}
          <div className="p-5">
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-[#003A6E] dark:text-blue-300" />
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Weekly Class Schedule ({filteredSessions.length})
                  </span>
                </div>
                {/* Day scope toggle */}
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-800">
                  <button
                    onClick={() => setDayFilter('all')}
                    className={cn("px-2 py-0.5 text-xs rounded", dayFilter === 'all' ? "bg-[#003A6E] text-white font-semibold" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200")}
                  >
                    All Week
                  </button>
                  <button
                    onClick={() => setDayFilter('remaining')}
                    className={cn("px-2 py-0.5 text-xs rounded", dayFilter === 'remaining' ? "bg-[#003A6E] text-white font-semibold" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200")}
                  >
                    From {currentDay.slice(0,3)} Onward
                  </button>
                </div>
              </div>

              {/* Activity Type Pills */}
              <div className="flex gap-1.5 flex-wrap">
                {['All', 'Lecture', 'Tutorial', 'Practical / Lab', 'Workshop / Studio'].map(t => {
                  const cnt = counts[t] || 0;
                  if (t !== 'All' && cnt === 0) return null;
                  return (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                        typeFilter === t
                          ? "bg-[#003A6E] text-white shadow-sm"
                          : "bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                      )}
                    >
                      <span>{t === 'Practical / Lab' ? 'Practicals' : t === 'Workshop / Studio' ? 'Workshops' : t}</span>
                      <span className={cn("text-[10px] px-1 rounded-full font-semibold", typeFilter === t ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400")}>
                        {cnt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {DAYS.filter(d => byDay[d]?.length > 0).length === 0 ? (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-200 dark:border-gray-800/50">
                <p className="text-xs text-gray-500 dark:text-gray-500">No {typeFilter.toLowerCase()} sessions found for the selected scope.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {DAYS.filter(d => byDay[d]).map(d => (
                  <div key={d}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-[#003A6E] dark:text-blue-300">{d}</span>
                      {d === currentDay && (
                        <span className="text-[10px] bg-blue-100 text-[#003A6E] dark:bg-blue-500/20 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-500/30">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {byDay[d].map((cls, i) => {
                        const key = getClassKey(cls);
                        const isStarred = starred.has(key);
                        return (
                          <div
                            key={i}
                            className={cn(
                              "flex items-start justify-between gap-3 bg-gray-50 dark:bg-gray-800/60 border rounded-xl p-3 transition-all duration-150 ease-out motion-reduce:transition-none",
                              isStarred ? "border-amber-200 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-500/5" : "border-gray-200 dark:border-gray-800/80 hover:border-gray-300 dark:hover:border-gray-700"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{cls.activityType}</span>
                                {cls.activityGroupCode && (
                                  <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                    {cls.activityGroupCode}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-[#003A6E] dark:text-blue-300 font-semibold mt-1">
                                {cls.timeDisplay}
                              </div>
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-gray-600 dark:text-gray-400">
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-gray-500 dark:text-gray-500" />
                                  {cls.locationDisplay || cls.campus || '—'}
                                </span>
                                {cls.teachingStaff && (
                                  <span className="flex items-center gap-1 text-gray-500 dark:text-gray-500 truncate max-w-[200px]">
                                    <User className="w-3 h-3 text-gray-500 dark:text-gray-500" />
                                    {cls.teachingStaff}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Direct star button to add instance to My Day */}
                            <button
                              onClick={() => toggleStar(key)}
                              className={cn(
                                "shrink-0 p-2 rounded-lg border transition-all duration-150 ease-out flex items-center gap-1.5 text-xs motion-reduce:transition-none",
                                isStarred
                                  ? "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-500/10 hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                                  : "text-gray-500 dark:text-gray-500 border-gray-200 dark:border-gray-800 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-200 dark:hover:border-amber-700/30 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                              )}
                              title={isStarred ? "Remove from My Day" : "Star to My Day"}
                            >
                              <Star className={cn("w-3.5 h-3.5 transition-transform duration-150 ease-out", isStarred && "fill-amber-500 dark:fill-amber-400")} />
                              <span className="hidden sm:inline text-xs">{isStarred ? 'Starred' : 'Save'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <a
              href={`https://www.qut.edu.au/study/unit?unitCode=${unitCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[#003A6E] hover:text-[#003A6E]/80 dark:text-blue-300 dark:hover:text-blue-200 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Official QUT page
            </a>
            <span className="text-gray-300 dark:text-gray-700">·</span>
            <a
              href={`https://qutvirtual4.qut.edu.au/web/qut/search?profile=UNIT&params.query=${unitCode}&params.showOldUnits=false`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronRight className="w-3 h-3" />
              QUT Virtual
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Campus Explorer ──────────────────────────────────────────────────────

export function CampusExplorer() {
  const [day, setDay] = useState<string>('Monday');
  const [hour, setHour] = useState<number>(10);
  const [sliderHour, setSliderHour] = useState<number>(10);
  const [location, setLocation] = useState<'all' | 'GP' | 'KG' | 'Online'>('all');

  // Smooth the hour slider: the thumb follows sliderHour immediately, but the
  // filtered result set only updates once the slider rests (debounced).
  useEffect(() => {
    const id = setTimeout(() => setHour(sliderHour), 120);
    return () => clearTimeout(id);
  }, [sliderHour]);
  const [faculties, setFaculties] = useState<Set<string>>(new Set(FACULTIES));
  const [classTypes, setClassTypes] = useState<Set<string>>(new Set(CLASS_TYPES));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Selected unit for detail panel
  const [panelUnit, setPanelUnit] = useState<{ code: string; title: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // The class snapshot (~830 KB) is fetched rather than imported, so it never
  // reaches the first-load bundle. `reloadToken` re-runs the fetch on retry.
  const [snapshot, setSnapshot] = useState<SnapshotState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot({ status: 'loading' });

    (async () => {
      try {
        const response = await fetch('/api/unit-classes', { signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || typeof data.data !== 'object' || data.data === null) {
          setSnapshot({
            status: 'error',
            message: data?.message || 'Could not load the class snapshot.',
          });
          return;
        }
        setSnapshot({ status: 'ready', units: data.data as Record<string, ClassSnapshotEntry> });
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        setSnapshot({ status: 'error', message: 'Could not reach the class snapshot.' });
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  // Starred state with localStorage persistence
  const [starred, setStarred] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const s = localStorage.getItem('campus-explorer-starred');
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  });

  const toggleStar = (key: string) => {
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem('campus-explorer-starred', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // Init to current day/time
  useEffect(() => {
    const now = new Date();
    const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const d = names[now.getDay()];
    const startHour = Math.min(21, Math.max(8, now.getHours()));
    setDay(['Sunday','Saturday'].includes(d) ? 'Monday' : d);
    setHour(startHour);
    setSliderHour(startHour);
  }, []);

  // Debounce free-text search so filtering does not run per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 220);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Titles come from the unit catalogue module (lib/unit-codes.ts), which the
  // Unit Search tab already bundles. The full 1.3 MB outline file stays on the
  // server and is fetched per unit when a panel opens.
  const snapshotUnits = snapshot.status === 'ready' ? snapshot.units : null;

  // All available classes from the snapshot, enriched
  const allClasses = useMemo(() => {
    const list: any[] = [];
    if (!snapshotUnits) return list;
    Object.keys(snapshotUnits).forEach(unitCode => {
      const entry = snapshotUnits[unitCode];
      if (entry?.offered && entry?.classes) {
        const code = unitCode.toUpperCase();
        const title = getUnitTitle(code) || '';
        entry.classes.forEach((cls: any) => {
          list.push({
            ...cls,
            unitCode: code,
            unitTitle: title,
            faculty: getFaculty(code),
          });
        });
      }
    });
    return list;
  }, [snapshotUnits]);

  // All classes for the selected unit (for the detail panel)
  const selectedUnitClasses = useMemo(() => {
    if (!panelUnit) return [];
    return allClasses.filter(cls => cls.unitCode === panelUnit.code);
  }, [allClasses, panelUnit]);

  // Filtered results
  const results = useMemo(() => {
    const chosen = hour * 60;
    return allClasses.filter(cls => {
      if (cls.day !== day) return false;
      if (location === 'GP' && cls.campus !== 'Gardens Point') return false;
      if (location === 'KG' && cls.campus !== 'Kelvin Grove') return false;
      if (location === 'Online' && cls.campus !== 'Online') return false;
      if (!faculties.has(cls.faculty)) return false;
      if (!classTypes.has(getClassTypeCategory(cls.activityType))) return false;
      const tr = parseTimeRange(cls.timeDisplay);
      if (!tr) return false;
      const isOngoing = tr.start <= chosen && tr.end > chosen;
      const isUpcoming = tr.start > chosen && tr.start < chosen + 60;
      if (!isOngoing && !isUpcoming) return false;
      cls.isOngoing = isOngoing;
      cls.startMinutes = tr.start;
      if (search) {
        const q = search.toLowerCase();
        if (
          !cls.unitCode.toLowerCase().includes(q) &&
          !cls.unitTitle.toLowerCase().includes(q) &&
          !cls.locationDisplay?.toLowerCase().includes(q) &&
          !cls.teachingStaff?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    }).sort((a, b) => {
      if (a.isOngoing && !b.isOngoing) return -1;
      if (!a.isOngoing && b.isOngoing) return 1;
      return a.startMinutes - b.startMinutes;
    });
  }, [allClasses, day, hour, location, faculties, classTypes, search]);

  const starredByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    DAYS.forEach(d => {
      const seen = new Set<string>();
      const items = allClasses
        .filter(cls => cls.day === d && starred.has(getClassKey(cls)))
        // A class split across week blocks (e.g. Weeks 1-7 and Weeks 8-13) is
        // several rows sharing one key. "My Day" wants the class once, not once
        // per block — this also keeps React keys unique.
        .filter(cls => {
          const key = getClassKey(cls);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));
      if (items.length) map.set(d, items);
    });
    return map;
  }, [allClasses, starred]);

  const openUnit = (unitCode: string) => {
    const title = getUnitTitle(unitCode) || unitCode;
    setPanelUnit({ code: unitCode, title });
    setPanelOpen(false);
    // Let the initial closed state paint so the entrance transition runs.
    requestAnimationFrame(() => setPanelOpen(true));
  };

  const closePanel = () => {
    setPanelOpen(false);
    setTimeout(() => {
      setPanelUnit(null);
    }, 300);
  };

  return (
    <>
      <div className="flex flex-col gap-4 h-full">
        {/* ── Top bar: day + time + campus ── */}
        <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden">
          <CardContent className="py-4 dark:bg-gray-900">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* Day pills */}
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(d => (
                  <button
                    key={d}
                    onClick={() => setDay(d)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border',
                      day === d
                        ? 'bg-[#003A6E] text-white border-[#003A6E] shadow-md'
                        : 'text-gray-700 dark:text-gray-400 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                    )}
                  >
                    {d.substring(0, 3).toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-700 shrink-0" />

              {/* Time slider */}
              <div className="flex items-center gap-3 flex-1 min-w-[180px]">
                <Clock className="w-3.5 h-3.5 text-gray-500 dark:text-gray-500 shrink-0" />
                <input
                  type="range" min={8} max={21} value={sliderHour}
                  onInput={e => setSliderHour(parseInt(e.currentTarget.value))}
                  onPointerUp={e => setHour(parseInt(e.currentTarget.value))}
                  className="flex-1 accent-[#003A6E] cursor-pointer"
                />
                <span className="text-sm font-medium text-[#003A6E] dark:text-blue-300 w-14 text-right shrink-0">
                  {fmtHour(sliderHour)}
                </span>
              </div>

              {/* Location pills */}
              <div className="flex gap-1.5 flex-wrap">
                {([['all','All'],['GP','GP'],['KG','KG'],['Online','Online']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setLocation(v)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border',
                      location === v
                        ? 'bg-[#003A6E] text-white border-[#003A6E]'
                        : 'text-gray-700 dark:text-gray-400 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Main 3-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_220px] gap-4 flex-grow min-h-0">

          {/* ─ LEFT: Filters ─ */}
          <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden flex flex-col">
            <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl py-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#003A6E] dark:text-blue-300 text-base flex items-center gap-2">
                  <Sliders className="w-4 h-4" /> Filters
                </CardTitle>
                <button
                  onClick={() => setFiltersOpen(o => !o)}
                  className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <Filter className={cn("w-3.5 h-3.5 transition-transform", !filtersOpen && "rotate-180")} />
                </button>
              </div>
            </CardHeader>

            {filtersOpen && (
              <CardContent className="pt-4 dark:bg-gray-900 flex-1 overflow-y-auto">
                <div className="space-y-5">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-500 dark:text-gray-500" />
                    <input
                      placeholder="Search unit, staff…"
                      value={searchInput}
                      onChange={e => setSearchInput(e.target.value)}
                      className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-[#003A6E]/60 dark:focus:border-blue-500/60"
                    />
                  </div>

                  {/* Faculty */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-500">Faculty</span>
                      <button
                        onClick={() => setFaculties(faculties.size === FACULTIES.length ? new Set() : new Set(FACULTIES))}
                        className="text-xs text-[#003A6E] hover:text-[#003A6E]/80 dark:text-blue-300 dark:hover:text-blue-200 transition-colors"
                      >
                        {faculties.size === FACULTIES.length ? 'None' : 'All'}
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      {FACULTIES.map(f => (
                        <label
                          key={f}
                          className="flex items-center gap-2.5 py-1 px-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors group"
                          onClick={() => {
                            const next = new Set(faculties);
                            if (next.has(f)) next.delete(f); else next.add(f);
                            setFaculties(next);
                          }}
                        >
                          <div className={cn(
                            "w-3.5 h-3.5 rounded border transition-all shrink-0 flex items-center justify-center",
                            faculties.has(f) ? "bg-[#003A6E] border-[#003A6E]" : "border-gray-300 dark:border-gray-600 group-hover:border-gray-400 dark:group-hover:border-gray-500"
                          )}>
                            {faculties.has(f) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                          </div>
                          <span className="text-sm text-gray-700 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors leading-tight select-none">
                            {f}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Class type */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-500">Type</span>
                      <button
                        onClick={() => setClassTypes(classTypes.size === CLASS_TYPES.length ? new Set() : new Set(CLASS_TYPES))}
                        className="text-xs text-[#003A6E] hover:text-[#003A6E]/80 dark:text-blue-300 dark:hover:text-blue-200 transition-colors"
                      >
                        {classTypes.size === CLASS_TYPES.length ? 'None' : 'All'}
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      {CLASS_TYPES.map(t => (
                        <label
                          key={t}
                          className="flex items-center gap-2.5 py-1 px-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors group"
                          onClick={() => {
                            const next = new Set(classTypes);
                            if (next.has(t)) next.delete(t); else next.add(t);
                            setClassTypes(next);
                          }}
                        >
                          <div className={cn(
                            "w-3.5 h-3.5 rounded border transition-all shrink-0 flex items-center justify-center",
                            classTypes.has(t) ? "bg-[#003A6E] border-[#003A6E]" : "border-gray-300 dark:border-gray-600 group-hover:border-gray-400 dark:group-hover:border-gray-500"
                          )}>
                            {classTypes.has(t) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                          </div>
                          <span className="text-sm text-gray-700 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors select-none">
                            {t}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* ─ MIDDLE: Class feed ─ */}
          <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden flex flex-col">
            <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl py-4 px-4">
              <CardTitle className="text-[#003A6E] dark:text-blue-300 text-base flex items-center gap-2">
                <Compass className="w-4 h-4" />
                <span>
                  <span className="font-semibold">{results.length}</span>{' '}
                  <span className="font-normal">classes on {day} around {fmtHour(hour)}</span>
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-4 dark:bg-gray-900 flex-1 min-h-0 overflow-hidden flex flex-col">
              {snapshot.status === 'loading' ? (
                <div
                  className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center"
                  data-testid="campus-loading"
                >
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-700 border-t-[#003A6E] dark:border-t-blue-300 animate-spin motion-reduce:animate-none" />
                  <div>
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Loading classes</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Pulling the semester class list</p>
                  </div>
                </div>
              ) : snapshot.status === 'error' ? (
                <div
                  className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center"
                  data-testid="campus-error"
                >
                  <Compass className="w-8 h-8 text-gray-300 dark:text-gray-700" />
                  <div>
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Could not load the class list</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{snapshot.message}</p>
                  </div>
                  <button
                    onClick={() => setReloadToken(t => t + 1)}
                    className="mt-1 px-3 py-1.5 rounded-lg text-sm font-medium border border-[#003A6E]/20 text-[#003A6E] hover:bg-[#003A6E]/10 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              ) : results.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <Clock className="w-8 h-8 text-gray-300 dark:text-gray-700" />
                  <div>
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">No classes at this time</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Adjust the time slider or filters</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-3 pb-4 content-start">
                  {results.slice(0, 80).map((cls, idx) => {
                    const key = getClassKey(cls);
                    const isStarred = starred.has(key);
                    const hasTitle = !!cls.unitTitle;
                    // Cap stagger: first 8 cards step by 25ms, rest share the 8th delay.
                    const enterDelay = `${Math.min(idx, 8) * 25}ms`;
                    return (
                      <div
                        key={`${key}-${idx}`}
                        className={cn(
                          "bg-white dark:bg-gray-900 rounded-xl border shadow-sm p-4 flex flex-col gap-3",
                          "transition-all duration-150 ease-out motion-reduce:transition-none",
                          "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:transform-none motion-reduce:hover:shadow-sm",
                          "animate-in fade-in slide-in-from-bottom-2 duration-150 fill-mode-forwards motion-reduce:animate-none",
                          isStarred
                            ? "border-amber-200 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-500/5"
                            : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                        )}
                        style={{ '--tw-enter-delay': enterDelay } as React.CSSProperties}
                      >
                        {/* Card header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{cls.unitCode}</span>
                              {cls.isOngoing && (
                                <span className="text-[10px] font-medium bg-blue-100 text-[#003A6E] dark:bg-blue-500/20 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                                  Live
                                </span>
                              )}
                            </div>
                            {/* Unit title or activity type */}
                            <p className={cn(
                              "text-sm mt-0.5 leading-snug",
                              hasTitle ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-500 italic"
                            )}>
                              {hasTitle ? cls.unitTitle : cls.activityType}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleStar(key)}
                            className={cn(
                              "shrink-0 p-1.5 rounded-lg border transition-all duration-150 ease-out motion-reduce:transition-none",
                              "hover:scale-110 active:scale-90 motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
                              isStarred
                                ? "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-500/10"
                                : "text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-800 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-200 dark:hover:border-amber-700/30"
                            )}
                          >
                            <Star className={cn("w-3.5 h-3.5 transition-transform duration-150 ease-out", isStarred && "fill-amber-500 dark:fill-amber-400")} />
                          </button>
                        </div>

                        {/* Meta */}
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-1.5 text-[#003A6E] dark:text-blue-300 font-semibold">
                            <Clock className="w-3 h-3 shrink-0" />
                            {cls.timeDisplay} · {cls.activityType}
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-500">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {cls.locationDisplay || cls.campus || '—'}
                          </div>
                          {cls.teachingStaff && (
                            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-500 truncate">
                              <User className="w-3 h-3 shrink-0" />
                              {cls.teachingStaff}
                            </div>
                          )}
                        </div>

                        {/* View outline link */}
                        <button
                          onClick={() => openUnit(cls.unitCode)}
                          className="self-start flex items-center gap-1 text-sm font-medium border border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-150 ease-out shadow-sm hover:shadow hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:transform-none px-2.5 py-1"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                          View outline
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─ RIGHT: My Day ─ */}
          <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden flex flex-col">
            <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl py-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#003A6E] dark:text-blue-300 text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  My Day
                  {starred.size > 0 && (
                    <span className="bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                      {starred.size}
                    </span>
                  )}
                </CardTitle>
                {starred.size > 0 && (
                  <button
                    onClick={() => { setStarred(new Set()); try { localStorage.removeItem('campus-explorer-starred'); } catch {} }}
                    className="text-xs text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-4 dark:bg-gray-900 flex-1 overflow-y-auto">
              {starredByDay.size === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <Star className="w-7 h-7 text-gray-300 dark:text-gray-800" />
                  <p className="text-xs text-gray-500 dark:text-gray-500 leading-relaxed max-w-[130px]">
                    Star a class to add it here
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {DAYS.map(d => {
                    const items = starredByDay.get(d);
                    if (!items) return null;
                    return (
                      <div key={d}>
                        <div className="text-xs font-semibold text-[#003A6E] dark:text-blue-300 mb-2">{d}</div>
                        <div className="space-y-2">
                          {items.map(cls => (
                            <div
                              key={getClassKey(cls)}
                              className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800/60 rounded-xl p-2.5 group flex items-start justify-between gap-2 hover:border-amber-200 dark:hover:border-amber-800/30 transition-colors cursor-pointer"
                              onClick={() => openUnit(cls.unitCode)}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-200">{cls.unitCode}</div>
                                <div className="text-xs text-amber-600/80 dark:text-amber-300/70 mt-0.5">{cls.timeDisplay}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-500 truncate mt-0.5">{cls.locationDisplay}</div>
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); toggleStar(getClassKey(cls)); }}
                                className="shrink-0 text-gray-400 hover:text-rose-600 dark:text-gray-600 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                              >
                                <XIcon className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SectionNote>
        This is me showing up to uni with a spare hour and realising I could actually use it. I open this,
        see what is running in the next block, and sit in on whatever looks interesting. Nobody is checking
        attendance, so there is nothing to lose.
      </SectionNote>

      {/* Unit detail panel */}
      {panelUnit && (
        <UnitPanel
          key={panelUnit.code}
          unitCode={panelUnit.code}
          unitTitle={panelUnit.title}
          allClassesForUnit={selectedUnitClasses}
          starred={starred}
          toggleStar={toggleStar}
          currentDay={day}
          isOpen={panelOpen}
          onClose={closePanel}
        />
      )}
    </>
  );
}
