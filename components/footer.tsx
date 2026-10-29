"use client"

const SHORT_TERM_PROGRAMS =
  "https://qutvirtual2.qut.edu.au/ismms-core/studentNav/shortTermPrograms"

export function Footer() {
  return (
    <footer className="mt-auto py-8 border-t border-[#003A6E]/20 dark:border-blue-900/30">
      <div className="container mx-auto flex flex-col items-center gap-3 px-4">
        {/* A personal note, not a product feature: this is the single piece of advice
            the owner would give any student with a spare elective. */}
        <p className="text-center text-xs leading-relaxed text-gray-500 dark:text-gray-500 max-w-xl">
          If you have a spare elective, spend it on a{" "}
          <a
            href={SHORT_TERM_PROGRAMS}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#003A6E] underline underline-offset-2 hover:text-[#0053e2] dark:text-blue-300 dark:hover:text-blue-200"
          >
            QUT short-term exchange
          </a>
          . The unit still counts, so you are technically reattributing the money you would have spent on it
          towards going somewhere new. NCP funding can cover a surprising amount of the rest.
        </p>

        <p className="text-center text-xs leading-relaxed text-gray-400 dark:text-gray-600 max-w-xl">
          Prerequisite and requisite checks here are advisory, not binding. In practice a waiver is often
          possible. A sensible email explaining your background, outside projects or prior experience usually
          gets one.
        </p>

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
