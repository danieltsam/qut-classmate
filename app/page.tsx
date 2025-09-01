"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UnitSearch } from "@/components/unit-search"
import { TimetableMaker } from "@/components/timetable-maker"
import { UnitReviews } from "@/components/unit-reviews"
import { ThemeToggle } from "@/components/theme-toggle"
import { HelpDialog } from "@/components/help-dialog"
import { useSearchParams } from "next/navigation"

export default function Home() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "search")
  const [isLoaded, setIsLoaded] = useState(false)
  const [unitCodeParam, setUnitCodeParam] = useState<string | null>(null)
  const [unitNameParam, setUnitNameParam] = useState<string | null>(null)

  // Set loaded state after a small delay for animations
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  // Get the unitCode and unitName from URL parameters
  useEffect(() => {
    const unitCode = searchParams.get("unitCode")
    const unitName = searchParams.get("unitName")
    const tab = searchParams.get("tab")

    if (tab) {
      setActiveTab(tab)
    }

    if (unitCode) {
      setUnitCodeParam(unitCode)
    }

    if (unitName) {
      setUnitNameParam(decodeURIComponent(unitName))
    }
  }, [searchParams])

  // Update tab state without changing URL
  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  return (
    <main className="container mx-auto py-6 px-4 sm:py-10 flex flex-col min-h-[calc(100vh-80px)]">
      <div
        className={`flex justify-end space-x-4 mb-4 items-center transition-opacity duration-500 ${isLoaded ? "opacity-100" : "opacity-0"}`}
      >
        <HelpDialog />
        <ThemeToggle />
      </div>

      <div
        className={`text-center mb-6 pb-4 border-b border-[#003A6E]/20 dark:border-blue-900/30 transition-all duration-500 ${isLoaded ? "opacity-100 transform-none" : "opacity-0 translate-y-4"}`}
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
          className={`grid w-full grid-cols-3 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl transition-all duration-500 ${isLoaded ? "opacity-100 transform-none" : "opacity-0 translate-y-4"}`}
        >
          <TabsTrigger
            value="search"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm py-1.5 px-1 sm:px-3"
          >
            Unit Search
          </TabsTrigger>
          <TabsTrigger
            value="timetable"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm py-1.5 px-1 sm:px-3"
          >
            Timetable Creator
          </TabsTrigger>
          <TabsTrigger
            value="reviews"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm py-1.5 px-1 sm:px-3"
          >
            Unit Reviews
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="search"
          className={`focus:outline-none transition-all duration-500 ${isLoaded ? "opacity-100 transform-none" : "opacity-0 translate-y-8"}`}
        >
          <UnitSearch />
        </TabsContent>

        <TabsContent
          value="timetable"
          className={`focus:outline-none transition-all duration-500 ${isLoaded ? "opacity-100 transform-none" : "opacity-0 translate-y-8"}`}
        >
          <TimetableMaker />
        </TabsContent>

        <TabsContent
          value="reviews"
          className={`focus:outline-none transition-all duration-500 ${isLoaded ? "opacity-100 transform-none" : "opacity-0 translate-y-8"}`}
        >
          <UnitReviews initialUnitCode={unitCodeParam} initialUnitName={unitNameParam} />
        </TabsContent>
      </Tabs>
    </main>
  )
}
