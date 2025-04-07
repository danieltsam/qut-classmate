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
  title: "QUT Classmate | Easy Timetable Planning for QUT Students",
  description:
    "Build your perfect QUT semester schedule with QUT Classmate. Search for units, view class times, and create conflict-free timetables without the hassle of Allocate+.",
  keywords:
    "QUT, timetable, class schedule, Queensland University of Technology, Allocate+, unit search, course planner",
  openGraph: {
    title: "QUT Classmate | Easy Timetable Planning for QUT Students",
    description:
      "Build your perfect QUT semester schedule with QUT Classmate. Search for units, view class times, and create conflict-free timetables without the hassle of Allocate+.",
    url: "https://qut-classmate.vercel.app/",
    siteName: "QUT Classmate",
    images: [
      {
        url: "/og-image.png", // You'll need to create this image
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
    title: "QUT Classmate | Easy Timetable Planning for QUT Students",
    description:
      "Build your perfect QUT semester schedule with QUT Classmate. Search for units, view class times, and create conflict-free timetables without the hassle of Allocate+.",
    images: ["/og-image.png"], // Same as OG image
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-icon.png", // You'll need to create this
  },
  metadataBase: new URL("https://qut-classmate.vercel.app/"), // Update with your actual URL
    generator: 'v0.dev'
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
        <link rel="canonical" href="https://qut-classmate.vercel.app/" />
        <meta name="google-site-verification" content="RWVD2qcByloMLqvEwbrWD4iJ7XkWenFjb_9MlGf-SnM" />
      </head>
      <body className={`${inter.className} min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <RateLimitProvider>
            {children}
            <Footer />
            <Toaster />
            <StructuredData />
          </RateLimitProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}



import './globals.css'