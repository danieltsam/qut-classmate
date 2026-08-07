import * as fs from 'fs';
import * as path from 'path';
import VisualizerDashboard from '@/components/visualizer-dashboard';

export default function Page() {
  const dbPath = path.join(process.cwd(), 'data/qut-degree-structures.json');
  const assessmentsPath = path.join(process.cwd(), 'data/qut-unit-assessments.json');
  
  let allCoursesData = [];
  try {
    const fileContent = fs.readFileSync(dbPath, 'utf8');
    const database = JSON.parse(fileContent);
    allCoursesData = database.data || [];
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

  if (allCoursesData.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-destructive">Database Loading Error</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Could not locate or parse the degree structures file. Please run the scraping script (`node scripts/scrape-degree-structures.js`) first.
        </p>
      </div>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl animate-in fade-in duration-500">
      <VisualizerDashboard allCoursesData={allCoursesData} assessmentsData={assessmentsData} />
    </main>
  );
}
