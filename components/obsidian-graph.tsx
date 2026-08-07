import React, { useRef, useEffect, useState } from 'react';
import { UnitData } from './unit-card';
import { PrerequisiteRelation, getPrereqChainForSet, getUnlockChainForSet } from '@/lib/qut/dependencies';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Sliders, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ObsidianGraphProps {
  units: UnitData[];
  links: PrerequisiteRelation[];
  onNodeClick: (unit: UnitData) => void;
  hoveredUnitCode: string | null;
  setHoveredUnitCode: (code: string | null) => void;
  getUnitCardType: (code: string) => 'core' | 'major' | 'minor' | 'elective' | 'qutyou' | 'hub';
  completedUnitCodes: Set<string>;
  unlockedUnitCodes: Set<string>;
  unitToMajorsMap: Map<string, string[]>;
  focusedUnitCode?: string | null;
  setFocusedUnitCode?: (code: string | null) => void;
  filteredOutUnitCodes?: Set<string>;
}

interface NodeSimulation {
  id: string;
  unit: UnitData;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  type: 'core' | 'major' | 'minor' | 'elective' | 'qutyou' | 'hub';
  majors: string[];
  targetX: number;
  targetY: number;
  hoverProgress: number; // smooth transitions
}

export const ObsidianGraph: React.FC<ObsidianGraphProps> = ({
  units,
  links,
  onNodeClick,
  hoveredUnitCode,
  setHoveredUnitCode,
  getUnitCardType,
  completedUnitCodes,
  unlockedUnitCodes,
  unitToMajorsMap,
  focusedUnitCode = null,
  setFocusedUnitCode,
  filteredOutUnitCodes = new Set(),
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Simulation state stored in refs for 60fps canvas ticks
  const nodesRef = useRef<NodeSimulation[]>([]);
  const linksRef = useRef<PrerequisiteRelation[]>([]);
  const transformRef = useRef({ x: 0, y: 140, scale: 0.55 }); // zoomed out and shifted down to fit vertical tree on load
  const mouseRef = useRef({ x: 0, y: 0, isDown: false, draggedNode: null as NodeSimulation | null });
  const hoverRef = useRef<string | null>(null);
  const focusedRef = useRef<string | null>(null);
  const alphaRef = useRef(1.0); // D3 style cooling decay alpha

  // Sync focused unit code to ref for simulation ticks
  useEffect(() => {
    focusedRef.current = focusedUnitCode || null;
  }, [focusedUnitCode]);

  // Completed / Unlocked tracking refs
  const completedRef = useRef<Set<string>>(completedUnitCodes);
  const unlockedRef = useRef<Set<string>>(unlockedUnitCodes);

  // Dynamic slider physics parameters
  const [linkDistance, setLinkDistance] = useState(290); // default rest distance (spread out)
  const [chargeStrength, setChargeStrength] = useState(60); // repulsion strength (spread out)
  const [gravityStrength, setGravityStrength] = useState(5); // gravity strength (spread out)
  const [showConfig, setShowConfig] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(75);

  // Sync state to refs
  useEffect(() => {
    completedRef.current = completedUnitCodes;
  }, [completedUnitCodes]);

  useEffect(() => {
    unlockedRef.current = unlockedUnitCodes;
  }, [unlockedUnitCodes]);

  const filteredOutRef = useRef<Set<string>>(filteredOutUnitCodes);
  useEffect(() => {
    filteredOutRef.current = filteredOutUnitCodes;
  }, [filteredOutUnitCodes]);

  // Rounded rect canvas compatibility fallback helper
  const drawRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  };

  // Sub-abbreviations for hubs inside nodes
  const getHubAbbrev = (id: string): string => {
    const parts = id.split('-');
    const name = parts[parts.length - 1].toUpperCase();
    if (name.includes('QUTYOU')) return 'QUT';
    if (name.includes('COMPSC')) return 'CS';
    if (name.includes('CYBSEC')) return 'Sec';
    if (name.includes('SOFDEV')) return 'Dev';
    if (name.includes('ARTINT')) return 'AI';
    if (name.includes('DATSCI')) return 'DS';
    if (name.includes('ENTCOM')) return 'Ent';
    if (name.includes('PANAUT')) return 'Proc';
    if (name.includes('BAITMG')) return 'Mgt';
    if (name.includes('ELECTIVES')) return 'Elect';
    return name.slice(0, 4);
  };

  // Major color pallette (Curated Neon Cyberpunk Theme)
  const getMajorColor = (majors: string[], type: string, code?: string): string => {
    if (code?.startsWith('HUB-')) {
      if (code.includes('QUTYOU')) return '#f43f5e'; // neon pink
      if (code.includes('ELECTIVES') || code.includes('EL-')) return '#64748b'; // slate gray
      return '#06b6d4'; // bright cyan for minor hubs
    }
    if (type === 'qutyou') return '#f43f5e'; // neon pink
    if (type === 'core') return '#f8fafc'; // silver white for core trunk

    if (!majors || majors.length === 0) return '#64748b'; // slate gray for electives
    if (majors.length > 1) return '#94a3b8'; // shared majors slate

    const major = majors[0].toLowerCase();
    if (major.includes('computer science') || major.includes('software')) return '#c084fc'; // neon purple
    if (major.includes('cyber security')) return '#f97316'; // orange-red
    if (major.includes('artificial intelligence') || major.includes('robotics')) return '#06b6d4'; // cyber cyan
    if (major.includes('data science') || major.includes('mathematics')) return '#6366f1'; // indigo
    if (major.includes('business analysis') || major.includes('management') || major.includes('process analytics')) return '#10b981'; // emerald green
    if (major.includes('enterprise computing') || major.includes('engineering')) return '#3b82f6'; // high-tech blue
    
    return '#c084fc'; // default neon purple
  };

  // Initialize nodes and map target tree coordinates
  useEffect(() => {
    linksRef.current = links;

    const posMap = new Map<string, { x: number; y: number }>();
    nodesRef.current.forEach(node => {
      posMap.set(node.id, { x: node.x, y: node.y });
    });

    const canvas = canvasRef.current;
    const width = canvas ? canvas.width / (window.devicePixelRatio || 1) : 800;
    const height = canvas ? canvas.height / (window.devicePixelRatio || 1) : 600;

    // Collect all unique majors
    const uniqueMajorsSet = new Set<string>();
    units.forEach(u => {
      const m = unitToMajorsMap.get(u.code) || [];
      m.forEach(majorName => uniqueMajorsSet.add(majorName));
    });
    const uniqueMajors = Array.from(uniqueMajorsSet).sort();

    // Map each unique major name to a horizontal lane offset X
    const majorOffsets = new Map<string, number>();
    uniqueMajors.forEach((m, idx) => {
      const offset = (idx - (uniqueMajors.length - 1) / 2) * 190; // spread major branches horizontally
      majorOffsets.set(m, offset);
    });

    const slugify = (text: string) => {
      return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '');
    };

    nodesRef.current = units.map(u => {
      const pos = posMap.get(u.code);
      const type = getUnitCardType(u.code);
      const majors = unitToMajorsMap.get(u.code) || [];
      const color = getMajorColor(majors, type, u.code);

      const levelMatch = u.code.match(/[0-9]/);
      const level = levelMatch ? parseInt(levelMatch[0], 10) : 1;
      let radius = 23 + level * 2.0;
      
      if (u.code.startsWith('HUB-')) {
        radius = 38;
      }

      // 1. Determine resolved type
      const resolvedType = u.code.startsWith('HUB-') ? 'hub' : type;

      // 2. Target Y Column (Vertical flow progressing upwards from bottom)
      let targetY = height / 2;
      
      if (resolvedType === 'core') {
        // Cores Zone (Bottom)
        if (level === 1) targetY = height / 2 + 320;
        else if (level === 2) targetY = height / 2 + 180;
        else if (level === 3) targetY = height / 2 + 40;
        else targetY = height / 2 - 80;
      } else if (resolvedType === 'major') {
        // Majors Zone (Center-Top, above core zone)
        if (level === 1) targetY = height / 2 - 160;
        else if (level === 2) targetY = height / 2 - 300;
        else if (level === 3) targetY = height / 2 - 440;
        else targetY = height / 2 - 580;
      } else {
        // Hubs, Electives, Minors, QUTYou Zone (Far Top)
        if (u.code.startsWith('HUB-')) {
          if (u.code.includes('QUTYOU')) {
            targetY = height / 2 - 700;
          } else if (u.code.includes('MNR-')) {
            targetY = height / 2 - 820;
          } else {
            targetY = height / 2 - 940;
          }
        } else {
          if (level === 1) targetY = height / 2 - 700;
          else if (level === 2) targetY = height / 2 - 820;
          else targetY = height / 2 - 940;
        }
      }

      // 3. Target X Lane (Horizontal lanes separating study streams)
      let targetX = width / 2;
      const codeVal = u.code.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

      if (resolvedType === 'core') {
        // Cores aligned centrally with a slight horizontal spread
        const coreSpread = ((codeVal % 3) - 1) * 75; // spreads core units to 3 horizontal lanes: center, -75, +75
        targetX = width / 2 + coreSpread;
      } else if (resolvedType === 'major') {
        // Majors split horizontally into parallel vertical branches
        const mList = unitToMajorsMap.get(u.code) || [];
        let avgOffset = 0;
        if (mList.length > 0) {
          let totalOffset = 0;
          mList.forEach(m => {
            totalOffset += majorOffsets.get(m) || 0;
          });
          avgOffset = totalOffset / mList.length;
        }
        targetX = width / 2 + avgOffset;
      } else {
        // Hubs, Electives, Minors, QUTYou Zone (Top) X-spread
        if (resolvedType === 'qutyou' || u.code.includes('QUTYOU')) {
          targetX = width / 2 - 280; // offset left
        } else if (resolvedType === 'elective' || u.code.includes('ELECTIVES') || u.code.includes('EL-')) {
          targetX = width / 2 + 280; // offset right
        } else {
          // spread minor hubs and other option units horizontally
          targetX = width / 2 + ((codeVal % 5) - 2) * 110;
        }
      }

      return {
        id: u.code,
        unit: u,
        x: pos?.x ?? (targetX + (Math.random() - 0.5) * 80), // Spawn close to target coordinates
        y: pos?.y ?? (targetY + (Math.random() - 0.5) * 80),
        vx: 0,
        vy: 0,
        radius,
        color,
        type: resolvedType,
        majors,
        targetX,
        targetY,
        hoverProgress: 0, // start with 0 progress
      };
    });
  }, [units, links, getUnitCardType, unitToMajorsMap]);

  useEffect(() => {
    hoverRef.current = hoveredUnitCode;
  }, [hoveredUnitCode]);

  // Re-heat simulation when units or settings change
  useEffect(() => {
    alphaRef.current = 1.0;
  }, [linkDistance, chargeStrength, gravityStrength, units]);

  // Physics loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let particleOffset = 0;

    const tick = () => {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      const nodes = nodesRef.current;
      const activeLinks = linksRef.current;
      const hovered = hoverRef.current;
      const completed = completedRef.current;
      const unlocked = unlockedRef.current;
      const transform = transformRef.current;

      const highlightPrereqs = new Set<string>();
      const highlightUnlocks = new Set<string>();
      if (hovered) {
        getPrereqChainForSet(hovered, activeLinks).forEach(id => highlightPrereqs.add(id));
        getUnlockChainForSet(hovered, activeLinks).forEach(id => highlightUnlocks.add(id));
      }

      // Smooth hover progress updates for animations
      nodes.forEach(node => {
        const isHoveredNode = node.id === hovered;
        const isRelatedNode = highlightPrereqs.has(node.id) || highlightUnlocks.has(node.id);
        const targetHover = (isHoveredNode || isRelatedNode) ? 1.0 : 0.0;
        
        if (node.hoverProgress === undefined) {
          node.hoverProgress = 0;
        }
        node.hoverProgress += (targetHover - node.hoverProgress) * 0.14; // smooth ease LERP
      });

      // ==========================================
      // FORCE SIMULATION PIPELINE
      // ==========================================
      if (alphaRef.current > 0.005) {
        const alpha = alphaRef.current;

        // 1. Repulsion (charge) forces
        const repulsionRad = chargeStrength * 7.5; // localized radius to fit lanes
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            if (dist < repulsionRad) {
              const force = Math.min(2.0, (chargeStrength * 40) / (dist * dist + 400)) * alpha;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              if (n1 !== mouseRef.current.draggedNode) {
                n1.vx -= fx;
                n1.vy -= fy;
              }
              if (n2 !== mouseRef.current.draggedNode) {
                n2.vx += fx;
                n2.vy += fy;
              }
            }
          }
        }

        // 2. Spring forces (attract connected nodes)
        activeLinks.forEach(link => {
          const n1 = nodes.find(n => n.id === link.from);
          const n2 = nodes.find(n => n.id === link.to);

          if (n1 && n2) {
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const force = Math.max(-3.0, Math.min(3.0, (dist - linkDistance) * 0.009)) * alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (n1 !== mouseRef.current.draggedNode) {
              n1.vx += fx;
              n1.vy += fy;
            }
            if (n2 !== mouseRef.current.draggedNode) {
              n2.vx -= fx;
              n2.vy -= fy;
            }
          }
        });

        // 3. Gravity pulling toward target layout positions (Tree Flow alignment)
        nodes.forEach(node => {
          if (node === mouseRef.current.draggedNode) return;

          const gx = (node.targetX - node.x) * (gravityStrength * 0.0018);
          const gy = (node.targetY - node.y) * (gravityStrength * 0.0018);
          const gLimit = 2.5;
          node.vx += Math.max(-gLimit, Math.min(gLimit, gx)) * alpha;
          node.vy += Math.max(-gLimit, Math.min(gLimit, gy)) * alpha;
        });

        // 5. Overlap/Collision Solver (Zero Text/Label Overlaps)
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            // Spacing buffer: node sizes + spacing cushion
            const minDist = n1.radius + n2.radius + 45;
            if (dist < minDist) {
              const overlap = minDist - dist;
              const pushLimit = 1.5;
              const fx = (dx / dist) * Math.min(pushLimit, overlap * 0.12);
              const fy = (dy / dist) * Math.min(pushLimit, overlap * 0.12);

              if (n1 !== mouseRef.current.draggedNode) {
                n1.x -= fx;
                n1.y -= fy;
              }
              if (n2 !== mouseRef.current.draggedNode) {
                n2.x += fx;
                n2.y += fy;
              }
            }
          }
        }

        // Update positions with high friction damping & sleep thresholds
        nodes.forEach(node => {
          if (node === mouseRef.current.draggedNode) return;
          node.x += node.vx;
          node.y += node.vy;
          node.vx *= 0.62; // friction damping
          node.vy *= 0.62;

          // Sleep cutoff threshold
          if (Math.abs(node.vx) < 0.005) node.vx = 0;
          if (Math.abs(node.vy) < 0.005) node.vy = 0;
        });

        // Cool down the simulation
        alphaRef.current *= 0.975;
      } else {
        alphaRef.current = 0;
        // Make sure velocities are zeroed
        nodes.forEach(node => {
          node.vx = 0;
          node.vy = 0;
        });
      }

      // Dragged node updates
      const dragged = mouseRef.current.draggedNode;
      if (dragged) {
        dragged.x = (mouseRef.current.x - transform.x) / transform.scale;
        dragged.y = (mouseRef.current.y - transform.y) / transform.scale;
        dragged.vx = 0;
        dragged.vy = 0;
      }

      // ==========================================
      // CAMERA AUTOFOCUS
      // ==========================================
      const focusedCode = focusedRef.current;
      if (focusedCode) {
        const fNode = nodes.find(n => n.id === focusedCode);
        if (fNode) {
          const targetScale = 1.05;
          const targetX = w / 2 - fNode.x * targetScale;
          const targetY = h / 2 - fNode.y * targetScale;

          // Smooth lock transition (LERP)
          transform.scale += (targetScale - transform.scale) * 0.085;
          transform.x += (targetX - transform.x) * 0.085;
          transform.y += (targetY - transform.y) * 0.085;

          const newZoom = Math.round(transform.scale * 100);
          if (newZoom !== zoomLevel) {
            setZoomLevel(newZoom);
          }
        }
      }

      // ==========================================
      // CANVAS RENDERING PIPELINE
      // ==========================================
      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.scale, transform.scale);

      // Draw grid
      const gridSize = 100;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1;
      const startX = -transform.x / transform.scale - 200;
      const startY = -transform.y / transform.scale - 200;
      const endX = startX + w / transform.scale + 400;
      const endY = startY + h / transform.scale + 400;

      for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }
      for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }

      // 1. Draw connection links
      activeLinks.forEach(link => {
        const fromNode = nodes.find(n => n.id === link.from);
        const toNode = nodes.find(n => n.id === link.to);

        if (fromNode && toNode) {
          let isActive = false;
          let color = 'rgba(156, 163, 175, 0.12)';
          let strokeWidth = 1.0;

          if (hovered) {
            if (link.to === hovered && highlightPrereqs.has(link.from)) {
              isActive = true;
              color = 'rgba(59, 130, 246, 0.8)'; // blue trail
              strokeWidth = 2.5;
            } else if (link.from === hovered && highlightUnlocks.has(link.to)) {
              isActive = true;
              color = 'rgba(16, 185, 129, 0.8)'; // green trail
              strokeWidth = 2.5;
            } else if (highlightPrereqs.has(link.to) && highlightPrereqs.has(link.from)) {
              isActive = true;
              color = 'rgba(59, 130, 246, 0.45)';
              strokeWidth = 1.8;
            } else if (highlightUnlocks.has(link.from) && highlightUnlocks.has(link.to)) {
              isActive = true;
              color = 'rgba(16, 185, 129, 0.45)';
              strokeWidth = 1.8;
            }
          }

          ctx.beginPath();
          ctx.moveTo(fromNode.x, fromNode.y);
          ctx.lineTo(toNode.x, toNode.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = strokeWidth;
          ctx.stroke();

          // Flow particles
          if (isActive) {
            const dx = toNode.x - fromNode.x;
            const dy = toNode.y - fromNode.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            particleOffset = (particleOffset + 0.18) % 30;
            ctx.fillStyle = color.replace('0.8', '1').replace('0.45', '1');
            
            for (let d = particleOffset; d < len; d += 65) {
              const ratio = d / len;
              ctx.beginPath();
              ctx.arc(fromNode.x + dx * ratio, fromNode.y + dy * ratio, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      });

      // 2. Draw Nodes
      nodes.forEach(node => {
        const isHovered = node.id === hovered;
        const isRelated = highlightPrereqs.has(node.id) || highlightUnlocks.has(node.id);
        const isFilteredOut = filteredOutRef.current.has(node.id);
        const isDimmed = (hovered !== null && !isHovered && !isRelated) || isFilteredOut;
        
        const isCompleted = completed.has(node.id);
        const isUnlocked = unlocked.has(node.id);

        ctx.save();
        ctx.globalAlpha = isDimmed ? (isFilteredOut ? 0.08 : 0.16) : 1.0;

        // Pulse effect for unlocked nodes (ready to study)
        if (isUnlocked && !isCompleted && !isDimmed) {
          const pulse = (Math.sin(Date.now() / 150) + 1) * 0.5;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 5 + pulse * 3, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(245, 158, 11, ${0.3 + pulse * 0.45})`; // amber pulse
          ctx.lineWidth = 2 + pulse * 1.5;
          ctx.stroke();
        }

        // Glow ring aura (smoothly transition size & opacity based on hoverProgress)
        if (node.hoverProgress > 0.01) {
          ctx.beginPath();
          const auraRadius = node.radius + 3 + (node.hoverProgress * 7);
          ctx.arc(node.x, node.y, auraRadius, 0, Math.PI * 2);
          ctx.fillStyle = isCompleted ? '#10b981' : node.color;
          ctx.globalAlpha = node.hoverProgress * (isHovered ? 0.22 : 0.12);
          ctx.fill();
          ctx.globalAlpha = isDimmed ? 0.16 : 1.0; // restore alpha
        }

        // Inner node background (dark grey)
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = isCompleted ? 'rgba(16, 185, 129, 0.15)' : '#070b19';
        ctx.fill();

        // Node ring outline (smooth border thickness transition)
        const borderWidth = 2.0 + (node.hoverProgress * 1.8);
        if (node.type === 'hub') {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = node.color;
          ctx.lineWidth = borderWidth;
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = isCompleted ? '#10b981' : node.color;
          ctx.lineWidth = isCompleted && !isHovered ? 2.8 : borderWidth;
          ctx.stroke();
        }

        // Inner small core dot (omit for hub nodes to keep clean)
        if (node.type !== 'hub') {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * 0.32, 0, Math.PI * 2);
          ctx.fillStyle = isCompleted ? '#10b981' : node.color;
          ctx.fill();
        }

        // Draw inner text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Output text code with shadows
        ctx.shadowColor = '#030712';
        ctx.shadowBlur = 5;
        ctx.fillStyle = isCompleted ? '#10b981' : (isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.95)');

        const labelText = node.type === 'hub' ? getHubAbbrev(node.id) : node.id;
        ctx.font = `bold ${labelText.length > 5 ? '10px' : (labelText.length > 3 ? '12px' : '13.5px')} monospace`;
        
        if (node.type === 'hub') {
          ctx.fillText(labelText, node.x, node.y);
        } else if (isCompleted) {
          ctx.fillText(`✓ ${labelText}`, node.x, node.y);
        } else {
          ctx.fillText(labelText, node.x, node.y);
        }

        // Render Title with high contrast badge backdrops (pills) to prevent overlays
        if (transform.scale > 0.45 || isHovered || isRelated) {
          ctx.shadowBlur = 0; // disable shadow for clean text layout in boxes
          ctx.font = isHovered ? 'bold 11px sans-serif' : '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          let title = node.unit.title;
          const maxCharLen = isHovered ? 45 : 28;
          if (title.length > maxCharLen) {
            title = title.substring(0, maxCharLen - 2) + '...';
          }

          const textWidth = ctx.measureText(title).width;
          const paddingX = 8;
          const paddingY = 4;
          const rectW = textWidth + paddingX * 2;
          const rectH = 18;
          const rectX = node.x - rectW / 2;
          const rectY = node.y + node.radius + 6;

          // Draw backdrop capsule rounded pill
          ctx.beginPath();
          drawRoundRect(ctx, rectX, rectY, rectW, rectH, 6);
          ctx.fillStyle = 'rgba(7, 10, 22, 0.9)';
          ctx.fill();
          ctx.strokeStyle = isHovered ? node.color : 'rgba(255, 255, 255, 0.09)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Draw title text centered inside pill
          ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.82)';
          ctx.fillText(title, node.x, rectY + paddingY);
        }

        ctx.restore();
      });

      ctx.restore();
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [linkDistance, chargeStrength, gravityStrength]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpi = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpi;
      canvas.height = rect.height * dpi;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpi, dpi);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [units]);

  // Interaction handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    mouseRef.current.x = mouseX;
    mouseRef.current.y = mouseY;
    mouseRef.current.isDown = true;

    const transform = transformRef.current;
    const worldX = (mouseX - transform.x) / transform.scale;
    const worldY = (mouseY - transform.y) / transform.scale;

    let clickedNode: NodeSimulation | null = null;
    for (const node of nodesRef.current) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= node.radius + 6) {
        clickedNode = node;
        break;
      }
    }

    if (clickedNode) {
      mouseRef.current.draggedNode = clickedNode;
      setHoveredUnitCode(clickedNode.id);
      alphaRef.current = 0.6; // re-heat simulation
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const transform = transformRef.current;
    const worldX = (mouseX - transform.x) / transform.scale;
    const worldY = (mouseY - transform.y) / transform.scale;

    if (mouseRef.current.isDown && mouseRef.current.draggedNode) {
      mouseRef.current.x = mouseX;
      mouseRef.current.y = mouseY;
      alphaRef.current = 0.4; // keep simulation warm during dragging
      return;
    }

    if (mouseRef.current.isDown) {
      const dx = mouseX - mouseRef.current.x;
      const dy = mouseY - mouseRef.current.y;

      transformRef.current = {
        ...transform,
        x: transform.x + dx,
        y: transform.y + dy,
      };

      mouseRef.current.x = mouseX;
      mouseRef.current.y = mouseY;

      // Unlock focused camera lock on manual pan drag
      if (setFocusedUnitCode) {
        setFocusedUnitCode(null);
      }
      return;
    }

    let hoverNode: NodeSimulation | null = null;
    for (const node of nodesRef.current) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= node.radius + 6) {
        hoverNode = node;
        break;
      }
    }

    if (hoverNode) {
      if (hoverRef.current !== hoverNode.id) {
        setHoveredUnitCode(hoverNode.id);
        canvas.style.cursor = 'grab';
      }
    } else {
      if (hoverRef.current !== null) {
        setHoveredUnitCode(null);
        canvas.style.cursor = 'default';
      }
    }

    mouseRef.current.x = mouseX;
    mouseRef.current.y = mouseY;
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = hoverRef.current ? 'grab' : 'default';

    const dragged = mouseRef.current.draggedNode;
    if (dragged && mouseRef.current.isDown) {
      onNodeClick(dragged.unit);
    }

    mouseRef.current.isDown = false;
    mouseRef.current.draggedNode = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const transform = transformRef.current;
    const zoomFactor = 1.08;
    const newScale = e.deltaY < 0 
      ? Math.min(transform.scale * zoomFactor, 3.5)
      : Math.max(transform.scale / zoomFactor, 0.2);

    const worldX = (mouseX - transform.x) / transform.scale;
    const worldY = (mouseY - transform.y) / transform.scale;

    transformRef.current = {
      scale: newScale,
      x: mouseX - worldX * newScale,
      y: mouseY - worldY * newScale,
    };

    setZoomLevel(Math.round(newScale * 100));

    // Release camera lock on mouse wheel zoom
    if (setFocusedUnitCode) {
      setFocusedUnitCode(null);
    }
  };

  const triggerZoom = (direction: 'in' | 'out') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const transform = transformRef.current;
    const zoomFactor = direction === 'in' ? 1.25 : 0.8;
    const newScale = Math.max(0.2, Math.min(transform.scale * zoomFactor, 3.5));

    const centerX = canvas.width / (2 * (window.devicePixelRatio || 1));
    const centerY = canvas.height / (2 * (window.devicePixelRatio || 1));

    const worldX = (centerX - transform.x) / transform.scale;
    const worldY = (centerY - transform.y) / transform.scale;

    transformRef.current = {
      scale: newScale,
      x: centerX - worldX * newScale,
      y: centerY - worldY * newScale,
    };

    setZoomLevel(Math.round(newScale * 100));

    // Release camera lock on manual scale buttons click
    if (setFocusedUnitCode) {
      setFocusedUnitCode(null);
    }
  };

  const centerGraph = () => {
    // Release camera lock on fit view click
    if (setFocusedUnitCode) {
      setFocusedUnitCode(null);
    }
    const canvas = canvasRef.current;
    if (!canvas || nodesRef.current.length === 0) return;

    const nodes = nodesRef.current;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    });

    const graphW = maxX - minX || 100;
    const graphH = maxY - minY || 100;
    const graphCX = minX + graphW / 2;
    const graphCY = minY + graphH / 2;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    const padding = 100;
    const scaleX = (width - padding) / graphW;
    const scaleY = (height - padding) / graphH;
    const fitScale = Math.max(0.2, Math.min(scaleX, scaleY, 0.95));

    transformRef.current = {
      scale: fitScale,
      x: width / 2 - graphCX * fitScale,
      y: height / 2 - graphCY * fitScale,
    };

    setZoomLevel(Math.round(fitScale * 100));
  };

  const resetView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    transformRef.current = {
      x: 0,
      y: 0,
      scale: 0.75,
    };
    setZoomLevel(75);

    // Release camera lock on reset click
    if (setFocusedUnitCode) {
      setFocusedUnitCode(null);
    }
  };

  return (
    <div className="relative w-full h-[640px] bg-slate-950 rounded-2xl overflow-hidden border border-border/15 flex flex-col justify-end">
      
      {/* Canvas */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="absolute inset-0 block select-none bg-[#02050f]"
        />
      </div>

      {/* Slide config triggers */}
      <div className="absolute right-4 top-4 flex flex-col gap-2 z-20">
        <button
          onClick={() => setShowConfig(!showConfig)}
          title="Adjust Physics Forces"
          className={cn(
            "p-2.5 rounded-xl border backdrop-blur-md transition-all duration-300",
            showConfig 
              ? "bg-primary text-white border-primary" 
              : "bg-card/75 text-muted-foreground hover:text-foreground border-border/30 hover:bg-muted/80"
          )}
        >
          <Sliders className="w-4.5 h-4.5" />
        </button>

        {showConfig && (
          <div className="p-4 rounded-2xl bg-card/90 border border-border/30 backdrop-blur-xl w-60 space-y-4 shadow-2xl animate-in fade-in slide-in-from-top-3 duration-200">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <Settings className="w-3.5 h-3.5 text-primary" /> Forces Parameters
            </h4>

            {/* Repulsion charge */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                <span>Repulsion (Charge)</span>
                <span>{chargeStrength}</span>
              </div>
              <input
                type="range"
                min="20"
                max="120"
                value={chargeStrength}
                onChange={(e) => setChargeStrength(parseInt(e.target.value, 10))}
                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Link distance */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                <span>Link rest length</span>
                <span>{linkDistance}px</span>
              </div>
              <input
                type="range"
                min="150"
                max="450"
                value={linkDistance}
                onChange={(e) => setLinkDistance(parseInt(e.target.value, 10))}
                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Gravity */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                <span>Center Gravity</span>
                <span>{gravityStrength}</span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                value={gravityStrength}
                onChange={(e) => setGravityStrength(parseInt(e.target.value, 10))}
                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* Canvas Nav Controls */}
      <div className="absolute left-4 bottom-4 flex items-center gap-1.5 p-1 rounded-xl bg-card/65 backdrop-blur-md border border-border/30 z-20">
        <button
          onClick={() => triggerZoom('in')}
          title="Zoom In"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => triggerZoom('out')}
          title="Zoom Out"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={centerGraph}
          title="Fit to Screen"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={resetView}
          title="Reset Zoom"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors border-l border-border/20 pl-2.5"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <span className="text-[10px] font-mono font-bold text-muted-foreground px-2 pr-3">
          {zoomLevel}%
        </span>
      </div>

      {/* Floating Instructions Legend */}
      <div className="absolute right-4 bottom-4 p-4 max-w-[210px] text-[10px] text-muted-foreground/80 leading-normal bg-card/45 border border-border/20 rounded-xl backdrop-blur-md pointer-events-none select-none z-20">
        <p className="font-bold text-foreground mb-1">🕸️ Graph Navigation:</p>
        <ul className="list-disc pl-3 space-y-0.5 mb-2">
          <li>Drag nodes to rearrange pathway</li>
          <li>Scroll mouse wheel to Zoom</li>
          <li>Click node to view specification</li>
        </ul>
        <p className="font-bold text-foreground mb-1 pt-1.5 border-t border-border/20">🟢 Node Legend:</p>
        <ul className="space-y-0.5">
          <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white border border-white" /> Core units</li>
          <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400" /> Major branches</li>
          <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-400 border border-dashed border-cyan-400" /> Option Hubs</li>
          <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 border border-emerald-500" /> Completed (✓)</li>
          <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 border border-dashed border-amber-500" /> Unlocked (pulsing)</li>
        </ul>
      </div>
    </div>
  );
};
