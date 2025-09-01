// Configuration constants for the QUT Timetable Planner

// QUT API Configuration
export const QUT_API_URL = process.env.NEXT_PUBLIC_QUT_VIRTUAL_API_URL || "https://qutvirtual3.qut.edu.au/qvpublic"

// Rate Limiting Configuration
export const RATE_LIMIT_CONFIG = {
  maxRequests: 15,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  keyPrefix: "rate_limit:",
} as const

// Cache Configuration
export const CACHE_CONFIG = {
  defaultTTL: 3600, // 1 hour in seconds
  timetableTTL: 3600, // 1 hour for timetable data
  reviewsTTL: 300, // 5 minutes for reviews
  keyPrefix: "cache:",
} as const

// Teaching Period Configuration
export const TEACHING_PERIODS = {
  // Semester 1 2025
  "621051": {
    name: "Semester 1 2025 (All Campuses)",
    year: 2025,
    semester: 1,
    useNewAPI: true,
  },
  // Semester 2 2025
  "621052": {
    name: "Semester 2 2025 (All Campuses)",
    year: 2025,
    semester: 2,
    useNewAPI: true,
  },
  // Summer 2024-2025
  "621050": {
    name: "Summer 2024-2025 (All Campuses)",
    year: 2024,
    semester: 3,
    useNewAPI: false,
  },
} as const

// API Endpoints
export const API_ENDPOINTS = {
  qutLegacy: "https://qutvirtual3.qut.edu.au/qvpublic/ttab_unit_search_p.process_search",
  qutNew: "https://mytimetable.qut.edu.au/aplus/rest/timetable/subjects",
  health: "/api/health",
  rateLimit: "/api/check-rate-limit",
  clearCache: "/api/clear-cache",
} as const

// Default values
export const DEFAULTS = {
  teachingPeriodId: "621052", // Default to Semester 2 2025
  maxSearchResults: 100,
  cacheTimeout: 3600,
} as const
