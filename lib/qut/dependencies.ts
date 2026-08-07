export interface PrerequisiteRelation {
  from: string;
  to: string;
  type: 'prereq' | 'coreq' | 'recommended';
}

// Hardcoded prerequisite mapping for key courses
export const HARDCODED_PREREQUISITES: PrerequisiteRelation[] = [
  // ==========================================
  // IT & Computer Science (IN01 / IN05)
  // ==========================================
  // Programming flow
  { from: 'IFB104', to: 'CAB201', type: 'prereq' },
  { from: 'IFB104', to: 'CAB230', type: 'prereq' },
  { from: 'IFB104', to: 'CAB210', type: 'prereq' },
  { from: 'IFB104', to: 'IAB251', type: 'prereq' },

  // Object-Oriented flow
  { from: 'CAB201', to: 'CAB302', type: 'prereq' },
  { from: 'CAB201', to: 'CAB301', type: 'prereq' },
  { from: 'CAB201', to: 'CAB403', type: 'prereq' },
  { from: 'CAB201', to: 'CAB330', type: 'prereq' },
  { from: 'CAB201', to: 'CAB420', type: 'prereq' },

  // Systems & Networks flow
  { from: 'IFB102', to: 'CAB222', type: 'prereq' },
  { from: 'IFB104', to: 'CAB222', type: 'recommended' },
  { from: 'CAB222', to: 'CAB340', type: 'prereq' },
  { from: 'CAB222', to: 'CAB444', type: 'prereq' },
  { from: 'IFB102', to: 'CAB443', type: 'prereq' },

  // Database & Analytics flow
  { from: 'IFB105', to: 'IAB305', type: 'prereq' },
  { from: 'IFB105', to: 'DSB200', type: 'prereq' },
  { from: 'IFB105', to: 'IAB207', type: 'prereq' },
  { from: 'DSB100', to: 'DSB200', type: 'prereq' },
  { from: 'MXB107', to: 'DSB200', type: 'prereq' },

  // Systems Design & Process Analytics
  { from: 'IFB103', to: 'IAB203', type: 'prereq' },
  { from: 'IAB203', to: 'IAB320', type: 'prereq' },
  { from: 'IAB201', to: 'IAB321', type: 'prereq' },
  
  // Capstone flow
  { from: 'IFB398', to: 'IFB399', type: 'prereq' },

  // Interaction Design / Human Centred Computing
  { from: 'CAB210', to: 'CAB310', type: 'prereq' },
  { from: 'CAB230', to: 'CAB310', type: 'recommended' },

  // ==========================================
  // Engineering (EN01)
  // ==========================================
  // Core Engineering Math & Physics flow
  { from: 'MZB125', to: 'MXB161', type: 'prereq' },
  { from: 'EGB101', to: 'EGB211', type: 'prereq' }, // Mechanics -> Structural
  { from: 'EGB101', to: 'EGB212', type: 'prereq' }, // Mechanics -> Materials
  { from: 'EGB102', to: 'EGB271', type: 'prereq' }, // Physics -> Electromagnetics
  { from: 'EGB103', to: 'EGB220', type: 'prereq' }, // Systems -> Electronics
  
  // Engineering Capstone / Project flow
  { from: 'EGB391', to: 'EGB392', type: 'prereq' }, // Design 1 -> Design 2
  { from: 'EGB401', to: 'EGB402', type: 'prereq' }, // Project 1 -> Project 2
  
  // Electrical/Aerospace
  { from: 'EGB220', to: 'EGB320', type: 'prereq' },
  { from: 'EGB271', to: 'EGB371', type: 'prereq' },

  // ==========================================
  // Science (ST01)
  // ==========================================
  // Chemistry
  { from: 'CYB101', to: 'CYB201', type: 'prereq' },
  { from: 'CYB102', to: 'CYB202', type: 'prereq' },
  { from: 'CYB201', to: 'CYB301', type: 'prereq' },
  { from: 'CYB202', to: 'CYB302', type: 'prereq' },
  
  // Physics
  { from: 'PVB101', to: 'PVB201', type: 'prereq' },
  { from: 'PVB102', to: 'PVB202', type: 'prereq' },
  { from: 'PVB201', to: 'PVB301', type: 'prereq' }
];

// Helper to extract prefix and numeric level from a unit code
function parseUnitCode(code: string): { prefix: string; level: number } | null {
  const match = code.match(/^([A-Z]{2,4})([0-9])([0-9]{2})$/);
  if (!match) return null;
  return {
    prefix: match[1],
    level: parseInt(match[2], 10)
  };
}

