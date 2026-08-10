"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { UnitSearch } from "@/components/unit-search"
import { TimetableMaker } from "@/components/timetable-maker"
import VisualizerDashboard from "@/components/visualizer-dashboard"
import { 
  Calendar, 
  Network, 
  Search, 
  FileText, 
  Layers, 
  Clock, 
  Folder, 
  ChevronRight, 
  Power, 
  RotateCcw,
  Sparkles,
  HelpCircle,
  FolderSearch,
  BookOpen,
  Compass
} from "lucide-react"
import { cn } from "@/lib/utils"

export function HomePage({ allCoursesData = [], assessmentsData = {} }: { allCoursesData?: any[], assessmentsData?: any }) {
  const searchParams = useSearchParams()
  const [openWindows, setOpenWindows] = useState<Record<string, boolean>>({
    readme: true,
    search: false,
    timetable: false,
    visualizer: false,
    explorer: false,
  })
  
  const [minimizedWindows, setMinimizedWindows] = useState<Record<string, boolean>>({
    readme: false,
    search: false,
    timetable: false,
    visualizer: false,
    explorer: false,
  })

  const [maximizedWindows, setMaximizedWindows] = useState<Record<string, boolean>>({
    readme: false,
    search: false,
    timetable: false,
    visualizer: false,
    explorer: false,
  })

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({
    readme: { x: 120, y: 120 },
    search: { x: 50, y: 50 },
    timetable: { x: 90, y: 80 },
    visualizer: { x: 30, y: 30 },
    explorer: { x: 70, y: 100 },
  })

  const [activeWindow, setActiveWindow] = useState<string>("readme")
  const [selectedShortcut, setSelectedShortcut] = useState<string | null>(null)
  const [startMenuOpen, setStartMenuOpen] = useState(false)
  const [showShutdownDialog, setShowShutdownDialog] = useState(false)
  const [isShutDown, setIsShutDown] = useState(false)
  
  // Dragging states
  const [draggedWindow, setDraggedWindow] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  
  // Real-time clock state
  const [currentTime, setCurrentTime] = useState("")

  const [isMobile, setIsMobile] = useState(false)

  // Watch URL params to trigger window launch
  useEffect(() => {
    const win = searchParams.get("win")
    const tab = searchParams.get("tab")

    if (win) {
      openWindow(win)
    } else if (tab) {
      openWindow(tab)
    }
  }, [searchParams])

  // Track viewport sizing
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Clock ticks
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      let hours = now.getHours()
      const minutes = now.getMinutes()
      const ampm = hours >= 12 ? "PM" : "AM"
      hours = hours % 12
      hours = hours ? hours : 12 // the hour '0' should be '12'
      const minutesStr = minutes < 10 ? "0" + minutes : minutes
      setCurrentTime(`${hours}:${minutesStr} ${ampm}`)
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Window manager helpers
  const openWindow = (win: string) => {
    const validWindows = ["readme", "search", "timetable", "visualizer", "explorer"]
    if (!validWindows.includes(win)) return
    setOpenWindows(prev => ({ ...prev, [win]: true }))
    setMinimizedWindows(prev => ({ ...prev, [win]: false }))
    setActiveWindow(win)
    setStartMenuOpen(false)
  }

  const closeWindow = (win: string) => {
    setOpenWindows(prev => ({ ...prev, [win]: false }))
  }

  const minimizeWindow = (win: string) => {
    setMinimizedWindows(prev => ({ ...prev, [win]: true }))
  }

  const toggleMaximizeWindow = (win: string) => {
    setMaximizedWindows(prev => ({ ...prev, [win]: !prev[win] }))
  }

  const focusWindow = (win: string) => {
    setActiveWindow(win)
  }

  // Draggable Titlebar Mousedown handler
  const handleMouseDown = (win: string, e: React.MouseEvent) => {
    focusWindow(win)
    
    // Bypass drag on control buttons
    const target = e.target as HTMLElement
    if (target.closest(".xp-btn-close") || target.closest(".xp-btn-action")) return

    setDraggedWindow(win)
    setDragOffset({
      x: e.clientX - (positions[win]?.x ?? 50),
      y: e.clientY - (positions[win]?.y ?? 50)
    })
  }

  // Handle dragging movements
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggedWindow && !maximizedWindows[draggedWindow] && !isMobile) {
        setPositions(prev => ({
          ...prev,
          [draggedWindow]: {
            x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.x)),
            y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.y))
          }
        }))
      }
    }

    const handleMouseUp = () => {
      setDraggedWindow(null)
    }

    if (draggedWindow) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [draggedWindow, dragOffset, maximizedWindows, isMobile])

  // Reset system / Restart
  const handleRestart = () => {
    setOpenWindows({
      readme: true,
      search: false,
      timetable: false,
      visualizer: false,
      explorer: false,
    })
    setMinimizedWindows({
      readme: false,
      search: false,
      timetable: false,
      visualizer: false,
      explorer: false,
    })
    setMaximizedWindows({
      readme: false,
      search: false,
      timetable: false,
      visualizer: false,
      explorer: false,
    })
    setPositions({
      readme: { x: 120, y: 120 },
      search: { x: 50, y: 50 },
      timetable: { x: 90, y: 80 },
      visualizer: { x: 30, y: 30 },
      explorer: { x: 70, y: 100 },
    })
    setActiveWindow("readme")
    setStartMenuOpen(false)
    setShowShutdownDialog(false)
  }

  // Shortcuts config
  const shortcuts = [
    { id: "search", label: "Unit Search", icon: <Search className="w-8 h-8 text-blue-100" /> },
    { id: "timetable", label: "Timetable Creator", icon: <Calendar className="w-8 h-8 text-red-200" /> },
    { id: "visualizer", label: "Course Visualizer", icon: <Network className="w-8 h-8 text-green-200" /> },
    { id: "explorer", label: "Campus Explorer", icon: <Compass className="w-8 h-8 text-cyan-250" /> },
    { id: "readme", label: "README.txt", icon: <FileText className="w-8 h-8 text-zinc-200" /> },
  ]

  // Render Shutdown screen
  if (isShutDown) {
    return (
      <div 
        className="fixed inset-0 bg-black flex flex-col items-center justify-center text-[#ff9900] font-mono text-center select-none cursor-pointer"
        onClick={() => {
          setIsShutDown(false)
          handleRestart()
        }}
      >
        <div className="space-y-4">
          <p className="text-xl">It is now safe to turn off your computer.</p>
          <p className="text-xs text-zinc-500 animate-pulse">Click anywhere to boot system back up</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "xp-desktop fixed inset-0 overflow-hidden select-none flex flex-col justify-between font-sans",
      showShutdownDialog && "grayscale"
    )}>
      
      {/* 1. Desktop Shortcuts Workspace */}
      <div 
        className="flex-grow p-4 relative flex flex-col items-start gap-4 content-start"
        onClick={() => setSelectedShortcut(null)}
      >
        {shortcuts.map(s => {
          const isSelected = selectedShortcut === s.id
          return (
            <div
              key={s.id}
              onClick={(e) => {
                e.stopPropagation()
                setSelectedShortcut(s.id)
                openWindow(s.id) // Single click selects and immediately opens window
              }}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded w-20 text-center cursor-pointer border border-transparent select-none",
                isSelected ? "bg-[#316ac5]/40 border-[#316ac5]" : "hover:bg-white/10"
              )}
            >
              <div className="drop-shadow-md mb-1">{s.icon}</div>
              <span className="text-[10px] text-white font-bold leading-tight font-sans drop-shadow-[1px_1px_1px_rgba(0,0,0,0.8)] text-shadow-sm line-clamp-2">
                {s.label}
              </span>
            </div>
          )
        })}

        {/* 2. Floating Application Windows */}
        {Object.keys(openWindows).map((win) => {
          const isOpen = openWindows[win]
          const isMinimized = minimizedWindows[win]
          const isMax = maximizedWindows[win] || isMobile
          const isActive = activeWindow === win

          if (!isOpen) return null

          const winStyle = isMax
            ? {
                position: "absolute" as const,
                top: 0,
                left: 0,
                width: "100%",
                height: "calc(100vh - 30px)", // taskbar offset
                zIndex: isActive ? 40 : 10,
              }
            : {
                position: "absolute" as const,
                left: `${positions[win]?.x ?? 50}px`,
                top: `${positions[win]?.y ?? 50}px`,
                width: win === "visualizer" || win === "timetable" || win === "explorer" ? "950px" : "650px",
                maxWidth: "92vw",
                zIndex: isActive ? 40 : 10,
              }

          return (
            <div
              key={win}
              style={winStyle}
              onClick={() => focusWindow(win)}
              className={cn(
                "xp-window flex flex-col shadow-2xl transition-all duration-75",
                isMinimized && "hidden"
              )}
            >
              {/* Window Titlebar */}
              <div
                className={cn(
                  "xp-titlebar cursor-move select-none",
                  !isActive && "opacity-75 bg-gradient-to-r from-[#5a7edb] to-[#7fa2ec]"
                )}
                onMouseDown={(e) => handleMouseDown(win, e)}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold font-sans">
                  {win === "search" && <Search className="w-3.5 h-3.5" />}
                  {win === "timetable" && <Calendar className="w-3.5 h-3.5" />}
                  {win === "visualizer" && <Network className="w-3.5 h-3.5" />}
                  {win === "explorer" && <Compass className="w-3.5 h-3.5" />}
                  {win === "readme" && <FileText className="w-3.5 h-3.5" />}
                  {win === "search" && "Unit Search"}
                  {win === "timetable" && "Timetable Creator"}
                  {win === "visualizer" && "Course Visualizer"}
                  {win === "explorer" && "Campus Explorer"}
                  {win === "readme" && "README.txt - Notepad"}
                </span>
                
                {/* Window Actions */}
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      minimizeWindow(win)
                    }}
                    className="xp-btn-action"
                  >
                    _
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleMaximizeWindow(win)
                    }}
                    className="xp-btn-action"
                  >
                    {isMax ? "❐" : "□"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeWindow(win)
                    }}
                    className="xp-btn-close"
                  >
                    X
                  </button>
                </div>
              </div>

              {/* Window Menu Bar */}
              <div className="xp-menubar">
                <span className="xp-menu-item">File</span>
                <span className="xp-menu-item">Edit</span>
                <span className="xp-menu-item">Search</span>
                <span className="xp-menu-item">Help</span>
              </div>

              {/* Window Main Component Content Area */}
              <div className="flex-grow overflow-auto bg-[#ece9d8] p-4 font-sans text-black select-text max-h-[calc(100vh-100px)]">
                {win === "search" && <UnitSearch />}
                {win === "timetable" && <TimetableMaker />}
                {win === "visualizer" && <VisualizerDashboard allCoursesData={allCoursesData} assessmentsData={assessmentsData} forcedViewMode="graph" />}
                {win === "explorer" && <VisualizerDashboard allCoursesData={allCoursesData} assessmentsData={assessmentsData} forcedViewMode="explorer" />}
                {win === "readme" && (
                  <textarea
                    readOnly
                    className="w-full h-full min-h-[300px] p-2 font-mono text-xs border-0 focus:ring-0 resize-none bg-white text-black focus:outline-none"
                    value={`QUT Classmate v2.0\n------------------\nWelcome to QUT Classmate, the retro-themed student timetable planner.\n\nHow to use:\n1. Click any desktop shortcut to open the application window.\n2. Build your weekly schedules in "Timetable Creator".\n3. Map out your degree prerequisite flow in "Course Visualizer".\n4. Discover classes on campus right now in "Campus Explorer".\n\nSystem Requirements:\n- A browser made in the last 20 years.\n- A strong coffee to survive allocating classes at 9am.\n\n(C) 2001-2026 QUT Classmate Project. All rights reserved.`}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 3. XP Taskbar (bottom) */}
      <div className="h-[30px] bg-gradient-to-b from-[#245edb] via-[#357aec] to-[#245edb] border-t border-[#1d429a] flex items-center justify-between px-0.5 select-none relative z-50">
        
        {/* Start Button & Active Tasks */}
        <div className="flex items-center gap-1.5 h-full flex-grow mr-2 max-w-[calc(100%-100px)]">
          {/* Start Button */}
          <button
            onClick={() => setStartMenuOpen(!startMenuOpen)}
            className="xp-start-btn h-full"
          >
            start
          </button>

          {/* Opened Task Buttons */}
          <div className="flex items-center gap-1 h-full overflow-x-auto no-scrollbar py-0.5">
            {Object.keys(openWindows).map((win) => {
              const isOpen = openWindows[win]
              if (!isOpen) return null

              const isActive = activeWindow === win && !minimizedWindows[win]
              const label = win === "search" ? "Unit Search" : 
                            win === "timetable" ? "Timetable Creator" : 
                            win === "visualizer" ? "Course Visualizer" : 
                            win === "explorer" ? "Campus Explorer" : "README.txt"

              return (
                <button
                  key={win}
                  onClick={() => {
                    if (isActive) {
                      minimizeWindow(win)
                    } else {
                      openWindow(win)
                    }
                  }}
                  className={cn(
                    "h-full px-2 text-[10px] font-sans text-white border border-[#1a3c1a] rounded flex items-center gap-1 min-w-[90px] max-w-[130px] truncate cursor-pointer",
                    isActive 
                      ? "bg-[#18397a] border-t-[#0c1d3e] border-l-[#0c1d3e] border-r-[#3b66bc] border-b-[#3b66bc] shadow-inner" 
                      : "bg-[#3c813c] hover:bg-[#4aa14a] border-t-[#5da65d] border-l-[#5da65d] border-r-[#205020] border-b-[#205020]"
                  )}
                >
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* System Tray (Clock) */}
        <div className="h-full bg-gradient-to-b from-[#0f3db5] to-[#09246a] border-l border-[#1d429a] flex items-center px-3 gap-2">
          <Clock className="w-3.5 h-3.5 text-[#5ba4fc]" />
          <span className="text-[10px] text-white font-bold font-mono">{currentTime}</span>
        </div>
      </div>

      {/* Start Menu Drawer Overlay */}
      {startMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => setStartMenuOpen(false)}
        >
          {/* Classic Start Menu Frame */}
          <div 
            className="absolute bottom-[30px] left-0 w-[380px] max-w-full bg-[#ece9d8] border-2 border-[#0053e2] rounded-t-lg shadow-2xl flex flex-col font-sans text-xs text-black"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header banner */}
            <div className="bg-gradient-to-r from-[#0053e1] to-[#357aec] p-3 text-white flex items-center gap-3 border-b border-[#002e80]">
              <div className="w-10 h-10 rounded border-2 border-white bg-white/20 flex items-center justify-center font-bold text-sm shrink-0">
                QUT
              </div>
              <div>
                <h3 className="font-bold text-sm">QUT Student</h3>
                <p className="text-[10px] text-blue-200">Logged on to Classmate OS</p>
              </div>
            </div>

            {/* Content columns */}
            <div className="flex bg-white flex-grow">
              
              {/* Programs Column */}
              <div className="w-1/2 p-2 space-y-1 bg-white">
                <span className="text-[9px] font-bold text-zinc-400 block px-1 pb-1">PROGRAMS</span>
                
                {shortcuts.map(s => (
                  <button
                    key={s.id}
                    onClick={() => openWindow(s.id)}
                    className="w-full text-left p-1.5 hover:bg-[#316ac5] hover:text-white flex items-center gap-2 rounded transition-colors text-xs"
                  >
                    <span className="shrink-0 text-zinc-600 hover:text-white">{s.icon}</span>
                    <span className="font-semibold truncate">{s.label}</span>
                  </button>
                ))}
              </div>

              {/* System Column */}
              <div className="w-1/2 p-2 bg-[#d3e5fa] border-l border-[#a0c5eb] space-y-2">
                <span className="text-[9px] font-bold text-blue-800 block px-1">PLACES</span>

                <div className="space-y-0.5">
                  <button 
                    onClick={() => openWindow("readme")}
                    className="w-full text-left p-1.5 hover:bg-[#316ac5] hover:text-white flex items-center gap-2 rounded transition-colors text-xs font-semibold text-blue-900 hover:text-white"
                  >
                    <BookOpen className="w-4 h-4 shrink-0 text-blue-600" />
                    <span>My Documents</span>
                  </button>

                  <button 
                    onClick={() => window.open("https://github.com/danieltsam/qut-classmate", "_blank")}
                    className="w-full text-left p-1.5 hover:bg-[#316ac5] hover:text-white flex items-center gap-2 rounded transition-colors text-xs font-semibold text-blue-900 hover:text-white"
                  >
                    <Layers className="w-4 h-4 shrink-0 text-blue-600" />
                    <span>GitHub Codebase</span>
                  </button>

                  <button 
                    onClick={() => openWindow("readme")}
                    className="w-full text-left p-1.5 hover:bg-[#316ac5] hover:text-white flex items-center gap-2 rounded transition-colors text-xs font-semibold text-blue-900 hover:text-white"
                  >
                    <HelpCircle className="w-4 h-4 shrink-0 text-blue-600" />
                    <span>Help and Support</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer logoff/shut down */}
            <div className="bg-[#a0c5eb] p-2 flex justify-end gap-3 border-t border-[#80a4c8]">
              <button 
                onClick={handleRestart}
                className="xp-button py-1 px-2.5 flex items-center gap-1.5 text-xs text-blue-950 font-bold"
              >
                <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
                <span>Log Off</span>
              </button>
              <button 
                onClick={() => setShowShutdownDialog(true)}
                className="xp-button py-1 px-2.5 flex items-center gap-1.5 text-xs text-red-950 font-bold"
              >
                <Power className="w-3.5 h-3.5 text-red-600" />
                <span>Turn Off Computer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shutdown Dialog Screen Box */}
      {showShutdownDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center font-sans select-none">
          <div className="xp-window w-[300px] border-2 border-orange-600 shadow-2xl flex flex-col text-xs text-black">
            <div className="xp-titlebar bg-gradient-to-r from-orange-600 to-amber-500 border-b border-orange-850 h-7 text-white font-bold flex justify-between items-center px-3">
              <span>Turn Off Computer</span>
              <button 
                onClick={() => setShowShutdownDialog(false)}
                className="xp-btn-close bg-orange-700 hover:bg-orange-600"
              >
                X
              </button>
            </div>
            
            <div className="xp-panel p-4 flex flex-col gap-4 text-center">
              <p className="font-semibold text-zinc-700">Are you sure you want to shut down?</p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => {
                    setShowShutdownDialog(false)
                    setIsShutDown(true)
                  }}
                  className="xp-button py-2 px-4 flex flex-col items-center gap-1 text-[10px] w-20 border-[#707070]"
                >
                  <Power className="w-5 h-5 text-red-600" />
                  <span>Turn Off</span>
                </button>
                <button
                  onClick={handleRestart}
                  className="xp-button py-2 px-4 flex flex-col items-center gap-1 text-[10px] w-20 border-[#707070]"
                >
                  <RotateCcw className="w-5 h-5 text-green-600" />
                  <span>Restart</span>
                </button>
                <button
                  onClick={() => setShowShutdownDialog(false)}
                  className="xp-button py-2 px-4 flex flex-col items-center gap-1 text-[10px] w-20 border-[#707070]"
                >
                  <span className="font-bold">Cancel</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
