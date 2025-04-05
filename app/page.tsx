"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UnitSearch } from "@/components/unit-search"
import { TimetableMaker } from "@/components/timetable-maker"
import { ThemeToggle } from "@/components/theme-toggle"
import { HelpDialog } from "@/components/help-dialog"
import { useToast } from "@/components/ui/use-toast"
import { useEffect } from "react"

export default function Home() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("search")

  // Show toast on first load
  useEffect(() => {
    toast({
      title: "Tip",
      description: "Hover over classes to see more details about them.",
      duration: 5000,
    })
  }, [toast])

  return (
    <main className="container mx-auto py-10 px-4">
      <div className="flex justify-end space-x-4 mb-4 items-center">
        <HelpDialog />
        <ThemeToggle />
      </div>

      <div className="text-center mb-8 pb-6 border-b border-[#003A6E]/20 dark:border-blue-900/30">
        <h1 className="text-3xl font-bold mb-2 text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
          QUT Classmate
        </h1>
        <p className="text-gray-600 dark:text-gray-400 transition-colors duration-300">
          The timetable tool QUT should've made, but didn't.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8 bg-gray-100 dark:bg-gray-800 rounded-xl">
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

        <TabsContent value="search" className="focus:outline-none">
          <UnitSearch />
        </TabsContent>

        <TabsContent value="timetable" className="focus:outline-none">
          <TimetableMaker />
        </TabsContent>
      </Tabs>
    </main>
  )
}

