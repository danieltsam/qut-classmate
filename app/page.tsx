import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Calendar, Star } from "lucide-react"
import { UnitSearch } from "@/components/unit-search"

export default function Home() {
  return (
    <main className="container mx-auto py-6 px-4 max-w-7xl">
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-[#003A6E]">QUT Classmate</h1>
        <p className="text-muted-foreground">
          The ultimate student timetable planner for Queensland University of Technology.
        </p>
      </header>

      <Tabs defaultValue="search" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto md:mx-0">
          <TabsTrigger value="search" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search</span>
          </TabsTrigger>
          <TabsTrigger value="timetable" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Timetable</span>
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            <span className="hidden sm:inline">Reviews</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-4">
          <UnitSearch />
        </TabsContent>

        <TabsContent value="timetable">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-12 text-center">
            <h2 className="text-2xl font-semibold mb-2">Timetable Builder</h2>
            <p className="text-muted-foreground">Add units from search to start building your schedule.</p>
          </div>
        </TabsContent>

        <TabsContent value="reviews">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-12 text-center">
            <h2 className="text-2xl font-semibold mb-2">Unit Reviews</h2>
            <p className="text-muted-foreground">Community ratings and feedback for QUT units.</p>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  )
}
