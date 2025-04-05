import { Github, Linkedin, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 mt-12 py-6 px-4">
      <div className="container mx-auto flex flex-col items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-center">Built by Daniel Sam</p>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-center text-xs">(coded with vibes 😉)</p>
        <div className="flex space-x-4">
          <Button
            variant="outline"
            size="icon"
            className="border-[#003A6E] dark:border-blue-300 hover:bg-[#003A6E]/10 dark:hover:bg-blue-300/10 transition-all duration-200 shadow-sm hover:shadow"
            asChild
          >
            <a href="https://github.com/danieltsam" target="_blank" rel="noopener noreferrer">
              <Github className="h-5 w-5 text-[#003A6E] dark:text-blue-300" />
              <span className="sr-only">GitHub</span>
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="border-[#003A6E] dark:border-blue-300 hover:bg-[#003A6E]/10 dark:hover:bg-blue-300/10 transition-all duration-200 shadow-sm hover:shadow"
            asChild
          >
            <a href="https://linkedin.com/in/daniel-sam-852487236/" target="_blank" rel="noopener noreferrer">
              <Linkedin className="h-5 w-5 text-[#003A6E] dark:text-blue-300" />
              <span className="sr-only">LinkedIn</span>
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="border-[#003A6E] dark:border-blue-300 hover:bg-[#003A6E]/10 dark:hover:bg-blue-300/10 transition-all duration-200 shadow-sm hover:shadow"
            asChild
          >
            <a href="https://danieltsam.github.io" target="_blank" rel="noopener noreferrer">
              <Globe className="h-5 w-5 text-[#003A6E] dark:text-blue-300" />
              <span className="sr-only">Portfolio</span>
            </a>
          </Button>
        </div>
      </div>
    </footer>
  )
}

