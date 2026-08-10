import React, { useRef, useState, useEffect } from 'react';
import { UnitCard, UnitData } from './unit-card';
import { generateUnitFlows, getPrereqChainForSet, getUnlockChainForSet } from '@/lib/qut/dependencies';
import { cn } from '@/lib/utils';
import { BookOpen } from 'lucide-react';

interface CourseFlowGridProps {
  specializationData: any; // Scraped specialization object
  entryTerm: 'feb' | 'july';
  onUnitClick: (unit: UnitData) => void;
  hoveredUnitCode: string | null;
  setHoveredUnitCode: (code: string | null) => void;
  filteredOutUnitCodes?: Set<string>;
  activeMajorTitle?: string;
}

export const CourseFlowGrid: React.FC<CourseFlowGridProps> = ({
  specializationData,
  entryTerm,
  onUnitClick,
  hoveredUnitCode,
  setHoveredUnitCode,
  filteredOutUnitCodes = new Set(),
  activeMajorTitle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Array<{
    id: string;
    from: string;
    to: string;
    path: string;
    isActive: boolean;
    type: 'prereq' | 'unlock';
  }>>([]);

  // Find the active undergrad structure based on activeMajorTitle if passed
  const structure = specializationData?.structures?.find((s: any) => {
    if (activeMajorTitle) {
      return s.title.toLowerCase().includes(activeMajorTitle.toLowerCase());
    }
    return s.title.toLowerCase().includes('common first year') ||
           s.title.toLowerCase().includes('major starts in');
  }) || specializationData?.structures?.[0];

  // Find the final year structure if it exists
  const finalYearStructure = specializationData?.structures?.find((s: any) =>
    s.title.toLowerCase().includes('final year')
  );

  if (!structure) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
        <BookOpen className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No study plan progression found for this specialization.</p>
      </div>
    );
  }

  // Filter semesters based on Feb vs July entry
  const allSemesters = structure.semesters || [];
  let semestersToRender: any[] = [];

  if (entryTerm === 'feb') {
    // Feb entry spans index 1 to 6 (Semesters 2 to 7)
    semestersToRender = allSemesters.filter((sem: any, index: number) => {
      const isFebPart = index >= 1 && index <= 6;
      return isFebPart && (sem.units.length > 0 || sem.textItems.length > 0);
    });

    if (finalYearStructure) {
      const postgradSemesters = finalYearStructure.semesters.filter((sem: any, index: number) => {
        // index 1 and 2 in Structure 8 are Year 4 Sem 1 & 2 for Feb entry
        return index >= 1 && index <= 2 && (sem.units.length > 0 || sem.textItems.length > 0);
      });
      semestersToRender.push(...postgradSemesters.map((s: any) => ({
        ...s,
        // Make sure names are clear (e.g. "Year 4, Semester 1")
        name: s.name.includes("Year 4") ? s.name : `Year 4, ${s.name}`
      })));
    }
  } else {
    // July entry spans index 8 to 13 (Semesters 9 to 14)
    semestersToRender = allSemesters.filter((sem: any, index: number) => {
      const isJulyPart = index >= 8 && index <= 13;
      return isJulyPart && (sem.units.length > 0 || sem.textItems.length > 0);
    });

    if (finalYearStructure) {
      const postgradSemesters = finalYearStructure.semesters.filter((sem: any, index: number) => {
        // index 4 and 5 in Structure 8 are Year 4 Sem 2 & Year 5 Sem 1 for July entry
        return index >= 4 && index <= 5 && (sem.units.length > 0 || sem.textItems.length > 0);
      });
      semestersToRender.push(...postgradSemesters.map((s: any) => ({
        ...s,
        name: s.name.includes("Year 4") || s.name.includes("Year 5") ? s.name : `Year 4/5, ${s.name}`
      })));
    }
  }

  // Map of all rendered units to check prerequisites
  const renderedUnits = new Set<string>();
  const allUnitsMap = new Map<string, UnitData>();

  semestersToRender.forEach(sem => {
    sem.units.forEach((u: UnitData) => {
      renderedUnits.add(u.code);
      allUnitsMap.set(u.code, u);
    });
  });

  // Calculate active flows dynamically
  const activeFlows = React.useMemo(() => {
    return generateUnitFlows(Array.from(renderedUnits));
  }, [specializationData, entryTerm]);

  // Calculate dependencies active state
  let highlightPrereqs = new Set<string>();
  let highlightUnlocks = new Set<string>();

  if (hoveredUnitCode) {
    highlightPrereqs = new Set(getPrereqChainForSet(hoveredUnitCode, activeFlows));
    highlightUnlocks = new Set(getUnlockChainForSet(hoveredUnitCode, activeFlows));
  }

  // Recalculate connection coordinates
  const updateConnections = () => {
    if (!gridRef.current) return;

    const newConnections: typeof connections = [];
    const gridRect = gridRef.current.getBoundingClientRect();

    activeFlows.forEach((rel, index) => {
      // Draw connection only if both units are currently rendered on screen
      if (renderedUnits.has(rel.from) && renderedUnits.has(rel.to)) {
        const fromEl = document.getElementById(`unit-card-${rel.from}`);
        const toEl = document.getElementById(`unit-card-${rel.to}`);

        if (fromEl && toEl) {
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();

          // Calculate coordinates relative to the grid wrapper ref
          const x1 = (fromRect.right - gridRect.left) + gridRef.current!.scrollLeft;
          const y1 = (fromRect.top + fromRect.height / 2 - gridRect.top) + gridRef.current!.scrollTop;

          const x2 = (toRect.left - gridRect.left) + gridRef.current!.scrollLeft;
          const y2 = (toRect.top + toRect.height / 2 - gridRect.top) + gridRef.current!.scrollTop;

          // Draw bezier curve
          const dx = Math.abs(x2 - x1) * 0.45;
          const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

          // Check if this connection is highlighted due to hover
          let isActive = false;
          let type: 'prereq' | 'unlock' = 'prereq';

          if (hoveredUnitCode) {
            if (rel.to === hoveredUnitCode && highlightPrereqs.has(rel.from)) {
              isActive = true;
              type = 'prereq';
            } else if (rel.from === hoveredUnitCode && highlightUnlocks.has(rel.to)) {
              isActive = true;
              type = 'unlock';
            } else if (highlightPrereqs.has(rel.to) && highlightPrereqs.has(rel.from)) {
              isActive = true;
              type = 'prereq';
            } else if (highlightUnlocks.has(rel.from) && highlightUnlocks.has(rel.to)) {
              isActive = true;
              type = 'unlock';
            }
          }

          newConnections.push({
            id: `conn-${rel.from}-${rel.to}-${index}`,
            from: rel.from,
            to: rel.to,
            path,
            isActive,
            type,
          });
        }
      }
    });

    setConnections(newConnections);
  };

  // Trigger coordinate calculation when layout changes
  useEffect(() => {
    // Wait a brief tick for DOM rendering to complete
    const timer = setTimeout(() => {
      updateConnections();
    }, 100);

    window.addEventListener('resize', updateConnections);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateConnections);
    };
  }, [specializationData, entryTerm, hoveredUnitCode]);

  // Categorize unit card styles
  const getUnitCardType = (code: string): 'core' | 'major' | 'minor' | 'elective' | 'qutyou' => {
    if (code.startsWith('QUT')) return 'qutyou';
    if (code.startsWith('IFB')) return 'core';
    
    // Check if it's a core option or major specific
    const isCsMajor = specializationData?.specialization?.toLowerCase().includes('computer science');
    if (code === 'CAB201' || code === 'CAB222' || code === 'CAB302' || code === 'IFB320') {
      return 'core'; // Core units shared across many majors
    }

    return 'major';
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent select-none"
    >
      <div
        ref={gridRef}
        className="relative flex gap-8 px-4 py-8 min-w-[1200px]"
        style={{ minHeight: '620px' }}
      >
        {/* SVG connection overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
          <defs>
            {/* Gradients for glow paths */}
            <linearGradient id="prereq-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="unlock-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Background/Passive paths */}
          {connections
            .filter(c => !c.isActive)
            .map(c => (
              <path
                key={c.id}
                d={c.path}
                fill="none"
                stroke="currentColor"
                className="text-border/40 dark:text-border/20"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            ))}

          {/* Foreground/Active highlighted paths with glow and flow animation */}
          {connections
            .filter(c => c.isActive)
            .map(c => (
              <g key={c.id}>
                {/* Underlay glow path */}
                <path
                  d={c.path}
                  fill="none"
                  stroke={c.type === 'prereq' ? '#3b82f6' : '#10b981'}
                  strokeWidth="6"
                  className="opacity-20 blur-[2px]"
                />
                {/* Main animated path */}
                <path
                  d={c.path}
                  fill="none"
                  stroke={c.type === 'prereq' ? 'url(#prereq-grad)' : 'url(#unlock-grad)'}
                  strokeWidth="2.5"
                  className="animate-[dash_1.5s_linear_infinite]"
                  style={{
                    strokeDasharray: '8 4',
                  }}
                />
              </g>
            ))}
        </svg>

        {/* Semester columns */}
        {semestersToRender.map((sem, semIndex) => {
          const totalSlots = 4;
          const units = sem.units || [];
          const textItems = sem.textItems || [];

          // Create standard study slots (up to 4 per semester)
          const items = [];
          units.forEach((u: UnitData) => items.push({ type: 'unit', data: u }));
          textItems.forEach((text: string) => items.push({ type: 'placeholder', data: text }));

          // Pad with electives if less than 4 slots
          while (items.length < totalSlots) {
            items.push({ type: 'placeholder', data: 'Elective study unit' });
          }

          return (
            <div
              key={sem.name}
              className="flex-1 flex flex-col gap-4 min-w-[260px] max-w-[320px] relative z-20"
            >
              {/* Semester Header */}
              <div className="flex flex-col mb-2 border-b border-border/40 pb-2">
                <span className="text-xs font-mono font-bold text-primary tracking-widest uppercase">
                  Semester 0{semIndex + 1}
                </span>
                <h3 className="text-sm font-bold text-foreground truncate mt-0.5">
                  {sem.name}
                </h3>
              </div>

              {/* Slots List */}
              <div className="flex flex-col gap-4 flex-1">
                {items.slice(0, totalSlots).map((item, itemIndex) => {
                  if (item.type === 'unit') {
                    const u = item.data as unknown as UnitData;
                    const cardType = getUnitCardType(u.code);
                    const isHovered = hoveredUnitCode === u.code;
                    const isRelated = highlightPrereqs.has(u.code) || highlightUnlocks.has(u.code);
                    const isFilteredOut = filteredOutUnitCodes.has(u.code);
                    const isDimmed = (hoveredUnitCode !== null && !isHovered && !isRelated) || isFilteredOut;

                    return (
                      <UnitCard
                        key={u.code}
                        id={`unit-card-${u.code}`}
                        unit={u}
                        type={cardType}
                        isHovered={isHovered}
                        isRelated={isRelated}
                        isDimmed={isDimmed}
                        onClick={() => onUnitClick(u)}
                        onMouseEnter={() => setHoveredUnitCode(u.code)}
                        onMouseLeave={() => setHoveredUnitCode(null)}
                      />
                    );
                  } else {
                    const text = item.data as string;
                    let type: 'elective' | 'qutyou' | 'minor' = 'elective';
                    if (text.toLowerCase().includes('qut you')) type = 'qutyou';
                    if (text.toLowerCase().includes('minor')) type = 'minor';

                    const borderColors = {
                      elective: 'border-amber-500/10 dark:border-amber-500/5 hover:border-amber-500/30 text-amber-600/80 dark:text-amber-500/70',
                      qutyou: 'border-pink-500/10 dark:border-pink-500/5 hover:border-pink-500/30 text-pink-600/80 dark:text-pink-500/70',
                      minor: 'border-emerald-500/10 dark:border-emerald-500/5 hover:border-emerald-500/30 text-emerald-600/80 dark:text-emerald-500/70',
                    };

                    const isDimmed = hoveredUnitCode !== null || filteredOutUnitCodes.size > 0;

                    return (
                      <div
                        key={`placeholder-${semIndex}-${itemIndex}`}
                        className={cn(
                          'flex items-center justify-center p-6 text-center text-xs rounded-xl border border-dashed font-semibold min-h-[92px] transition-all duration-300 bg-muted/5 backdrop-blur-md',
                          borderColors[type],
                          isDimmed ? 'opacity-20 scale-[0.98]' : 'opacity-100 scale-100 hover:scale-[1.01]'
                        )}
                      >
                        <span className="line-clamp-2 px-2">{text}</span>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Styles for line animation flow */}
      <style jsx global>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -24;
          }
        }
      `}</style>
    </div>
  );
};
