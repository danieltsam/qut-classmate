"use client"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Switch } from "@/components/ui/switch"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { setTheme, theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Set dark mode as default
  useEffect(() => {
    if (mounted && !theme) {
      setTheme("dark")
    }
  }, [mounted, theme, setTheme])

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Add transition class to body when theme changes
  useEffect(() => {
    if (mounted) {
      document.body.classList.add("theme-transition")

      // Remove the class after the transition completes
      const timer = setTimeout(() => {
        document.body.classList.remove("theme-transition")
      }, 500)

      return () => clearTimeout(timer)
    }
  }, [theme, mounted])

  if (!mounted) {
    return null
  }

  const isDark = resolvedTheme === "dark"

  return (
    <div className="flex items-center space-x-2 animate-in fade-in-50 duration-300">
      <Sun
        className={`h-[1.2rem] w-[1.2rem] text-[#003A6E] dark:text-blue-300 transition-all duration-500 ${isDark ? "opacity-50 scale-90" : "opacity-100 scale-110 rotate-12"}`}
      />
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        className="data-[state=checked]:bg-[#003A6E] dark:data-[state=checked]:bg-blue-700 transition-all duration-500 relative overflow-visible"
      />
      <Moon
        className={`h-[1.2rem] w-[1.2rem] text-[#003A6E] dark:text-blue-300 transition-all duration-500 ${isDark ? "opacity-100 scale-110 rotate-12" : "opacity-50 scale-90"}`}
      />
    </div>
  )
}
