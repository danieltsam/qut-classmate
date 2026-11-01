"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UnitSearch } from "@/components/unit-search"
import { TimetableMaker } from "@/components/timetable-maker"
import { CampusExplorer } from "@/components/campus-explorer"
import { CoursePlanner } from "@/components/course-planner"
import { ThemeToggle } from "@/components/theme-toggle"

export function HomePage() {
  const [activeTab, setActiveTab] = useState("timetable")
  // Set once React has attached. Server-rendered markup looks interactive before
  // that, and clicks in the gap are silently lost — tests gate on this.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Read the tab once from the URL instead of useSearchParams. useSearchParams
  // forces the nearest Suspense boundary to fall back to client rendering in a
  // static build, which shipped a production page whose only HTML was
  // "Loading QUT Classmate". Reading location directly lets the page prerender.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab")
    if (tab) setActiveTab(tab)
  }, [])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  return (
    <main
      className="container mx-auto py-6 px-4 sm:py-10 flex flex-col min-h-[calc(100vh-80px)]"
      data-hydrated={hydrated}
    >
      <div
        className="flex justify-end space-x-4 mb-4 items-center"
      >
        <ThemeToggle />
      </div>

      <div
        className="text-center mb-6 pb-4 border-b border-[#003A6E]/20 dark:border-blue-900/30"
      >
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-[#003A6E] dark:text-blue-300 transition-colors duration-300 animate-pulse-once">
          QUT Classmate
        </h1>
        <p className="text-gray-600 dark:text-gray-400 transition-colors duration-300 text-sm sm:text-base">
          The timetable tool QUT should've made, but didn't.
          <br className="hidden sm:block" />
          <span className="sm:inline">
            Find class times, build your timetable, maybe even show up to a prac on time.
          </span>
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full flex-grow">
        <TabsList
          className="grid w-full grid-cols-4 gap-0.5 h-auto py-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl"
        >
          <TabsTrigger
            value="timetable"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm py-1.5 px-1 sm:px-3 leading-tight whitespace-normal text-center"
          >
            Timetable Creator
          </TabsTrigger>
          <TabsTrigger
            value="explorer"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm py-1.5 px-1 sm:px-3 leading-tight whitespace-normal text-center"
          >
            Campus Explorer
          </TabsTrigger>
          <TabsTrigger
            value="planner"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm py-1.5 px-1 sm:px-3 leading-tight whitespace-normal text-center"
          >
            Course Planner
          </TabsTrigger>
          <TabsTrigger
            value="search"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm py-1.5 px-1 sm:px-3 leading-tight whitespace-normal text-center"
          >
            Unit Search
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="search"
          className="focus:outline-none"
        >
          <UnitSearch />
        </TabsContent>

        <TabsContent
          value="timetable"
          className="focus:outline-none"
        >
          <TimetableMaker />
        </TabsContent>

        <TabsContent
          value="explorer"
          className="focus:outline-none"
        >
          <CampusExplorer />
        </TabsContent>

        <TabsContent
          value="planner"
          className="focus:outline-none"
        >
          <CoursePlanner />
        </TabsContent>
      </Tabs>
    </main>
  )
}
