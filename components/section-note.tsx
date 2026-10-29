import type { ReactNode } from "react"

/**
 * A quiet note at the bottom of each section, in the words of someone who
 * actually uses the tool. Deliberately unlabelled and small — it reads as a
 * footnote, not as help text.
 */
export function SectionNote({ children }: { children: ReactNode }) {
  return (
    <aside className="mt-8 border-t border-gray-200/70 pt-4 dark:border-gray-800/70">
      <p className="max-w-3xl text-xs leading-relaxed text-gray-500 dark:text-gray-500">{children}</p>
    </aside>
  )
}
