'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { ObsidianGraph } from './obsidian-graph';
import { UnitDetailsDrawer } from './unit-details-drawer';
import { UnitData } from './unit-card';
import { generateUnitFlows } from '@/lib/qut/dependencies';
import { 
  Search, 
  Layers, 
  Clock, 
  BookOpen, 
  Info,
  Network,
  CheckCircle2,
  Plus,
  Sliders,
  Award,
  ChevronRight,
  Eye,
  EyeOff,
  MapPin,
  User,
  Calendar,
  Compass,
  Check
} from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import classesDataRaw from '@/data/qut-unit-classes.json';

interface VisualizerDashboardProps {
  allCoursesData: any[]; // Array of all target courses from database
  assessmentsData: Record<string, {
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
  forcedViewMode?: 'graph' | 'explorer';
}

export default function VisualizerDashboard({ allCoursesData, assessmentsData, forcedViewMode }: VisualizerDashboardProps) {
  // Course Selection
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('IN01');
  
  // Get active course data
  const currentCourse = useMemo(() => {
    return allCoursesData.find(c => c.courseCode === selectedCourseCode) || allCoursesData[0];
  }, [allCoursesData, selectedCourseCode]);

  // View States
  const [entryTerm, setEntryTerm] = useState<'feb' | 'july'>('feb');
  const [viewMode, setViewMode] = useState<'graph' | 'explorer'>('graph'); // default to Graph
  const activeView = forcedViewMode || viewMode;
  const [hoveredUnitCode, setHoveredUnitCode] = useState<string | null>(null);
  const [focusedUnitCode, setFocusedUnitCode] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Explorer States
  const [explorerDay, setExplorerDay] = useState<string>('Monday');
  const [explorerTime, setExplorerTime] = useState<number>(10);
  const [explorerLocation, setExplorerLocation] = useState<'all' | 'GP' | 'KG' | 'Online'>('all');
  const [explorerFaculties, setExplorerFaculties] = useState<Set<string>>(new Set([
    'Information Technology', 'Science', 'Business', 'Law', 'Health', 'Education', 'Creative Industries', 'Other'
  ]));
  const [explorerClassTypes, setExplorerClassTypes] = useState<Set<string>>(new Set([
    'Lecture', 'Tutorial', 'Practical / Lab', 'Workshop / Seminar / Studio', 'Other'
  ]));
  const [explorerSearch, setExplorerSearch] = useState<string>('');

  // Graph Branch Toggles
  const [showMinors, setShowMinors] = useState(true);
  const [showElectives, setShowElectives] = useState(false);
  const [showQutYou, setShowQutYou] = useState(false);

  // Major Visibility Checkboxes
  const [visibleMajors, setVisibleMajors] = useState<Set<string>>(new Set());

  // Completed Units list state
  const [completedUnits, setCompletedUnits] = useState<Set<string>>(new Set());

  // Assessment Filters
  const [examFilter, setExamFilter] = useState<'all' | 'no-exam' | 'exam-required'>('all');
  const [countFilter, setCountFilter] = useState<'all' | 'incremental' | 'fewer'>('all');
  const [assessTypeFilter, setAssessTypeFilter] = useState<Set<string>>(new Set());
  const [assessSearch, setAssessSearch] = useState<string>('');

  // For courses like IV04 with a single "Default" specialization and structures as majors
  const [selectedSubMajor, setSelectedSubMajor] = useState<string>('');

  // Initialize/Update majors list when course changes
  useEffect(() => {
    if (currentCourse?.specializations?.length > 0) {
      const allMajors = currentCourse.specializations.map((s: any) => s.specialization);
      // For EN01 or IN01, check all majors by default
      setVisibleMajors(new Set(allMajors));
    } else {
      setVisibleMajors(new Set(['Default']));
    }
    setCompletedUnits(new Set()); // Reset completions on course switch
  }, [selectedCourseCode, currentCourse]);

  // Elective Option Lists state: structureId -> selectedOptionName
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  // Reset selected options when course changes
  useEffect(() => {
    setSelectedOptions({});
  }, [selectedCourseCode]);

  // Extract Option Lists (e.g. Minors, QUT You, Second Majors)
  const optionStructures = useMemo(() => {
    if (!currentCourse || !currentCourse.specializations) return [];
    
    // Find all options structures across all specializations of this course
    const list: any[] = [];
    const seenIds = new Set<string>();

    currentCourse.specializations.forEach((sp: any) => {
      sp.structures.forEach((s: any) => {
        const title = s.title.toLowerCase();
        const isOptions = title.includes('options') || 
                          title.includes('minor') || 
                          title.includes('elective') || 
                          title.includes('qut you');
        if (isOptions && !seenIds.has(s.id)) {
          list.push(s);
          seenIds.add(s.id);
        }
      });
    });

    return list;
  }, [currentCourse]);

  // Check if course has a single specialization with structures as majors
  const isSingleDefaultSpec = useMemo(() => {
    if (!currentCourse || !currentCourse.specializations) return false;
    if (currentCourse.specializations.length === 1 && currentCourse.specializations[0].specialization === 'Default') {
      return true;
    }
    if (currentCourse.courseCode === 'IV04') {
      return true;
    }
    return false;
  }, [currentCourse]);

  // Extract sub-majors list (for courses like IV04 with a single "Default" specialization)
  const subMajorsList = useMemo(() => {
    if (!currentCourse || !isSingleDefaultSpec) return [];
    const spec = currentCourse.specializations[0];
    return spec.structures
      .filter((s: any) => 
        s.title.toLowerCase().includes('major') && 
        !s.title.toLowerCase().includes('option') &&
        !s.title.toLowerCase().includes('final year')
      )
      .map((s: any) => s.title.split(':')[0].split('-')[0].trim());
  }, [currentCourse, isSingleDefaultSpec]);

  // Initialize/Update selectedSubMajor when course or list changes
  useEffect(() => {
    if (isSingleDefaultSpec && subMajorsList.length > 0) {
      setSelectedSubMajor(subMajorsList[0]);
    } else {
      setSelectedSubMajor('');
    }
  }, [selectedCourseCode, isSingleDefaultSpec, subMajorsList]);

  // Compile map of unitCode -> list of specialization names it belongs to (for node styling)
  const unitToMajorsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!currentCourse) return map;

    if (isSingleDefaultSpec) {
      const spec = currentCourse.specializations[0];
      spec.structures.forEach((st: any) => {
        const isMajor = st.title.toLowerCase().includes('major') && 
                        !st.title.toLowerCase().includes('option') &&
                        !st.title.toLowerCase().includes('final year');
        if (isMajor) {
          const majorName = st.title.split(':')[0].split('-')[0].trim().replace(' Major', '');
          st.semesters.forEach((sem: any) => {
            sem.units.forEach((u: UnitData) => {
              const list = map.get(u.code) || [];
              if (!list.includes(majorName)) {
                list.push(majorName);
              }
              map.set(u.code, list);
            });
          });
        }
      });
    } else {
      currentCourse.specializations.forEach((sp: any) => {
        const majorName = sp.specialization;
        sp.structures.forEach((st: any) => {
          const isOptions = st.title.toLowerCase().includes('options') || 
                            st.title.toLowerCase().includes('minor') || 
                            st.title.toLowerCase().includes('elective');
          if (!isOptions) {
            st.semesters.forEach((sem: any) => {
              sem.units.forEach((u: UnitData) => {
                const list = map.get(u.code) || [];
                if (!list.includes(majorName)) {
                  list.push(majorName);
                }
                map.set(u.code, list);
              });
            });
          }
        });
      });
    }