/**
 * Dynamically resolves all links (prerequisites and unlocks) for a set of active units.
 * Combines hardcoded prerequisite tables with a prefix-level heuristic for unmapped units.
 */
export function generateUnitFlows(unitCodes: string[]): PrerequisiteRelation[] {
  const links: PrerequisiteRelation[] = [];
  const renderedSet = new Set(unitCodes);

  // 1. Add all relevant hardcoded relationships
  HARDCODED_PREREQUISITES.forEach(rel => {
    if (renderedSet.has(rel.from) && renderedSet.has(rel.to)) {
      links.push(rel);
    }
  });

  // Keep track of what we already linked so we don't duplicate
  const linkedPairs = new Set(links.map(l => `${l.from}-${l.to}`));

  // 2. Apply prefix heuristics to unlinked nodes
  // Parse all codes
  const parsedUnits = unitCodes
    .map(code => ({ code, parsed: parseUnitCode(code) }))
    .filter(u => u.parsed !== null) as Array<{ code: string; parsed: { prefix: string; level: number } }>;

  // Group units by prefix
  const groups = new Map<string, typeof parsedUnits>();
  parsedUnits.forEach(u => {
    const list = groups.get(u.parsed.prefix) || [];
    list.push(u);
    groups.set(u.parsed.prefix, list);
  });

  // For each group, create links from lower levels to higher levels
  groups.forEach((list, prefix) => {
    // Sort units in ascending order of level
    list.sort((a, b) => a.parsed.level - b.parsed.level);

    // Group by level
    const levelMap = new Map<number, string[]>();
    list.forEach(u => {
      const codes = levelMap.get(u.parsed.level) || [];
      codes.push(u.code);
      levelMap.set(u.parsed.level, codes);
    });

    const levels = Array.from(levelMap.keys()).sort((a, b) => a - b);

    // Connect level N to level N+1
    for (let i = 0; i < levels.length - 1; i++) {
      const currentLevel = levels[i];
      const nextLevel = levels[i + 1];

      const currentUnits = levelMap.get(currentLevel) || [];
      const nextUnits = levelMap.get(nextLevel) || [];

      nextUnits.forEach(nextCode => {
        // Find if this unit already has a hardcoded prerequisite in this prefix
        const hasExistingLink = links.some(l => l.to === nextCode && parseUnitCode(l.from)?.prefix === prefix);

        if (!hasExistingLink) {
          // Fallback: Link to the first unit of the previous level (simplifies layout links)
          const sourceCode = currentUnits[0];
          const pairKey = `${sourceCode}-${nextCode}`;

          if (sourceCode && sourceCode !== nextCode && !linkedPairs.has(pairKey)) {
            links.push({
              from: sourceCode,
              to: nextCode,
              type: 'prereq'
            });
            linkedPairs.add(pairKey);
          }
        }
      });
    }
  });

  return links;
}

// Trace entire prerequisite chain using resolved links
export function getPrereqChainForSet(unitCode: string, resolvedLinks: PrerequisiteRelation[], visited = new Set<string>()): string[] {
  if (visited.has(unitCode)) return [];
  visited.add(unitCode);

  const direct = resolvedLinks.filter(l => l.to === unitCode).map(l => l.from);
  const chain = [...direct];

  for (const pre of direct) {
    chain.push(...getPrereqChainForSet(pre, resolvedLinks, visited));
  }

  return Array.from(new Set(chain));
}

// Trace entire unlocking chain using resolved links
export function getUnlockChainForSet(unitCode: string, resolvedLinks: PrerequisiteRelation[], visited = new Set<string>()): string[] {
  if (visited.has(unitCode)) return [];
  visited.add(unitCode);

  const direct = resolvedLinks.filter(l => l.from === unitCode).map(l => l.to);
  const chain = [...direct];

  for (const post of direct) {
    chain.push(...getUnlockChainForSet(post, resolvedLinks, visited));
  }

  return Array.from(new Set(chain));
}

// Helpers for individual node details
export function getPrerequisites(unitCode: string): string[] {
  return HARDCODED_PREREQUISITES.filter(rel => rel.to === unitCode).map(rel => rel.from);
}

export function getUnlocks(unitCode: string): string[] {
  return HARDCODED_PREREQUISITES.filter(rel => rel.from === unitCode).map(rel => rel.to);
}
