export function StructuredData() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "QUT Classmate",
    description: "A timetable planning tool for QUT students to search for units and build semester schedules.",
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
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
}
