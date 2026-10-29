import { HomePage } from "@/components/home-page"

// No Suspense wrapper: HomePage no longer reads useSearchParams, so this page can
// be prerendered in full. The previous wrapper only ever rendered its fallback in
// production, which meant the deployed HTML contained no app markup at all.
export default function Page() {
  return <HomePage />
}

// Render per request. As a static page this route prerendered only the shell, so
// the deployed HTML contained no app markup and every visitor saw a blank frame
// until JS booted. Dynamic rendering puts the real page in the first response.
export const dynamic = "force-dynamic"
