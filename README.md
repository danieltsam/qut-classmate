# QUT Classmate App

**QUT Classmate** is a scheduling and unit planning app built specifically for students at the Queensland University of Technology (QUT). It's designed to solve the frustrations of using Allocate+ and streamline the process of planning your semester. Built using a modern full-stack architecture, the app is performance-optimized and AI-enhanced.

---

### Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Usage](#usage)
- [Technical Overview](#technical-overview)
- [Environment Variables](#environment-variables)
- [Changelog](#changelog)

---

## Overview

QUT Classmate was built to help students more easily search for units, view class options, and build a personalized, conflict-free timetable. You can then export your schedule to a calendar app like Google Calendar. It looks good, works fast, and gets out of your way.

---

## Features

### ✅ Unit Search
- Fast, accurate search by unit code with sortable results table
- Grouped results by class type with clear week info and online/internal tags

### 🗓️ Timetable Creator
- Drag and drop classes into your weekly view with conflict highlighting
- Clean rounded design with sticky layout and export to `.ics` or Google Calendar

### ⚡ Auto Timetable Generator
- Instantly generates thousands of optimized timetable combinations using Monte Carlo simulations
- Smart preferences for unavailability blocks, day distribution, and gap minimization

### 📝 Unit Reviews
- Read and write reviews for units with rating system for difficulty and usefulness
- Search and sort reviews with moderation capabilities

### ☁️ Export / Import
- Export your final timetable as a `.ics` file or sync it with Google Calendar
- Clean UX with animations for smooth transitions

---

## Usage

### 📚 **First-Year Student - Sarah**
Sarah is starting her Exercise Science degree while working part-time at a local gym. She blocks out her work shifts as unavailable times, uses the auto-generator to create multiple timetable options, and exports her chosen schedule to Google Calendar to coordinate with her manager.

### 🎓 **Final-Year Student - Marcus** 
Marcus is completing his Engineering degree while working full-time as a consulting engineer. His workload varies between busy client days and quiet office time, so he uses Unit Search to find all available tutorial times and drops into sessions when work is lighter.

### 📖 **Course Planning - Alex**
Alex is a second-year Business student choosing electives for next semester. He reads unit reviews from other students, compares difficulty and usefulness ratings, tests different timetable combinations, and makes informed enrollment decisions based on both reviews and schedule fit.

---

## Technical Overview

### 🧱 Architecture
- Built on **Next.js 14** with **React Server Components**
- Hybrid architecture of Server and Client Components for performance
- Deployed on **Vercel** with automatic deploys on push to main

### 💾 Caching Strategy
- **Level 1**: Redis (Upstash) for server-side caching (30-day TTL)
- **Level 2**: `localStorage` for instant access to previously viewed units
- Reduces requests to QUT APIs and optimizes response speed

### 📊 Rate Limiting
- **Server-side**: IP/session based, 15 requests per day
- **Client-side**: Throttling requests (2s delay between searches)
- Headers follow standard `X-RateLimit-*` format

### 🛠️ Backend Services
- **Redis** (Upstash) for caching
- **Supabase** for user reviews and storage
- **Vercel KV** and **Edge Functions** for ultra-fast access

### 🔍 Auto Timetable Engine
- Monte Carlo simulation engine with scoring system
- Factors in class completeness, conflicts, unavailability, distribution, and gaps
- See implementation: `components/auto-timetable-generator.tsx`

### 📦 Supabase Integration
- Stores user reviews and ratings with moderation capabilities

---

## How It Was Developed

This app was heavily assisted by AI-powered coding tools, primarily **v0** by Vercel, which helped generate and iterate on core functionality quickly. I worked a fair bit on parsing QUT's public timetable data but AI agents receiving instructions in natural language were used for the rest of the project (manual debugging and fixing stupid code was unfortunately still required). It was an experiment in blending AI speed with human feedback to solve a real student problem that resulted in a working solution within a week which I think is insane!

---

## Changelog

### v1.1
- Added validation for unit code input
- Improved error messaging and toast notifications
- Converted activity types (e.g., `LEC` → `Lecture`)
- Google Calendar integration
- Added transition button to move from unit search → timetable maker
- Timetable hover effects when highlighting an activity type 
- Click-to-expand unit info instead of hover

### v1.2
- Added rate limiting: 15 requests/day per user (checking cookies secondarily + IP primarily)
- Timetable class uniqueness: fixed duplicate selections
- Sticky timetable view on scroll
- Saved unit cache in `localStorage`, cleared when not used. Will allow a new unit data request every 96 hours. This also reduces serverless api calls on Vercel.
- Added loading animations and section fade-ins
- Improved hover effects for timetable cells
- Allowing for overlaps in timetable by making them side-by-side.

### v1.3
- Added server-side caching with Redis/Vercel KV for faster responses
- Improved rate limiting with better error handling
- Extended client-side cache duration to 30 days
- Optimized data fetching with multi-level caching strategy
- Added detailed console logging for debugging and to check where data is coming from
- Enhanced scrollbar styling for better visibility and interaction

### v1.4
- Renamed "Timetable Maker" to "Timetable Creator"
- Added support for specific week patterns (single weeks, ranges, etc.)
- Improved conflict detection and display to only warn about overlaps in the same weeks
- Added unit code autocomplete by scraping 4000 QUT Units and using in a search dropdown

### v1.5
- Added Auto Timetable Generator to automatically create optimal schedules
- Improved warnings for missing classes in auto-generated timetables
- Fixed issue where selected classes weren't being added to search history
- Optimized display of 1-hour classes to fit more information
- Fixed API compatibility for new QUT timetable system in Semester 2, 2025

---

Thanks for checking out QUT Classmate! Built by a student, for students. 🚀
\`\`\`
