export function StructuredData() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "QUT Classmate",
    headline: "QUT Timetable Planner & Unit Search Tool",
    description:
      "A comprehensive timetable planning tool for QUT students to search for units, find class times, and build semester schedules without using Allocate+.",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "AUD",
    },
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "Student",
    },
    keywords:
      "QUT timetable, QUT unit search, QUT class search, QUT class times, QUT timetable planner, QUT schedule, Queensland University of Technology",
    creator: {
      "@type": "Person",
      name: "Daniel",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": "https://qut-classmate.vercel.app/",
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://qut-classmate.vercel.app/?unitCode={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
}
