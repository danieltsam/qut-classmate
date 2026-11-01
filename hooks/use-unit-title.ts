"use client"

import { useEffect, useState } from "react"
import { getUnitTitle } from "@/lib/unit-codes"

/**
 * The readable name for a unit code.
 *
 * Three sources, in order of trust:
 *
 *   1. whatever the caller already has (the search response never sends one today)
 *   2. the bundled catalog in data/qut-unit-codes.json
 *   3. /api/units/[code], which reads data/unit-meta.json on the server
 *
 * The catalog covers about 800 units and misses plenty of current ones (CAB201,
 * for instance), so the outline endpoint is the backstop. It stays server side
 * because unit-meta.json is 1.3 MB and has no business in a client bundle.
 */
export function useUnitTitle(code: string | undefined, provided?: string | null): string | undefined {
  const given = provided?.trim() || undefined
  const catalogTitle = code ? getUnitTitle(code) : undefined
  const [fetchedTitle, setFetchedTitle] = useState<string | undefined>(undefined)

  useEffect(() => {
    setFetchedTitle(undefined)
    if (!code || given || catalogTitle) return

    let cancelled = false

    fetch(`/api/units/${encodeURIComponent(code)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.title === "string" && data.title.length > 0) {
          setFetchedTitle(data.title)
        }
      })
      .catch(() => {
        // A missing title is not worth an error banner; the code still shows.
      })

    return () => {
      cancelled = true
    }
  }, [code, given, catalogTitle])

  return given ?? catalogTitle ?? fetchedTitle
}
