import { Suspense } from "react"
import { HomePage } from "@/components/home-page"

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="container mx-auto py-10 px-4">
          <div className="text-center text-gray-500">Loading QUT Classmate...</div>
        </main>
      }
    >
      <HomePage />
    </Suspense>
  )
}
