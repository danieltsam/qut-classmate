import { Suspense } from "react"
import { HomePage } from "@/components/home-page"
import * as fs from 'fs'
import * as path from 'path'

export default function Page() {
  const dbPath = path.join(process.cwd(), 'data/qut-degree-structures.json');
  const assessmentsPath = path.join(process.cwd(), 'data/qut-unit-assessments.json');
  
  let allCoursesData = [];
  try {
    if (fs.existsSync(dbPath)) {
      const fileContent = fs.readFileSync(dbPath, 'utf8');
      const database = JSON.parse(fileContent);
      allCoursesData = database.data || [];
    }
  } catch (err) {
    console.error('Error loading degree structures database:', err);
  }

  let assessmentsData = {};
  try {
    if (fs.existsSync(assessmentsPath)) {
      const assessmentsContent = fs.readFileSync(assessmentsPath, 'utf8');
      assessmentsData = JSON.parse(assessmentsContent).data || {};
    }
  } catch (err) {
    console.warn('Could not load unit assessments database:', err instanceof Error ? err.message : String(err));
  }

  return (
    <Suspense
      fallback={
        <div className="xp-desktop min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <div className="xp-window p-4 max-w-sm">
            <div className="xp-titlebar">
              <span className="text-xs font-bold">System Startup</span>
            </div>
            <div className="xp-panel p-4 text-xs font-sans text-black">
              Loading QUT Classmate Desktop Environment...
            </div>
          </div>
        </div>
      }
    >
      <HomePage allCoursesData={allCoursesData} assessmentsData={assessmentsData} />
    </Suspense>
  )
}
