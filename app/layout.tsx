import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { Footer } from "@/components/footer"
import { StructuredData } from "@/components/structured-data"
import { RateLimitProvider } from "@/context/RateLimitContext"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "QUT Classmate | QUT Timetable & Unit Search Tool",
  description:
    "The ultimate QUT timetable planner and unit search tool. Find QUT class times, build conflict-free schedules, and search for units without Allocate+. QUT Classmate makes timetable planning easy.",
  keywords:
    "QUT, QUT timetable, QUT unit search, QUT class search, QUT class times, QUT timetable planner, QUT class planner, QUT schedule, Queensland University of Technology, Allocate+, unit search, course planner, qut classmate, qut unit finder, qut class finder, qut semester planner",
  openGraph: {
    title: "QUT Classmate | QUT Timetable & Unit Search Tool",
    description:
      "The ultimate QUT timetable planner and unit search tool. Find QUT class times, build conflict-free schedules, and search for units without Allocate+.",
    url: "https://qut-classmate.vercel.app/",
    siteName: "QUT Classmate",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "QUT Classmate Timetable Planner",
      },
    ],
    locale: "en_AU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QUT Classmate | QUT Timetable & Unit Search Tool",
    description:
      "The ultimate QUT timetable planner and unit search tool. Find QUT class times, build conflict-free schedules, and search for units without Allocate+.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  metadataBase: new URL("https://qut-classmate.vercel.app/"),
  alternates: {
    canonical: "https://qut-classmate.vercel.app/",
  },
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google tag (gtag.js) */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-0CMKWDM6PF"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-0CMKWDM6PF');
            `,
          }}
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="canonical" href="https://qut.vercel.app/" />
        <meta name="google-site-verification" content="RWVD2qcByloMLqvEwbrWD4iJ7XkWenFjb_9MlGf-SnM" />
      </head>
      <body
        className={`${inter.className} min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <RateLimitProvider>
            <div className="flex-grow">{children}</div>
            <Footer />
            <Toaster />
            <StructuredData />
          </RateLimitProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
