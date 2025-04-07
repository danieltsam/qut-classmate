"use client"

import { HelpCircle } from "lucide-react"
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

export function HelpDialog() {
  const [isOpen, setIsOpen] = useState(false)

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
      <DialogContent className="sm:max-w-[625px] max-h-[80vh] dark:bg-gray-900 dark:text-white rounded-xl shadow-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-[#003A6E] dark:text-blue-300 text-xl text-center animate-in fade-in-50 duration-300">
            Need a hand?
          </DialogTitle>
          <DialogDescription
            className="text-center animate-in fade-in-50 duration-300"
            style={{ animationDelay: "100ms" }}
          >
            Here's how to use the site, why it exists, and how it saves you from suffering through Allocate+.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="about" className="mt-4">
          <div className="flex justify-center">
            <TabsList className="bg-gray-100 dark:bg-gray-800 rounded-lg mb-4">
              <TabsTrigger value="about" className="rounded-md">
                About
              </TabsTrigger>
              <TabsTrigger value="unit-search" className="rounded-md">
                Unit Search
              </TabsTrigger>
              <TabsTrigger value="timetable" className="rounded-md">
                Timetable Maker
              </TabsTrigger>
              <TabsTrigger value="changelog" className="rounded-md">
                Changelog
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="about" className="space-y-4 mt-4 overflow-y-auto max-h-[60vh] pr-2">
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
          </TabsContent>

          <TabsContent value="unit-search" className="space-y-4 mt-4 overflow-y-auto max-h-[60vh] pr-2">
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
                <li>Use "View in Timetable Maker" to add a class to your custom timetable.</li>
              </ol>
              <p className="italic text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                Pro tip: You can sort the table by clicking on the column headers.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="timetable" className="space-y-4 mt-4 overflow-y-auto max-h-[60vh] pr-2">
            <div className="animate-in fade-in-50 duration-300">
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 text-center">Timetable Maker</h3>
              <br />
              <p className="text-center">
                I made the Timetable Maker because QUT Allocate+ is clunky, ugly, and doesn't let me pick my classes the
                way I want. This tool lets you build your dream timetable by selecting the exact class times that work
                for you.
              </p>
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 mt-4 text-center">
                How to Use Timetable Maker:
              </h3>
              <br />
              <ol className="list-decimal pl-5 space-y-2">
                <li>Search for units using the search tab in the sidebar.</li>
                <li>Click on classes to add them to your timetable.</li>
                <li>View your selected classes in the weekly timetable view.</li>
                <li>Remove classes by clicking on them in the timetable.</li>
                <li>Export your final timetable to a calendar file or Google Calendar.</li>
                <li>Hover over class types to preview all matching classes.</li>
              </ol>
              <p className="italic text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                The app will warn you about time conflicts between classes, but you can still add them anyway if you
                really want to.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="changelog" className="space-y-4 mt-4 overflow-y-auto max-h-[60vh] pr-2">
            <div className="animate-in fade-in-50 duration-300">
              <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 text-center">Changelog</h3>
              <div className="mt-4 space-y-6 text-sm">
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
                    <li>Added transition button to move from unit search → timetable maker</li>
                    <li>Timetable hover effects when highlighting an activity type</li>
                    <li>Click-to-expand unit info instead of hover</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

