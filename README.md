# QUT Classmate App

**QUT Classmate** is a scheduling and unit planning app built specifically for students at the Queensland University of Technology (QUT). It's designed to solve the frustrations of using Allocate+ and streamline the process of planning your semester.

---

### Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Usage](#usage)
- [How It Was Developed](#how-it-was-developed)
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
- Button to view the unit directly in the Timetable Maker
- Grouped results by class type with clear week info and online/internal tags
- Sortable and rounded results table

### 🗓️ Timetable Maker
- Select the classes you want, drag and drop them into your weekly view
- Conflicts highlighted (but not blocked)
- Class-type highlighting on hover
- Clean rounded design with sticky timetable layout
- Export your plan to `.ics` or Google Calendar
- Toggle between light and dark mode with cool animations

### ☁️ Export / Import
- Export your final timetable as a `.ics` file or sync it with Google Calendar
- Each class exports individually and accurately
- Animations and clean UX for transitions

---

## Usage

1. **Search for Units**: Enter a valid QUT unit code (e.g. CAB202).
2. **Add to Timetable**: Select class times that work for you.
3. **Preview**: See your week view and adjust as needed.
4. **Export**: Download an `.ics` or sync directly to Google Calendar.
5. **Theme Toggle**: Use the switch to go light/dark with a smooth animated fade.


---


## How It Was Developed

This app was heavily assisted by AI-powered coding tools, primarily **v0** by Vercel, which helped generate and iterate on core functionality quickly. I worked a fair bit on parsing QUT's public timetable data but AI agents were used for:
- Building interactive UI components
- Improving accessibility and animations
- Designing calendar export features

It was an experiment in blending AI speed with human feedback to solve a real student problem that resulted in a working solution within a day which I think is insane!

---

## Environment Variables

The application uses the following environment variable:

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_QUT_VIRTUAL_API_URL` | The URL for QUT Virtual's timetable API | `https://qutvirtual3.qut.edu.au/qvpublic/ttab_unit_search_p.process_search` |


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
- Added rate limiting: 15 requests/day per user (checking cookies secondarily + IP primarily) to be a responsible user of the public QUT website.
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
---

Thanks for checking out QUT Classmate! Built by a student, for students. 🚀
