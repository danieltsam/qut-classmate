"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UnitSearch } from "@/components/unit-search"
import { TimetableMaker } from "@/components/timetable-maker"
import { ThemeToggle } from "@/components/theme-toggle"
import { HelpDialog } from "@/components/help-dialog"
import { useToast } from "@/components/ui/use-toast"
import { useSearchParams, useRouter } from "next/navigation"

export default function Home() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "search")
  const [toastShown, setToastShown] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Remove the toast that appears on page load
  // Replace the useEffect block with an empty one that just sets isLoaded
  useEffect(() => {
    // Set loaded state after a small delay for animations
    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    router.push(`/?tab=${value}`, { scroll: false })
  }

  return (
    <main className="container mx-auto py-10 px-4 min-h-screen flex flex-col">
      <div
        className={`flex justify-end space-x-4 mb-4 items-center transition-opacity duration-500 ${isLoaded ? "opacity-100" : "opacity-0"}`}
      >
        <HelpDialog />
        <ThemeToggle />
      </div>

      <div
        className={`text-center mb-8 pb-6 border-b border-[#003A6E]/20 dark:border-blue-900/30 transition-all duration-500 ${isLoaded ? "opacity-100 transform-none" : "opacity-0 translate-y-4"}`}
      >
        <h1 className="text-3xl font-bold mb-2 text-[#003A6E] dark:text-blue-300 transition-colors duration-300 animate-pulse-once">
          QUT Classmate
        </h1>
        <p className="text-gray-600 dark:text-gray-400 transition-colors duration-300">
          The timetable tool QUT should've made, but didn't.
          <br />
          Find class times, build your timetable, maybe even show up to a prac on time.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full flex-grow">
        <TabsList
          className={`grid w-full grid-cols-2 mb-8 bg-gray-100 dark:bg-gray-800 rounded-xl transition-all duration-500 ${isLoaded ? "opacity-100 transform-none" : "opacity-0 translate-y-4"}`}
        >
          <TabsTrigger
            value="search"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200"
          >
            Unit Search
          </TabsTrigger>
          <TabsTrigger
            value="timetable"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200"
          >
            Timetable Maker
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
      </Tabs>
    </main>
  )
}

