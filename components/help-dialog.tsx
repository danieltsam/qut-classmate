"use client"

import { HelpCircle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState } from "react"
import { useToast } from "@/components/ui/use-toast"

export function HelpDialog() {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)

  const clearLocalCache = () => {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith("timetable-")) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key))

    toast({
      title: "Cache Cleared",
      description: `Cleared ${keysToRemove.length} cached timetable entries.`,
      duration: 3000,
      className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="border-[#003A6E] dark:border-blue-300 hover:bg-[#003A6E]/10 dark:hover:bg-blue-300/10 transition-all duration-200 shadow-sm hover:shadow animate-pulse-once"
        >
          <HelpCircle className="h-[1.2rem] w-[1.2rem] text-[#003A6E] dark:text-blue-300" />
          <span className="sr-only">Help</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px] max-h-[90vh] overflow-y-auto dark:bg-gray-900 transition-colors duration-300 rounded-xl mx-2 sm:mx-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 text-center">
            Need a hand?
          </DialogTitle>
          <DialogDescription
            className="text-center animate-in fade-in-50 duration-300"
            style={{ animationDelay: "100ms" }}
          >
            Learn how to use the site, uncover its purpose, and stay in the loop with the latest updates—because we're
            constantly making things better!
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="about" className="mt-4">
          <div className="flex justify-center">
            <TabsList className="bg-gray-100 dark:bg-gray-800 rounded-lg mb-4 flex flex-wrap w-full">
              <TabsTrigger value="about" className="rounded-md text-xs flex-1 px-1 sm:px-3">
                About
              </TabsTrigger>
              <TabsTrigger value="unit-search" className="rounded-md text-xs flex-1 px-1 sm:px-3">
                Unit Search
              </TabsTrigger>
              <TabsTrigger value="timetable" className="rounded-md text-xs flex-1 px-1 sm:px-3">
                Timetable
              </TabsTrigger>
              <TabsTrigger value="changelog" className="rounded-md text-xs flex-1 px-1 sm:px-3">
                Changelog
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="about" className="space-y-4 mt-4 overflow-y-auto max-h-[50vh] pr-2">
            <div className="animate-in fade-in-50 duration-300">
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 text-center">Why This Exists</h3>
              <div className="mt-2 text-center">
                <p>
                  I built this tool to help QUT students view and plan their timetables without suffering through the
                  mess that is QUT Allocate+. Use it however works best for you — hope it makes your life just a little
                  easier!
                </p>
                <p className="mt-2">- Daniel 😃</p>
                <div className="italic text-sm text-gray-500 dark:text-gray-400 mt-4">
                  You're limited to 15 searches per day to keep this app available for everyone. Thanks for your
                  understanding!
                </div>
              </div>
            </div>

            {/* Add more content to push the clear cache button below the viewport */}
            <div className="mt-6 pt-6">
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 text-center">How It Works</h3>
              <p className="mt-2 text-center">
                QUT Classmate fetches timetable data directly from QUT's systems and presents it in a clean,
                user-friendly interface. The app caches data locally to reduce load on QUT's servers and provide faster
                responses for you.
              </p>
              <p className="mt-2 text-center">
                All processing happens in your browser - we don't store any of your data on our servers. Your timetable
                selections are saved locally on your device.
              </p>
            </div>

            <div className="mt-6 pt-6">
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 text-center">Privacy & Data</h3>
              <p className="mt-2 text-center">
                QUT Classmate doesn't require you to log in or provide any personal information. We don't track
                individual users or collect any data beyond basic analytics to help improve the site.
              </p>
              <p className="mt-2 text-center">
                Your timetable selections and preferences are stored only in your browser's local storage.
              </p>
            </div>

            {/* Keep the clear cache button section, but now it will be below the viewport */}
            <div className="mt-10 border-t pt-10 border-gray-200 dark:border-gray-700">
              <div className="flex flex-col items-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Having issues with outdated unit data?</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearLocalCache}
                  className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Unit Cache
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                  This will clear all cached unit data and fetch fresh information on your next search.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="unit-search" className="space-y-4 mt-4 overflow-y-auto max-h-[50vh] pr-2">
            <div className="animate-in fade-in-50 duration-300">
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 text-center">Unit Search</h3>
              <br />
              <p className="text-center">
                Need to check when your classes actually are? Or maybe you're like me and just want to show up to
                practicals when you happen to be on campus? This tool lets you look up any unit's timetable at QUT
                without needing to log in or cry inside Allocate+.
              </p>
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 mt-4 text-center">
                How to Use Unit Search:
              </h3>
              <br />
              <ol className="list-decimal pl-5 space-y-2">
                <li>Enter a QUT unit code (e.g., CAB202) in the Unit Code field.</li>
                <li>Select the teaching period from the dropdown.</li>
                <li>Click "Search Unit" to view the timetable for that unit.</li>
                <li>View the results in the table format.</li>
                <li>Click on any class to see more details.</li>
                <li>Use "View in Timetable Creator" to add a class to your custom timetable.</li>
              </ol>
              <p className="italic text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                Pro tip: You can sort the table by clicking on the column headers.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="timetable" className="space-y-4 mt-4 overflow-y-auto max-h-[50vh] pr-2">
            <div className="animate-in fade-in-50 duration-300">
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 text-center">Timetable Creator</h3>
              <br />
              <p className="text-center">
                I made the Timetable Creator because QUT Allocate+ is clunky, ugly, and doesn't let me pick my classes
                the way I want. This tool lets you build your dream timetable by selecting the exact class times that
                work for you.
              </p>
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 mt-4 text-center">
                How to Use Timetable Creator:
              </h3>
              <br />
              <ol className="list-decimal pl-5 space-y-2">
                <li>Search for units using the search tab in the sidebar.</li>
                <li>Click on classes to add them to your timetable.</li>
                <li>View your selected classes in the weekly timetable view.</li>
                <li>Remove classes by clicking on them in the timetable.</li>
                <li>Export your final timetable to a calendar file or Google Calendar.</li>
                <li>Hover over class types to preview all matching classes.</li>
                <li>
                  Use the Auto Generate Timetable feature to automatically create an optimal timetable based on your
                  preferences.
                </li>
                <li>Choose between spreading classes across multiple days or compacting them into fewer days.</li>
              </ol>

              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 mt-4 text-center">
                Auto Timetable Generator:
              </h3>
              <p className="mt-2">The Auto Timetable Generator helps you create an optimal timetable automatically:</p>
              <ol className="list-decimal pl-5 space-y-2 mt-2">
                <li>Click the "Auto Generate Timetable" button at the top of the timetable view.</li>
                <li>Add your units in the first step.</li>
                <li>Choose your preferred day distribution: spread out, balanced, or compact.</li>
                <li>Mark your unavailable times in the second step by clicking and dragging on the grid.</li>
                <li>Click "Generate Timetable" to create an optimal schedule that avoids your unavailable times.</li>
                <li>Review the generated timetable and click "Apply to Timetable" to add it to your schedule.</li>
              </ol>

              <p className="italic text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                The app will warn you about time conflicts between classes that occur in the same weeks, but you can
                still add them anyway if you really want to.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="changelog" className="space-y-4 mt-4 overflow-y-auto max-h-[50vh] pr-2">
            <div className="animate-in fade-in-50 duration-300">
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 text-center">Changelog</h3>
              <div className="mt-4 space-y-6 text-sm">
                <div>
                  <h4 className="font-semibold text-[#003A6E] dark:text-blue-300">v1.5</h4>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>Added Auto Timetable Generator to automatically create optimal schedules</li>
                    <li>Improved mobile experience with sticky day headers in the timetable view</li>
                    <li>Enhanced touch support for selecting unavailable times on mobile</li>
                    <li>Added automatic unit selection when clicking from dropdown in Auto Timetable Generator</li>
                    <li>Improved warnings for missing classes in auto-generated timetables</li>
                    <li>Fixed issue where selected classes weren't being added to search history</li>
                    <li>Added Redis caching for improved performance and reduced API calls</li>
                    <li>Improved mobile responsiveness for modals and dialogs</li>
                    <li>Optimized display of 1-hour classes to fit more information</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-[#003A6E] dark:text-blue-300">v1.4</h4>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>Renamed "Timetable Maker" to "Timetable Creator"</li>
                    <li>Added support for specific week patterns (single weeks, ranges, etc.)</li>
                    <li>Improved conflict detection and display to only warn about overlaps in the same weeks</li>
                    <li>Added unit code autocomplete by scraping 4000 QUT Units and using in a search dropdown</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-[#003A6E] dark:text-blue-300">v1.3</h4>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>Added server-side caching with Redis/Vercel KV for faster responses</li>
                    <li>Improved rate limiting with better error handling</li>
                    <li>Extended client-side cache duration to 30 days</li>
                    <li>Optimized data fetching with multi-level caching strategy</li>
                    <li>Added detailed console logging for debugging</li>
                    <li>Enhanced scrollbar styling for better visibility and interaction</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-[#003A6E] dark:text-blue-300">v1.2</h4>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>
                      Added rate limiting: 15 requests/day per user (checking cookies secondarily + IP primarily) to be
                      a responsible user of the public QUT website.
                    </li>
                    <li>Timetable class uniqueness: fixed duplicate selections</li>
                    <li>Sticky timetable view on scroll</li>
                    <li>
                      Saved unit cache in `localStorage`, cleared when not used. Will allow a new unit data request
                      every 96 hours. This also reduces serverless api calls on Vercel.
                    </li>
                    <li>Added loading animations and section fade-ins</li>
                    <li>Improved hover effects for timetable cells</li>
                    <li>Allowing for overlaps in timetable by making them side-by-side.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-[#003A6E] dark:text-blue-300">v1.1</h4>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>Added validation for unit code input</li>
                    <li>Improved error messaging and toast notifications</li>
                    <li>Converted activity types (e.g., `LEC` → `Lecture`)</li>
                    <li>Google Calendar integration</li>
                    <li>Added transition button to move from unit search → timetable creator</li>
                    <li>Timetable hover effects when highlighting an activity type</li>
                    <li>Click-to-expand unit info instead of hover</li>
                  </ul>
                  <p className="italic text-sm text-gray-600 dark:text-gray-400 m-5 text-center">
                    Built with the help of v0.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
