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
- Fast, accurate search by unit code (e.g. CAB202)
- See a table of class times, locations, and staff
- Button to view the unit directly in the Timetable Creator
- Grouped results by class type with clear week info and online/internal tags
- Sortable and rounded results table

### 🗓️ Timetable Creator
- Select the classes you want, drag and drop them into your weekly view
- Conflicts highlighted (but not blocked)
- Class-type highlighting on hover
- Clean rounded design with sticky timetable layout
- Export your plan to `.ics` or Google Calendar
- Toggle between light and dark mode with cool animations

### ⚡ Auto Timetable Generator
- Instantly generates thousands of timetable combinations using Monte Carlo simulations
- Automatically selects the most optimised plan based on your preferences
- Preferences include unavailability blocks, day distribution, and gap minimisation
- Conflict detection and smart resolution built-in
- Blazing fast generation (5000+ iterations in under a second)
- Option to keep or discard generated timetables for more control

### ☁️ Export / Import
- Export your final timetable as a `.ics` file or sync it with Google Calendar
- Each class exports individually and accurately
- Animations and clean UX for transitions

---

## Usage

1. **Search for Units**: Enter a valid QUT unit code (e.g. CAB202).
2. **Add to Timetable**: Select class times that work for you.
3. **Preview**: See your week view and adjust as needed.
4. **Auto Generate**: Let the app create an optimal timetable instantly.
5. **Export**: Download an `.ics` or sync directly to Google Calendar.
6. **Theme Toggle**: Use the switch to go light/dark with a smooth animated fade.

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

*repo is currently on v1.4, v1.5 hasn't been uploaded yet.

---

Thanks for checking out QUT Classmate! Built by a student, for students. 🚀
