"use client"

import { Github, Linkedin, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

export function Footer() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Add a small delay before showing the footer for a nice animation
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  return (
    <footer
      className={`py-8 border-t border-[#003A6E]/20 dark:border-blue-900/30 transition-all duration-700 ${isVisible ? "opacity-100 transform-none" : "opacity-0 translate-y-4"}`}
    >
      <div className="container mx-auto flex flex-col items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-center text-xs border-b border-gray-200 dark:border-gray-700 pb-3 w-full max-w-md">
          Not affiliated with QUT. Always check the official timetable.
        </p>
        <p className="text-gray-600 dark:text-gray-400 mb-2 text-center">Built by Daniel Sam</p>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-center text-xs">(with a lot of help from v0 😉)</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow animate-in fade-in-50 duration-300"
            onClick={() => window.open("https://github.com/danieltsam", "_blank")}
            style={{ animationDelay: "100ms" }}
          >
            <Github className="h-4 w-4 mr-2" />
            GitHub
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow animate-in fade-in-50 duration-300"
            onClick={() => window.open("https://linkedin.com/in/daniel-sam-852487236/", "_blank")}
            style={{ animationDelay: "200ms" }}
          >
            <Linkedin className="h-4 w-4 mr-2" />
            LinkedIn
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow animate-in fade-in-50 duration-300"
            onClick={() => window.open("https://danieltsam.github.io", "_blank")}
            style={{ animationDelay: "300ms" }}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Portfolio
          </Button>
        </div>
      </div>
    </footer>
  )
}