    return map;
  }, [currentCourse, isSingleDefaultSpec]);

  // Get active study plan structure for Grid view (metro map)
  const currentSpecialization = useMemo(() => {
    if (!currentCourse || !currentCourse.specializations) return null;
    
    // In grid mode, we display one major at a time. Pick the first visible major.
    const activeMajorName = Array.from(visibleMajors)[0] || '';
    return currentCourse.specializations.find((s: any) =>
      s.specialization.toLowerCase() === activeMajorName.toLowerCase()
    ) || currentCourse.specializations[0];
  }, [currentCourse, visibleMajors]);

  // Compile the complete list of unique units across all selected (visible) majors, minors, electives, and breadth
  const unitsInLayout = useMemo(() => {
    if (!currentCourse) return [];
    const list: UnitData[] = [];
    const codeSet = new Set<string>();

    const addUnit = (u: UnitData) => {
      if (!codeSet.has(u.code)) {
        list.push(u);
        codeSet.add(u.code);
      }
    };

    const slugify = (text: string) => {
      return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/&/g, '-and-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
    };

    // 1. Gather units from all specializations that are checked
    currentCourse.specializations.forEach((sp: any) => {
      if (visibleMajors.has(sp.specialization)) {
        const isSingleDefault = sp.specialization === 'Default' || sp.specialization.toLowerCase() === 'master of data science';
        
        sp.structures.forEach((st: any) => {
          if (isSingleDefault && selectedSubMajor) {
            const isTargetUndergrad = st.title.toLowerCase().includes(selectedSubMajor.toLowerCase());
            const isPostgradFinalYear = st.title.toLowerCase().includes('final year');
            const isOptions = st.title.toLowerCase().includes('options') || 
                              st.title.toLowerCase().includes('minor') || 
                              st.title.toLowerCase().includes('elective') ||
                              st.title.toLowerCase().includes('qut you');
                              
            if (!isTargetUndergrad && !isPostgradFinalYear) {
              return;
            }
            if (isOptions) {
              return;
            }
          } else {
            const isOptions = st.title.toLowerCase().includes('options') || 
                              st.title.toLowerCase().includes('minor') || 
                              st.title.toLowerCase().includes('elective') ||
                              st.title.toLowerCase().includes('qut you');
            if (isOptions) {
              return;
            }
          }
          
          st.semesters.forEach((sem: any) => {
            sem.units.forEach((u: UnitData) => {
              addUnit(u);
            });
          });
        });
      }
    });

    // 2. Gather units from selected minors/options lists
    optionStructures.forEach((struct: any) => {
      const selectedOptionName = selectedOptions[struct.id];
      if (selectedOptionName) {
        const optionSem = struct.semesters.find((sem: any) => sem.name === selectedOptionName);
        if (optionSem) {
          optionSem.units.forEach((u: UnitData) => {
            addUnit(u);
          });
        }
      }
    });

    // 3. Concurrently display Option Paths (Minors) as branches if toggled
    if (showMinors) {
      currentCourse.specializations.forEach((sp: any) => {
        if (visibleMajors.has(sp.specialization)) {
          sp.structures.forEach((st: any) => {
            if (st.title.toLowerCase().includes('minor') && !st.title.toLowerCase().includes('university wide')) {
              st.semesters.forEach((sem: any) => {
                if (sem.units.length > 0) {
                  // Inject virtual hub node representing this Minor
                  const hubCode = `HUB-MNR-${slugify(sem.name)}`;
                  addUnit({
                    code: hubCode,
                    title: `${sem.name} Minor`,
                    creditPoints: null,
                    campus: '',
                    synopsis: `Virtual category hub for the ${sem.name}.`
                  });

                  sem.units.forEach((u: UnitData) => {
                    addUnit(u);
                  });
                }
              });
            }
          });
        }
      });
    }

    // 4. Concurrently display Breadth (QUT You) units as branches if toggled
    if (showQutYou) {
      currentCourse.specializations.forEach((sp: any) => {
        if (visibleMajors.has(sp.specialization)) {
          sp.structures.forEach((st: any) => {
            if (st.title.toLowerCase().includes('qut you')) {
              const hubCode = 'HUB-QUTYOU';
              addUnit({
                code: hubCode,
                title: 'QUT You Breadth Stream',
                creditPoints: null,
                campus: '',
                synopsis: 'Virtual category hub for the QUT You breadth stream.'
              });

              st.semesters.forEach((sem: any) => {
                sem.units.forEach((u: UnitData) => {
                  addUnit(u);
                });
              });
            }
          });
        }
      });
    }

    // 5. Concurrently display Electives as branches if toggled
    if (showElectives) {
      currentCourse.specializations.forEach((sp: any) => {
        if (visibleMajors.has(sp.specialization)) {
          sp.structures.forEach((st: any) => {
            if (st.title.toLowerCase().includes('elective') || st.title.toLowerCase().includes('university wide')) {
              st.semesters.forEach((sem: any) => {
                if (sem.units.length > 0) {
                  const hubCode = `HUB-EL-${slugify(sem.name)}`;
                  addUnit({
                    code: hubCode,
                    title: `${sem.name} Option List`,
                    creditPoints: null,
                    campus: '',
                    synopsis: `Virtual category hub for the ${sem.name} electives.`
                  });

                  sem.units.forEach((u: UnitData) => {
                    addUnit(u);
                  });
                }
              });
            }
          });
        }
      });
    }

    return list;
  }, [currentCourse, visibleMajors, optionStructures, selectedOptions, showMinors, showElectives, showQutYou, selectedSubMajor, isSingleDefaultSpec]);

  // Compute set of unit codes that are filtered out by assessment/exam selections
  const filteredOutUnitCodes = useMemo(() => {
    const set = new Set<string>();
    unitsInLayout.forEach(u => {
      if (u.code.startsWith('HUB-')) return;
      const data = assessmentsData[u.code];
      if (!data) return; // if not scraped yet, don't filter out

      // Check exam requirement filter
      if (examFilter === 'no-exam' && data.hasExam) {
        set.add(u.code);
        return;
      }
      if (examFilter === 'exam-required' && !data.hasExam) {
        set.add(u.code);
        return;
      }

      // Check count/structure filter
      // 'incremental' -> 3 or more assessments
      // 'fewer' -> 1-2 assessments
      if (countFilter === 'incremental' && data.assessmentCount < 3) {
        set.add(u.code);
        return;
      }
      if (countFilter === 'fewer' && (data.assessmentCount === 0 || data.assessmentCount > 2)) {
        set.add(u.code);
        return;
      }

      // Check Assessment Search Filter
      if (assessSearch.trim() !== '') {
        const query = assessSearch.toLowerCase().trim();
        const matchesQuery = data.items.some(item => 
          item.name.toLowerCase().includes(query) || 
          item.description.toLowerCase().includes(query)
        );
        if (!matchesQuery) {
          set.add(u.code);
          return;
        }
      }

      // Check Assessment Type Filter
      if (assessTypeFilter.size > 0) {
        let matchesType = false;
        
        data.items.forEach(item => {
          const nameLower = item.name.toLowerCase();
          const descLower = item.description.toLowerCase();
          
          assessTypeFilter.forEach(type => {
            if (type === 'assignment') {
              if (nameLower.includes('assignment') || nameLower.includes('project') || nameLower.includes('report') || nameLower.includes('essay') || nameLower.includes('case study')) {
                matchesType = true;
              }
            } else if (type === 'quiz') {
              if (nameLower.includes('quiz') || nameLower.includes('test') || nameLower.includes('exam') && !nameLower.includes('final exam') && !nameLower.includes('final examination')) {
                matchesType = true;
              }
            } else if (type === 'practical') {
              if (nameLower.includes('practical') || nameLower.includes('lab') || nameLower.includes('laboratory') || nameLower.includes('studio') || nameLower.includes('workshop')) {
                matchesType = true;
              }
            } else if (type === 'presentation') {
              if (nameLower.includes('presentation') || nameLower.includes('oral') || nameLower.includes('pitch') || nameLower.includes('talk')) {
                matchesType = true;
              }
            } else if (type === 'portfolio') {
              if (nameLower.includes('portfolio') || nameLower.includes('workbook') || nameLower.includes('journal') || nameLower.includes('logbook')) {
                matchesType = true;
              }
            }
          });
        });

        if (!matchesType) {
          set.add(u.code);
          return;
        }
      }
    });
    return set;
  }, [unitsInLayout, assessmentsData, examFilter, countFilter, assessSearch, assessTypeFilter]);

  // Global map of ALL units in this course to resolve searches/jump links
  const allCourseUnitsMap = useMemo(() => {
    const map = new Map<string, UnitData>();
    if (!currentCourse) return map;
    currentCourse.specializations.forEach((sp: any) => {
      sp.structures.forEach((st: any) => {
        st.semesters.forEach((sem: any) => {
          sem.units.forEach((u: UnitData) => {
            map.set(u.code, u);
          });
        });
      });
    });
    return map;
  }, [currentCourse]);

  // -------------------------------------------------------------
  // Live Campus Explorer Helpers & Memos
  // -------------------------------------------------------------
  
  // 1. Compile map of unitCode -> title across all courses in allCoursesData
  const unitCodeToTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    allCoursesData.forEach(course => {
      course.specializations?.forEach((spec: any) => {
        spec.structures?.forEach((struct: any) => {
          struct.semesters?.forEach((sem: any) => {
            sem.units?.forEach((u: any) => {
              if (u.code && u.title) {
                map.set(u.code.toUpperCase(), u.title);
              }
            });
          });
        });
      });
    });
    return map;
  }, [allCoursesData]);

  // 1b. Compile map of unitCode -> courses list across all courses
  const unitCodeToCoursesMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    allCoursesData.forEach(course => {
      course.specializations?.forEach((spec: any) => {
        spec.structures?.forEach((struct: any) => {
          struct.semesters?.forEach((sem: any) => {
            sem.units?.forEach((u: any) => {
              if (u.code) {
                const codeUpper = u.code.toUpperCase();
                if (!map.has(codeUpper)) {
                  map.set(codeUpper, new Set());
                }
                map.get(codeUpper)!.add(course.courseCode);
              }
            });
          });
        });
      });
    });
    return map;
  }, [allCoursesData]);

  // Helper: Determine high-level degree level (Bachelors vs Masters) based on code structure
  const getUnitLevel = (unitCode: string): 'Bachelors' | 'Masters' => {
    const digitsMatch = unitCode.match(/\d+/);
    if (digitsMatch) {
      const firstDigit = parseInt(digitsMatch[0][0], 10);
      if (firstDigit >= 1 && firstDigit <= 4) {
        return 'Bachelors';
      }
      if (firstDigit >= 5 && firstDigit <= 9) {
        return 'Masters';
      }
    }
    if (unitCode.charAt(2).toUpperCase() === 'N') {
      return 'Masters';
    }
    return 'Bachelors';
  };

  // Helper: map activityType to clean filter categories
  const getExplorerClassTypeCategory = (activityType: string): string => {
    const t = activityType.toLowerCase();
    if (t.includes('lecture')) return 'Lecture';
    if (t.includes('tutorial')) return 'Tutorial';
    if (t.includes('practical') || t.includes('laboratory') || t.includes('lab')) return 'Practical / Lab';
    if (t.includes('workshop') || t.includes('seminar') || t.includes('studio')) return 'Workshop / Seminar / Studio';
    return 'Other';
  };

  // Helper: map unit code prefix to faculty
  const getFacultyByUnitCode = (unitCode: string): string => {
    const prefix = unitCode.substring(0, 3).toUpperCase();
    if (['CAB', 'IFB', 'IAB', 'IGB', 'IFN', 'DSB'].includes(prefix)) {
      return 'Information Technology';
    }
    if (['MXB', 'MZB', 'BVB', 'CYB', 'PVB', 'SEB', 'MSB', 'EGB', 'ENB'].includes(prefix)) {
      return 'Science';
    }
    if (['AMB', 'AYB', 'BSB', 'EFB', 'AMN', 'AYN', 'BSN', 'EFN'].includes(prefix)) {
      return 'Business';
    }
    if (['LLB', 'LLN'].includes(prefix)) {
      return 'Law';
    }
    if (['NSB', 'PUB', 'PYB', 'LQB', 'NSN', 'PUN', 'PYN'].includes(prefix)) {
      return 'Health';
    }
    if (['EUB', 'EUN'].includes(prefix)) {
      return 'Education';
    }
    if (['KKB', 'DXB', 'DVB', 'KIB', 'KKN', 'DXN', 'DVN', 'KIN'].includes(prefix)) {
      return 'Creative Industries';
    }
    return 'Other';
  };

  // Helper: parse time display "9:00 AM - 11:00 AM" to minutes of the day
  const parseTimeRangeToMinutes = (timeDisplay: string): { start: number; end: number } | null => {
    if (!timeDisplay) return null;
    const parts = timeDisplay.split('-').map(p => p.trim());
    if (parts.length !== 2) return null;
    
    const parseTime = (timeStr: string) => {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (!match) return 0;
      let hour = parseInt(match[1], 10);
      const minute = parseInt(match[2], 10);
      const ampm = match[3] ? match[3].toUpperCase() : null;
      
      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      
      return hour * 60 + minute;
    };
    
    return {
      start: parseTime(parts[0]),
      end: parseTime(parts[1])
    };
  };

  // 2. Extract all scraped classes
  const allAvailableClasses = useMemo(() => {
    const list: any[] = [];
    const db = (classesDataRaw as any)?.data || {};
    
    Object.keys(db).forEach(unitCode => {
      const entry = db[unitCode];
      if (entry && entry.offered && entry.classes) {
        const unitCodeUpper = unitCode.toUpperCase();
        const unitTitle = unitCodeToTitleMap.get(unitCodeUpper) || 'QUT Elective/Unit';
        const faculty = getFacultyByUnitCode(unitCodeUpper);
        const unitLevel = getUnitLevel(unitCodeUpper);
        const coursesSet = unitCodeToCoursesMap.get(unitCodeUpper);
        const courses = coursesSet ? Array.from(coursesSet) : [];
        
        entry.classes.forEach((cls: any) => {
          list.push({
            ...cls,
            unitCode: unitCodeUpper,
            unitTitle,
            faculty,
            unitLevel,
            courses,
          });
        });
      }
    });
    return list;
  }, [unitCodeToTitleMap, unitCodeToCoursesMap]);

  // 3. Filtered classes feed
  const filteredClasses = useMemo(() => {
    const chosenTimeMinutes = explorerTime * 60;
    
    return allAvailableClasses.filter(cls => {
      // Day filter
      if (cls.day !== explorerDay) return false;
      
      // Campus filter
      if (explorerLocation === 'GP' && cls.campus !== 'Gardens Point') return false;
      if (explorerLocation === 'KG' && cls.campus !== 'Kelvin Grove') return false;
      if (explorerLocation === 'Online' && cls.campus !== 'Online') return false;
      
      // Faculty filter
      if (!explorerFaculties.has(cls.faculty)) return false;
      
      // Class Type filter
      const typeCategory = getExplorerClassTypeCategory(cls.activityType);
      if (!explorerClassTypes.has(typeCategory)) return false;
      
      // Time filter (ongoing or starting in the next 3 hours)
      const timeRange = parseTimeRangeToMinutes(cls.timeDisplay);
      if (!timeRange) return false;
      
      const isOngoing = timeRange.start <= chosenTimeMinutes && timeRange.end > chosenTimeMinutes;
      const isUpcoming = timeRange.start > chosenTimeMinutes && timeRange.start < (chosenTimeMinutes + 60);
      
      if (!isOngoing && !isUpcoming) return false;
      
      cls.isOngoing = isOngoing;
      cls.startMinutes = timeRange.start;
      cls.endMinutes = timeRange.end;
      cls.duration = timeRange.end - timeRange.start;
      
      // Search text filter
      if (explorerSearch) {
        const query = explorerSearch.toLowerCase();
        const matchCode = cls.unitCode.toLowerCase().includes(query);
        const matchTitle = cls.unitTitle.toLowerCase().includes(query);
        const matchLocation = cls.locationDisplay.toLowerCase().includes(query);
        const matchStaff = cls.teachingStaff.toLowerCase().includes(query);
        const matchDescription = cls.description?.toLowerCase().includes(query);
        
        if (!matchCode && !matchTitle && !matchLocation && !matchStaff && !matchDescription) {
          return false;
        }
      }
      
      return true;
    }).sort((a, b) => {
      // Ongoing first
      if (a.isOngoing && !b.isOngoing) return -1;
      if (!a.isOngoing && b.isOngoing) return 1;
      
      // Prioritize classes that start closest to the chosen explorer time (exact match comes first)
      const diffA = Math.abs(a.startMinutes - chosenTimeMinutes);
      const diffB = Math.abs(b.startMinutes - chosenTimeMinutes);
      if (diffA !== diffB) {
        return diffA - diffB;
      }
      
      // Heuristic: Deprioritize classes that span over 4 hours (240 minutes) e.g., 9am-3pm (6 hours)
      const isLongA = a.duration > 240;
      const isLongB = b.duration > 240;
      if (isLongA && !isLongB) return 1;
      if (!isLongA && isLongB) return -1;
      
      // Sort by start time ascending
      return a.startMinutes - b.startMinutes;
    });
  }, [allAvailableClasses, explorerDay, explorerTime, explorerLocation, explorerFaculties, explorerClassTypes, explorerSearch]);

  // Effect: Set initial Day and Time with system clock on mount
  useEffect(() => {
    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[now.getDay()];
    
    let activeDay = dayName;
    if (dayName === 'Sunday' || dayName === 'Saturday') {
      activeDay = 'Monday'; // Default weekday view
    }
    
    const currentHour = now.getHours();
    const activeHour = Math.min(21, Math.max(8, currentHour));
    
    setExplorerDay(activeDay);
    setExplorerTime(activeHour);
  }, []);

  // Action: Explore outline details in drawer
  const handleExploreUnit = (unitCode: string) => {
    let unitInfo = allCourseUnitsMap.get(unitCode);
    if (!unitInfo) {
      unitInfo = {
        code: unitCode,
        title: unitCodeToTitleMap.get(unitCode) || 'QUT Elective/Unit',
        creditPoints: 12,
        campus: 'Gardens Point / Kelvin Grove',
        synopsis: 'Public outline details and synopsis are available. Check assessments below.'
      };
    }
    setSelectedUnit(unitInfo);
    setIsDrawerOpen(true);
  };

  // Compute connections links based on active nodes and inject hub connections
  const activeLinks = useMemo(() => {
    const actualCodes = unitsInLayout.filter(u => !u.code.startsWith('HUB-')).map(u => u.code);
    
    // Get standard prerequisite links
    const links = generateUnitFlows(actualCodes);

    const coreAnchor = actualCodes.find(c => c === 'IFB104') || 
                       actualCodes.find(c => c === 'IFB102') || 
                       actualCodes.find(c => c.startsWith('IFB10')) ||
                       actualCodes[0];

    const slugify = (text: string) => {
      return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/&/g, '-and-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
    };

    if (!currentCourse) return links;

    // 1. Minors Hub Links
    if (showMinors) {
      currentCourse.specializations.forEach((sp: any) => {
        if (visibleMajors.has(sp.specialization)) {
          sp.structures.forEach((st: any) => {
            if (st.title.toLowerCase().includes('minor') && !st.title.toLowerCase().includes('university wide')) {
              st.semesters.forEach((sem: any) => {
                if (sem.units.length > 0) {
                  const hubCode = `HUB-MNR-${slugify(sem.name)}`;
                  
                  // Link core anchor -> hub
                  if (coreAnchor) {
                    links.push({ from: coreAnchor, to: hubCode, type: 'prereq' });
                  }
                  
                  // Link hub -> each minor unit
                  sem.units.forEach((u: any) => {
                    links.push({ from: hubCode, to: u.code, type: 'recommended' });
                  });
                }
              });
            }
          });
        }
      });
    }

    // 2. QUT You Hub Links
    if (showQutYou && coreAnchor) {
      const hubCode = 'HUB-QUTYOU';
      const capstoneAnchor = actualCodes.find(c => c === 'IFB398') || actualCodes.find(c => c === 'IFB399') || coreAnchor;
      
      links.push({ from: capstoneAnchor, to: hubCode, type: 'prereq' });
      
      currentCourse.specializations.forEach((sp: any) => {
        if (visibleMajors.has(sp.specialization)) {
          sp.structures.forEach((st: any) => {
            if (st.title.toLowerCase().includes('qut you')) {
              st.semesters.forEach((sem: any) => {
                sem.units.forEach((u: any) => {
                  links.push({ from: hubCode, to: u.code, type: 'recommended' });
                });
              });
            }
          });
        }
      });
    }

    // 3. Electives Hub Links
    if (showElectives && coreAnchor) {
      currentCourse.specializations.forEach((sp: any) => {
        if (visibleMajors.has(sp.specialization)) {
          sp.structures.forEach((st: any) => {
            if (st.title.toLowerCase().includes('elective') || st.title.toLowerCase().includes('university wide')) {
              st.semesters.forEach((sem: any) => {
                if (sem.units.length > 0) {
                  const hubCode = `HUB-EL-${slugify(sem.name)}`;
                  
                  links.push({ from: coreAnchor, to: hubCode, type: 'prereq' });
                  
                  sem.units.forEach((u: any) => {
                    links.push({ from: hubCode, to: u.code, type: 'recommended' });
                  });
                }
              });
            }
          });
        }
      });
    }

    // Deduplicate links
    const seen = new Set<string>();
    const uniqueLinks: typeof links = [];
    links.forEach(l => {
      const key = `${l.from}-${l.to}`;
      if (!seen.has(key)) {
        uniqueLinks.push(l);
        seen.add(key);
      }
    });

    return uniqueLinks;
  }, [unitsInLayout, currentCourse, visibleMajors, showMinors, showElectives, showQutYou]);

  // Progression: Unlocked nodes (ready to study)
  const unlockedUnitCodes = useMemo(() => {
    const unlocked = new Set<string>();

    unitsInLayout.forEach(u => {
      if (completedUnits.has(u.code)) return; // already done

      // Find prerequisites for this node in the graph
      const prereqs = activeLinks.filter(l => l.to === u.code).map(l => l.from);

      // If all prerequisites are in completedUnits, it's unlocked!
      const allDone = prereqs.every(p => completedUnits.has(p));
      if (allDone) {
        unlocked.add(u.code);
      }
    });

    return unlocked;
  }, [unitsInLayout, activeLinks, completedUnits]);

  // Stats Breakdown
  const stats = useMemo(() => {
    const totalCourseCP = currentCourse?.creditPoints || 288;
    const completedCP = completedUnits.size * 12;
    const percentage = Math.min(100, Math.round((completedCP / totalCourseCP) * 100));

    return {
      totalCourseCP,
      completedCP,
      percentage,
      count: completedUnits.size,
    };
  }, [currentCourse, completedUnits]);

  // Autocomplete search filtering
  const filteredSearchList = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase().trim();
    return Array.from(allCourseUnitsMap.values())
      .filter(u => u.code.toLowerCase().includes(q) || u.title.toLowerCase().includes(q))
      .slice(0, 5);
  }, [searchQuery, allCourseUnitsMap]);

  const getUnitCardType = (code: string): 'core' | 'major' | 'minor' | 'elective' | 'qutyou' | 'hub' => {
    if (code.startsWith('HUB-')) return 'hub';
    if (code.startsWith('QUT')) return 'qutyou';
    if (code.startsWith('IFB') || code.startsWith('EGB10') || code === 'MZB125') return 'core';

    let isFromOption = false;
    optionStructures.forEach((struct: any) => {
      const selectedOption = selectedOptions[struct.id];
      if (selectedOption) {
        const optSem = struct.semesters.find((s: any) => s.name === selectedOption);
        if (optSem?.units.some((u: any) => u.code === code)) {
          isFromOption = true;
        }
      }
    });

    if (isFromOption) return 'minor';
    return 'major';
  };

  const handleJumpToUnit = (code: string) => {
    const targetUnit = allCourseUnitsMap.get(code);
    if (targetUnit) {
      setSelectedUnit(targetUnit);
      setIsDrawerOpen(true);
      setFocusedUnitCode(code); // camera zoom on searched unit

      const cardEl = document.getElementById(`unit-card-${code}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  };

  const handleUnitClick = (unit: UnitData) => {
    setSelectedUnit(unit);
    setIsDrawerOpen(true);
  };

  const toggleMajorVisibility = (majorName: string) => {
    setVisibleMajors(prev => {
      const next = new Set(prev);
      if (next.has(majorName)) {
        // Prevent disabling all majors
        if (next.size > 1) {
          next.delete(majorName);
        }
      } else {
        next.add(majorName);
      }
      return next;
    });
  };

  const toggleUnitCompleted = (code: string) => {
    setCompletedUnits(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const capitalize = (str: string) => {
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className="flex flex-col flex-grow w-full h-full min-h-0">
      {/* Main Application Body (inside the XP Panel) */}
      <div className="xp-panel p-5 space-y-6 flex-grow flex flex-col justify-between">

          {/* XP Top Control Bar (mimicking standard XP options panel) */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white border-t-2 border-l-2 border-r-2 border-b-2 border-t-[#808080] border-l-[#808080] border-r-white border-b-white p-4">
            {activeView === 'graph' ? (
              /* Left Controls: Course Selector & Title (Graph specific) */
              <div className="space-y-1 w-full lg:w-auto">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-700 font-sans">
                  <span>Select Course:</span>
                  <select
                    value={selectedCourseCode}
                    onChange={(e) => setSelectedCourseCode(e.target.value)}
                    className="xp-select border px-2 py-0.5 text-xs font-semibold cursor-pointer"
                  >
                    {allCoursesData.map(c => (
                      <option key={c.courseCode} value={c.courseCode}>
                        {c.courseCode} — {c.courseTitle}
                      </option>
                    ))}
                  </select>
                </div>
                <h2 className="text-sm font-bold text-zinc-800 tracking-tight font-sans uppercase">
                  {currentCourse?.courseTitle || 'Degree Flow Visualizer'}
                </h2>
              </div>
            ) : (
              /* Left Controls: Explorer Generic Title (Explorer specific) */
              <div className="space-y-1 w-full lg:w-auto">
                <div className="flex items-center gap-1">
                  <span className="bg-[#0053e2]/10 text-[#0053e2] text-[10px] font-sans font-bold px-2 py-0.5 border border-[#0053e2]/20">
                    CAMPUS EXPLORER MODE
                  </span>
                </div>
                <h2 className="text-sm font-bold text-zinc-800 tracking-tight font-sans uppercase">
                  QUT Live & Upcoming Classes Explorer
                </h2>
              </div>
            )}

            {/* Right Controls: View modes & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              {!forcedViewMode && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-bold text-zinc-700 font-sans">View:</span>
                  <button
                    onClick={() => setViewMode('graph')}
                    className={cn(
                      'xp-button py-1 px-3',
                      activeView === 'graph' && 'xp-button-active'
                    )}
                  >
                    <Network className="w-3.5 h-3.5" /> Obsidian Graph
                  </button>
                  <button
                    onClick={() => setViewMode('explorer')}
                    className={cn(
                      'xp-button py-1 px-3',
                      activeView === 'explorer' && 'xp-button-active'
                    )}
                  >
                    <Compass className="w-3.5 h-3.5" /> Campus Explorer
                  </button>
                </div>
              )}

              {/* Autocomplete Input */}
              <div className="relative w-full sm:w-48">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-400" />
                  <input
                    placeholder="Search unit code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="xp-input pl-8 w-full h-8"
                  />
                </div>

                {searchQuery && filteredSearchList.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-white border-2 border-[#0053e2] shadow-md font-sans">
                    {filteredSearchList.map(u => (
                      <div
                        key={u.code}
                        onClick={() => {
                          handleJumpToUnit(u.code);
                          setSearchQuery('');
                          setFocusedUnitCode(u.code);
                        }}
                        className="flex items-center justify-between p-2 hover:bg-[#316ac5] hover:text-white text-black cursor-pointer border-b border-zinc-200 last:border-0 text-xs"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold">{u.code}</span>
                            {assessmentsData[u.code] && (
                              <span className="text-[9px] font-bold text-zinc-500">
                                {assessmentsData[u.code].hasExam ? "[EXAM]" : "[NO EXAM]"}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 hover:text-inherit truncate mt-0.5">{u.title}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeView === 'explorer' ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-grow">
              
              {/* Left Column: Explorer task sidebar */}
              <div className="lg:col-span-1 flex flex-col h-fit bg-[#ece9d8] border border-[#d8d2bd]">
                <div className="bg-[#0053e2] text-white px-2 py-1 flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" /> Filter Options
                  </span>
                </div>
                <div className="p-4 space-y-4 font-sans text-xs text-black">
                  
                  {/* Day Selection */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-zinc-700 block">Day of Week</label>
                    <div className="grid grid-cols-5 gap-1">
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => {
                        const active = explorerDay === day;
                        const shortName = day.substring(0, 3);
                        return (
                          <button
                            key={day}
                            onClick={() => setExplorerDay(day)}
                            className={cn(
                              "xp-button py-1.5 px-0 text-center font-bold text-[10px]",
                              active && "xp-button-active"
                            )}
                          >
                            {shortName}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="font-bold text-zinc-700">Start Time</label>
                      <span className="font-bold bg-white border px-1.5 py-0.5">
                        {explorerTime === 12 ? '12 PM' : explorerTime > 12 ? `${explorerTime - 12} PM` : `${explorerTime} AM`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="21"
                      value={explorerTime}
                      onChange={(e) => setExplorerTime(parseInt(e.target.value, 10))}
                      className="w-full cursor-pointer accent-[#0053e2]"
                    />
                    <div className="flex justify-between text-[9px] text-zinc-500 px-0.5 font-bold">
                      <span>8 AM</span>
                      <span>12 PM</span>
                      <span>4 PM</span>
                      <span>9 PM</span>
                    </div>
                  </div>

                  {/* Campus Location */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-zinc-700 block">Location</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { value: 'all', label: 'All' },
                        { value: 'GP', label: 'Gardens Point' },
                        { value: 'KG', label: 'Kelvin Grove' },
                        { value: 'Online', label: 'Online' },
                      ].map((loc) => {
                        const active = explorerLocation === loc.value;
                        return (
                          <button
                            key={loc.value}
                            onClick={() => setExplorerLocation(loc.value as any)}
                            className={cn(
                              "xp-button py-1.5 px-1 text-center truncate",
                              active && "xp-button-active"
                            )}
                          >
                            {loc.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Faculty Filter */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="font-bold text-zinc-700">Faculties</label>
                      <button
                        onClick={() => {
                          const allFacs = ['Information Technology', 'Science', 'Business', 'Law', 'Health', 'Education', 'Creative Industries', 'Other'];
                          if (explorerFaculties.size === allFacs.length) {
                            setExplorerFaculties(new Set());
                          } else {
                            setExplorerFaculties(new Set(allFacs));
                          }
                        }}
                        className="text-[9px] font-bold text-blue-700 hover:underline"
                      >
                        {explorerFaculties.size === 8 ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1 bg-white border p-1">
                      {['Information Technology', 'Science', 'Business', 'Law', 'Health', 'Education', 'Creative Industries', 'Other'].map((fac) => {
                        const checked = explorerFaculties.has(fac);
                        return (
                          <div
                            key={fac}
                            onClick={() => {
                              const next = new Set(explorerFaculties);
                              if (next.has(fac)) next.delete(fac);
                              else next.add(fac);
                              setExplorerFaculties(next);
                            }}
                            className="flex items-center gap-1.5 p-1 hover:bg-[#316ac5] hover:text-white cursor-pointer text-[11px] transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              readOnly
                              className="cursor-pointer accent-[#0053e2]"
                            />
                            <span className="truncate">{fac}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Class Type Filter */}
                  <div className="space-y-1 pt-1.5 border-t border-zinc-300">
                    <div className="flex justify-between items-center">
                      <label className="font-bold text-zinc-700">Class Types</label>
                      <button
                        onClick={() => {
                          const allTypes = ['Lecture', 'Tutorial', 'Practical / Lab', 'Workshop / Seminar / Studio', 'Other'];
                          if (explorerClassTypes.size === allTypes.length) {
                            setExplorerClassTypes(new Set());
                          } else {
                            setExplorerClassTypes(new Set(allTypes));
                          }
                        }}
                        className="text-[10px] font-bold text-[#0053e2] hover:underline"
                      >
                        {explorerClassTypes.size === 5 ? 'None' : 'All'}
                      </button>
                    </div>
                    <div className="space-y-1 max-h-[110px] overflow-y-auto bg-white border p-1 rounded">
                      {['Lecture', 'Tutorial', 'Practical / Lab', 'Workshop / Seminar / Studio', 'Other'].map((type) => {
                        const checked = explorerClassTypes.has(type);
                        return (
                          <div
                            key={type}
                            onClick={() => {
                              const next = new Set(explorerClassTypes);
                              if (next.has(type)) {
                                next.delete(type);
                              } else {
                                next.add(type);
                              }
                              setExplorerClassTypes(next);
                            }}
                            className="flex items-center gap-1.5 p-1 hover:bg-[#316ac5] hover:text-white cursor-pointer text-[11px] transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              readOnly
                              className="cursor-pointer accent-[#0053e2]"
                            />
                            <span className="truncate">{type}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Search Inside Explorer */}
                  <div className="space-y-1.5 pt-2 border-t border-zinc-300">
                    <label className="font-bold text-zinc-700 block">Search Keyword</label>
                    <div className="relative">
                      <Search className="absolute left-2 top-1.5 w-3 h-3 text-zinc-400" />
                      <input
                        placeholder="Search unit, staff..."
                        value={explorerSearch}
                        onChange={(e) => setExplorerSearch(e.target.value)}
                        className="xp-input pl-7 w-full h-7"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Classes Feed */}
              <div className="lg:col-span-3 space-y-4 flex flex-col">
                {/* Feed Info Panel (Windows XP Styled Inset Status Box) */}
                <div 
                  className="border-t-[1.5px] border-l-[1.5px] border-r border-b border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-[#ece9d8] p-3 text-xs text-black rounded-none shadow-sm animate-in fade-in duration-300"
                  style={{ fontFamily: "'Tahoma', 'MS Sans Serif', sans-serif" }}
                >
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <h2 
                        className="font-bold text-[#0053e2] flex items-center gap-1.5 uppercase text-xs"
                        style={{ fontFamily: "'Tahoma', 'MS Sans Serif', sans-serif" }}
                      >
                        <Compass className="w-4 h-4 text-[#0053e2]" />
                        Active Classes Feed
                      </h2>
                      <p 
                        className="text-[11px] text-zinc-700 mt-0.5 font-bold"
                        style={{ fontFamily: "'Tahoma', 'MS Sans Serif', sans-serif" }}
                      >
                        Found {filteredClasses.length} classes scheduled on {explorerDay} at {explorerTime === 12 ? '12 PM' : explorerTime > 12 ? `${explorerTime - 12} PM` : `${explorerTime} AM`}.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cards Grid */}
                {filteredClasses.length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-zinc-300 py-16 text-center flex flex-col items-center justify-center space-y-2 rounded">
                    <Clock className="w-8 h-8 text-zinc-400" />
                    <p className="text-xs font-bold text-zinc-700">NO CLASSES FOUND</p>
                    <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                      Adjust filters or sliding timer to locate active classes.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2 pb-6">
                    {filteredClasses.slice(0, 100).map((cls, idx) => (
                      <div
                        key={`${cls.unitCode}-${cls.activityGroupCode}-${cls.classNumber}-${idx}`}
                        className={cn(
                          "xp-window flex flex-col justify-between border-2",
                          cls.isOngoing ? "border-[#e04343]" : "border-[#0053e2]"
                        )}
                      >
                        {/* Titlebar of Class Card */}
                        <div className={cn(
                          "xp-titlebar h-7 text-[11px]",
                          cls.isOngoing ? "bg-gradient-to-r from-[#e04343] to-[#9c1818]" : ""
                        )}>
                          <span>{cls.unitCode} - {cls.activityType}</span>
                          <span className="text-[9px] font-bold">
                            {cls.isOngoing ? "[ONGOING]" : "[UPCOMING]"}
                          </span>
                        </div>
                        
                        <div className="xp-panel p-3 space-y-3 flex-1 flex flex-col justify-between text-xs text-black">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                              <span className={cn(
                                "text-[9px] px-2 py-0.5 font-bold font-sans rounded-none select-none tracking-normal border-t-[1.5px] border-l-[1.5px] border-r border-b border-t-[#808080] border-l-[#808080] border-r-white border-b-white",
                                cls.unitLevel === 'Masters'
                                  ? "bg-[#ecd7fa] text-[#5c1c8a]"
                                  : "bg-[#d8f0da] text-[#1c6622]"
                              )}>
                                {cls.unitLevel}
                              </span>
                            </div>
                            <h3 className="font-bold text-zinc-800 line-clamp-1">
                              {cls.unitTitle}
                            </h3>
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              {cls.activityType} - Class {cls.classNumber} ({cls.weeksInfo})
                            </p>
                          </div>

                          <div className="bg-white border p-2 space-y-1 font-sans text-[10px] text-zinc-700">
                            <div className="flex justify-between">
                              <span className="font-bold">Time:</span>
                              <span>{cls.timeDisplay}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-bold">Location:</span>
                              <span>{cls.locationDisplay}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-bold">Staff:</span>
                              <span className="truncate max-w-[120px]">{cls.teachingStaff}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleExploreUnit(cls.unitCode)}
                            className="xp-button w-full text-[10px] py-1"
                          >
                            EXPLORE UNIT DETAILS
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 2. Control center panels */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 font-sans">
                
                {/* Major Visibility Window */}
                <div className="xl:col-span-2 flex flex-col bg-white border border-[#d8d2bd]">
                  <div className="bg-[#0053e2] text-white px-2 py-1 flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-white" /> Active Major Branches
                    </span>
                  </div>
                  <div className="p-4 flex-grow space-y-4">
                    <p className="text-[11px] text-zinc-600 font-sans">
                      Toggle major specializations to show or hide their corresponding study modules in the flow graph.
                    </p>

                    {currentCourse?.specializations?.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {isSingleDefaultSpec && subMajorsList.length > 0 ? (
                          subMajorsList.map((major: string) => {
                            const isVisible = selectedSubMajor === major;
                            const displayName = major.replace(' Major', '');
                            return (
                              <button
                                key={major}
                                onClick={() => setSelectedSubMajor(major)}
                                className={cn(
                                  'xp-button justify-between text-left text-xs w-full',
                                  isVisible && 'xp-button-active'
                                )}
                              >
                                <span className="truncate pr-2">{capitalize(displayName)}</span>
                                {isVisible ? (
                                  <Eye className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                )}
                              </button>
                            );
                          })
                        ) : (
                          currentCourse.specializations.map((sp: any) => {
                            const isVisible = visibleMajors.has(sp.specialization);
                            const displayName = sp.specialization.replace(/-/g, ' ').replace('master of', 'Pathway: Master of');
                            return (
                              <button
                                key={sp.specialization}
                                onClick={() => toggleMajorVisibility(sp.specialization)}
                                className={cn(
                                  'xp-button justify-between text-left text-xs w-full',
                                  isVisible && 'xp-button-active'
                                )}
                              >
                                <span className="truncate pr-2">{capitalize(displayName)}</span>
                                {isVisible ? (
                                  <Eye className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 italic">No majors available.</p>
                    )}

                    {/* Degree Overlays */}
                    <div className="mt-4 pt-4 border-t border-zinc-300">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5 font-sans">
                        <Network className="w-3.5 h-3.5 text-zinc-400" /> DEGREE OVERLAYS (GRAPH VIEW)
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                          onClick={() => {
                            setShowMinors(!showMinors);
                            setFocusedUnitCode(null);
                          }}
                          className={cn(
                            'xp-button justify-between text-left w-full',
                            showMinors && 'xp-button-active'
                          )}
                        >
                          <div className="flex flex-col min-w-0">
                            <span>Option Minors</span>
                            <span className="text-[9px] text-zinc-500 font-normal mt-0.5">Show minor study paths</span>
                          </div>
                          {showMinors ? (
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setShowQutYou(!showQutYou);
                            setFocusedUnitCode(null);
                          }}
                          className={cn(
                            'xp-button justify-between text-left w-full',
                            showQutYou && 'xp-button-active'
                          )}
                        >
                          <div className="flex flex-col min-w-0">
                            <span>QUT You Breadth</span>
                            <span className="text-[9px] text-zinc-500 font-normal mt-0.5">Show core breadths</span>
                          </div>
                          {showQutYou ? (
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setShowElectives(!showElectives);
                            setFocusedUnitCode(null);
                          }}
                          className={cn(
                            'xp-button justify-between text-left w-full',
                            showElectives && 'xp-button-active'
                          )}
                        >
                          <div className="flex flex-col min-w-0">
                            <span>Faculty Electives</span>
                            <span className="text-[9px] text-zinc-500 font-normal mt-0.5">Show general electives</span>
                          </div>
                          {showElectives ? (
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Study Progression Panel */}
                <div className="flex flex-col h-full bg-[#ece9d8] border border-[#d8d2bd]">
                  <div className="bg-[#0053e2] text-white px-2 py-1 flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-white" /> Study Progression
                    </span>
                  </div>
                  <div className="p-4 flex-grow space-y-4 font-sans text-xs text-black">
                    
                    {/* Progress Meter */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-zinc-850">
                        <span>COURSE COMPLETED</span>
                        <span className="text-[#2b7b09] font-mono font-bold">{stats.count} Units ({stats.completedCP} CP)</span>
                      </div>
                      
                      {/* Classic XP Green Block Progress Bar */}
                      <div className="w-full h-5 bg-white border-top-2 border-left-2 border-r-white border-b-white border-t-[#707070] border-l-[#707070] p-0.5 flex gap-0.5 overflow-hidden">
                        {Array.from({ length: 20 }).map((_, i) => {
                          const isActive = (i / 20) * 100 < stats.percentage;
                          return (
                            <div 
                              key={i}
                              className={cn(
                                "h-full w-3.5 transition-all duration-300",
                                isActive 
                                  ? "bg-gradient-to-b from-[#7cf032] via-[#4ebb1a] to-[#2b7b09] border border-[#3dae12] shadow-[inset_1px_1px_1px_rgba(255,255,255,0.4)]" 
                                  : "bg-transparent"
                              )}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[9px] text-zinc-500 font-bold">
                        <span>0%</span>
                        <span>{stats.percentage}% COMPLETE</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Commencing term select */}
                    <div className="space-y-2 pt-2 border-t border-zinc-300">
                      <label className="font-bold text-zinc-700 block">Commencing Term</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEntryTerm('feb')}
                          className={cn(
                            "flex-grow text-[10px] font-bold py-1.5 px-1",
                            entryTerm === 'feb' ? "xp-button-active" : "xp-button"
                          )}
                        >
                          Feb Entry
                        </button>
                        <button
                          onClick={() => setEntryTerm('july')}
                          className={cn(
                            "flex-grow text-[10px] font-bold py-1.5 px-1",
                            entryTerm === 'july' ? "xp-button-active" : "xp-button"
                          )}
                        >
                          July Entry
                        </button>
                      </div>
                    </div>

                    {/* Assessment Filters */}
                    <div className="space-y-3 pt-3 border-t border-zinc-300">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                        ASSESSMENT STYLE FILTERS
                      </span>

                      {/* Exam Filter */}
                      <div className="space-y-1">
                        <span className="text-[9px] text-zinc-500 font-bold block uppercase">Exam Requirement</span>
                        <div className="flex p-0.5 border bg-white w-full gap-1">
                          {['all', 'no-exam', 'exam-required'].map((val) => {
                            const active = examFilter === val;
                            const label = val === 'all' ? 'All' : val === 'no-exam' ? 'No Exam' : 'Has Exam';
                            return (
                              <button
                                key={val}
                                onClick={() => setExamFilter(val as any)}
                                className={cn(
                                  "flex-grow text-[9px] font-bold py-1 px-1",
                                  active ? "xp-button-active" : "xp-button"
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Task Count Filter */}
                      <div className="space-y-1">
                        <span className="text-[9px] text-zinc-500 font-bold block uppercase">Task count</span>
                        <div className="flex p-0.5 border bg-white w-full gap-1">
                          {['all', 'fewer', 'incremental'].map((val) => {
                            const active = countFilter === val;
                            const label = val === 'all' ? 'All' : val === 'fewer' ? 'Few (1-2)' : 'Many (3+)';
                            return (
                              <button
                                key={val}
                                onClick={() => setCountFilter(val as any)}
                                className={cn(
                                  "flex-grow text-[9px] font-bold py-1 px-1",
                                  active ? "xp-button-active" : "xp-button"
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Type Filter Checkbox Lists */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] text-zinc-500 font-bold block uppercase">Must include task type</span>
                        <div className="grid grid-cols-2 gap-1 bg-white border p-1.5">
                          {[
                            { id: 'assignment', label: 'Assignment' },
                            { id: 'quiz', label: 'Quiz/Test' },
                            { id: 'practical', label: 'Practical/Lab' },
                            { id: 'presentation', label: 'Presentation' },
                            { id: 'portfolio', label: 'Portfolio' },
                          ].map(t => {
                            const isActive = assessTypeFilter.has(t.id);
                            return (
                              <div
                                key={t.id}
                                onClick={() => {
                                  setAssessTypeFilter(prev => {
                                    const next = new Set(prev);
                                    if (next.has(t.id)) next.delete(t.id);
                                    else next.add(t.id);
                                    return next;
                                  });
                                }}
                                className="flex items-center gap-1.5 cursor-pointer hover:bg-zinc-100 p-0.5 text-[10px]"
                              >
                                <input
                                  type="checkbox"
                                  checked={isActive}
                                  readOnly
                                  className="cursor-pointer accent-[#0053e2]"
                                />
                                <span className="truncate">{t.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Search inside tasks */}
                      <div className="space-y-1">
                        <span className="text-[9px] text-zinc-500 font-bold block uppercase">Search task details</span>
                        <div className="relative">
                          <input
                            placeholder="e.g. group, essay..."
                            value={assessSearch}
                            onChange={(e) => setAssessSearch(e.target.value)}
                            className="xp-input w-full pr-6 h-7"
                          />
                          {assessSearch && (
                            <button
                              onClick={() => setAssessSearch('')}
                              className="absolute right-1.5 top-0.5 text-zinc-400 hover:text-foreground text-[11px] font-bold"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Custom Elective Option Selectors */}
              {optionStructures.length > 0 && (
                <div className="flex flex-col font-sans bg-[#ece9d8] border border-[#d8d2bd]">
                  <div className="bg-[#0053e2] text-white px-2 py-1 flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5">
                      Customize Elective Pathways & Minors
                    </span>
                  </div>
                  <div className="p-4 space-y-4 text-xs text-black">
                    <p className="text-[11px] text-zinc-600">
                      Configure your elective choices below. These selections automatically dynamically link prerequisite paths onto the study map.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {optionStructures.map((struct: any) => {
                        const selected = selectedOptions[struct.id] || '';
                        const options = struct.semesters.map((sem: any) => sem.name);
                        
                        const structTitle = struct.title
                          .replace('Options List', '')
                          .replace('Undergraduate University Wide', '')
                          .replace('Science, Information Technology and Mathematics', '');

                        return (
                          <div key={struct.id} className="flex flex-col gap-1 bg-white border p-2.5">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                              {structTitle}
                            </label>
                            <select
                              value={selected}
                              onChange={(e) => {
                                setSelectedOptions(prev => ({
                                  ...prev,
                                  [struct.id]: e.target.value
                                }));
                                setHoveredUnitCode(null);
                              }}
                              className="xp-select border w-full p-1 text-xs font-medium cursor-pointer"
                            >
                              <option value="">-- Choose Option --</option>
                              {options.map((opt: string) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Connection Guidelines */}
              <div className="flex items-center gap-3 p-3 bg-[#ffffe1] border border-[#e5c365] text-zinc-700 text-xs font-sans shadow-sm">
                <Info className="w-5 h-5 shrink-0 text-[#e5c365]" />
                <p>
                  <strong>INTERACTIVE EXPLORER TIP:</strong> Hovering a unit highlights its flow paths. 
                  <span className="text-[#0053e2] font-bold mx-1 font-sans">Blue</span> lines show prerequisites. 
                  <span className="text-emerald-700 font-bold mx-1 font-sans">Green</span> lines show subsequent classes unlocked by completing this unit. 
                  Click any unit and select "Mark Completed" to simulate your study progression!
                </p>
              </div>

              {/* 4. Display Panel: Obsidian Graph */}
              <div className="flex flex-col flex-grow bg-white border border-[#d8d2bd]">
                <div className="bg-[#0053e2] text-white px-2 py-1 flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-white" /> Obsidian Graph Network Flow
                  </span>
                </div>
                <div className="p-0 flex-grow bg-white border-t-2 border-l-2 border-t-[#707070] border-l-[#707070]">
                  <ObsidianGraph
                    units={unitsInLayout}
                    links={activeLinks}
                    onNodeClick={handleUnitClick}
                    hoveredUnitCode={hoveredUnitCode}
                    setHoveredUnitCode={setHoveredUnitCode}
                    getUnitCardType={getUnitCardType}
                    completedUnitCodes={completedUnits}
                    unlockedUnitCodes={unlockedUnitCodes}
                    unitToMajorsMap={unitToMajorsMap}
                    focusedUnitCode={focusedUnitCode}
                    setFocusedUnitCode={setFocusedUnitCode}
                    filteredOutUnitCodes={filteredOutUnitCodes}
                  />
                </div>
              </div>
            </>
          )}

        </div>

        {/* Details Side-Drawer */}
        <UnitDetailsDrawer
          unit={selectedUnit}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onJumpToUnit={handleJumpToUnit}
          allUnitsMap={allCourseUnitsMap}
          isCompleted={selectedUnit ? completedUnits.has(selectedUnit.code) : false}
          onToggleCompleted={toggleUnitCompleted}
          assessmentsData={assessmentsData}
        />
      </div>
  );
}
