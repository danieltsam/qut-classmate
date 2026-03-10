# <div align="center"> QUT Classmate App </div>

QUT have chosen to authenticate the timetable API endpoint meaning that this project is no longer live. 🥲

**QUT Classmate** is a scheduling and unit planning app built specifically for students at the Queensland University of Technology (QUT). It's designed to solve the frustrations of using Allocate+ and streamline the process of planning your semester. 


https://github.com/user-attachments/assets/eb6b6a82-7f3d-4f40-9c06-48631e5bf17a


---

## Overview

QUT Classmate was built to help students more easily search for units, view class options, and build a personalized, conflict-free timetable. You can then export your schedule to a calendar app like Google Calendar. It looks good, works fast, and gets out of your way.

---

## Features

### Unit Search
- Fast, accurate search by unit code with sortable results table
- Grouped results by class type with clear week info and online/internal tags

### 🗓️ Timetable Creator
- Drag and drop classes into your weekly view with conflict highlightinga
- Clean rounded design with sticky layout and export to `.ics` or Google Calendar

### Auto Timetable Generator
- Instantly generates thousands of optimized timetable combinations using Monte Carlo simulations
- Smart preferences for unavailability blocks, day distribution, and gap minimization

### 📝 Unit Reviews
- Read and write reviews for units with rating system for difficulty and usefulness
- Search and sort reviews with moderation capabilities

### ☁️ Export / Import
- Export your final timetable as a `.ics` file or sync it with Google Calendar
- Clean UX with animations for smooth transitions
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
