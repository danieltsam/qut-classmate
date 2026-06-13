import { NextRequest, NextResponse } from "next/server";
import { fetchUnitClassesFromVirtual4 } from "@/lib/qut/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { unitCode, teachingPeriodId } = body;

    if (!unitCode || !teachingPeriodId) {
      return NextResponse.json(
        { error: "Missing unitCode or teachingPeriodId" },
        { status: 400 }
      );
    }

    const data = await fetchUnitClassesFromVirtual4(unitCode, teachingPeriodId);

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "No classes found for this unit and teaching period. It may be discontinued or not offered in this semester." },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Timetable search error:", error);
    
    if (error.message?.includes("valid session token")) {
      return NextResponse.json(
        { error: "QUT session expired. Please try again." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || "An unexpected error occurred while fetching timetable data." },
      { status: 500 }
    );
  }
}
