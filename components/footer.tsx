"use client"

/**
 * Site chrome, shown under every tab. Anything that belongs to one tab lives in
 * that tab's section note instead, so it is not repeated on the other three.
 */
export function Footer() {
  return (
    <footer className="mt-auto py-8 border-t border-[#003A6E]/20 dark:border-blue-900/30">
      <div className="container mx-auto flex flex-col items-center gap-3 px-4">
        <p className="text-center text-xs text-gray-500 dark:text-gray-500 max-w-md">
          Not affiliated with QUT. Always check the official timetable.
        </p>

        <a
          href="https://github.com/danieltsam/qut-classmate"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 underline-offset-4 transition-colors duration-200 hover:text-[#003A6E] hover:underline dark:text-gray-600 dark:hover:text-blue-300"
        >
          View the source on GitHub
        </a>
      </div>
    </footer>
  )
}
