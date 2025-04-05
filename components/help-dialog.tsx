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

export function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="border-[#003A6E] dark:border-blue-300 hover:bg-[#003A6E]/10 dark:hover:bg-blue-300/10 transition-all duration-200 shadow-sm hover:shadow"
        >
          <HelpCircle className="h-[1.2rem] w-[1.2rem] text-[#003A6E] dark:text-blue-300" />
          <span className="sr-only">Help</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px] dark:bg-gray-900 dark:text-white rounded-xl shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-[#003A6E] dark:text-blue-300 text-xl">Need a hand?</DialogTitle>
          <DialogDescription>
            Here’s how to use the site, why it exists, and how it saves you from suffering through Allocate+.
            Find class times, build your timetable, and maybe even show up to a prac on time.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="about" className="mt-4">
          <TabsList className="bg-gray-100 dark:bg-gray-800 rounded-lg">
            <TabsTrigger value="about" className="rounded-md">
              About
            </TabsTrigger>
            <TabsTrigger value="unit-search" className="rounded-md">
              Unit Search
            </TabsTrigger>
            <TabsTrigger value="timetable" className="rounded-md">
              Timetable Maker
            </TabsTrigger>
          </TabsList>
          <TabsContent value="about" className="space-y-4 mt-4">
            <h3 className="font-semibold text-[#003A6E] dark:text-blue-300">Why This Exists</h3>
            <p className="mt-2">
              I built this tool to help QUT students easily view and plan their timetables without the frustration of
              using the ugly QUT systems. Feel free to use it however it helps you best!
            </p>
          </TabsContent>
          <TabsContent value="unit-search" className="space-y-4 mt-4">
            <h3 className="font-semibold text-[#003A6E] dark:text-blue-300">Unit Search</h3>
            <p>
              Need to check when your classes actually are? Or maybe you're like me and just want to show up to
              practicals when you happen to be on campus? This tool lets you look up any unit's timetable at QUT without
              needing to log in or cry inside Allocate+.
            </p>
            <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 mt-4">How to Use Unit Search:</h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Enter a QUT unit code (e.g., CAB202) in the Unit Code field.</li>
              <li>Select the teaching period from the dropdown.</li>
              <li>Click "Search Unit" to view the timetable for that unit.</li>
              <li>View the results in the table format.</li>
              <li>Hover over any class to see more details.</li>
            </ol>
            <p className="italic text-gray-600 dark:text-gray-400 mt-2">
              Pro tip: You can sort the table by clicking on the column headers.
            </p>
          </TabsContent>
          <TabsContent value="timetable" className="space-y-4 mt-4">
            <h3 className="font-semibold text-[#003A6E] dark:text-blue-300">Timetable Maker</h3>
            <p>
              I use the timetable maker because QUT Allocate+ is awful and ugly and doesn't let me choose my classes the
              way I want to. This tool lets you build your ideal timetable by selecting specific classes.
            </p>
            <h3 className="font-semibold text-[#003A6E] dark:text-blue-300 mt-4">How to Use Timetable Maker:</h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Search for units using the search tab in the sidebar.</li>
              <li>Click on classes to add them to your timetable.</li>
              <li>View your selected classes in the weekly timetable view.</li>
              <li>Remove classes by clicking on them in the timetable.</li>
              <li>Export your final timetable to a calendar file.</li>
              <li>Hover over any class to see more details.</li>
            </ol>
            <p className="italic text-gray-600 dark:text-gray-400 mt-2">
              The app will automatically detect time conflicts between classes.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

