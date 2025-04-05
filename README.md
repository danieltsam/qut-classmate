# QUT Classmate App

**QUT Classmate** is a student scheduling application designed for students at the Queensland University of Technology (QUT). The app aims to simplify the process of navigating the university timetable system, allowing users to search for units, create their own personalized timetables, and export them for easy integration into calendar apps like Google Calendar.

### Table of Contents:
- [Overview](#overview)
- [Features](#features)
- [How It Was Developed](#how-it-was-developed)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Overview

QUT Classmate was created to help QUT students plan their semester schedules with ease. The application features:
- **Unit Search**: Search for unit timetables based on unit codes.
- **Timetable Maker**: Build a personalized timetable, ensuring no scheduling conflicts.
- **Export & Import**: Export the timetable to .ICS files or directly to Google Calendar.
- **User-Friendly Interface**: A clean, minimalistic UI with Dark Mode enabled by default.

### Key Features:
- Search for units and view detailed class schedules.
- Create and manage a personalized timetable, selecting desired classes.
- Avoid class conflicts by displaying overlapping times.
- Export your timetable to Google Calendar or an .ICS file.
- Hover-over functionality to highlight relevant classes on the timetable.
- Beautiful design with support for both light and dark themes.

---

## Features

### 1. Unit Search:
- **Unit Search** allows you to quickly search for unit timetables using the unit code (e.g., CAB202).
- The app retrieves timetable data and displays it in an easy-to-read format.
- A button to take you to the **Timetable Maker** for a seamless transition.

### 2. Timetable Maker:
- Create your personalized timetable by selecting the units you need.
- The app will automatically prevent scheduling conflicts.
- Hover over activity types (e.g., Lecture, Tutorial, etc.) to highlight all related classes.
- Support for **Dark Mode** and **Light Mode**, with smooth transitions between the two.

### 3. Calendar Export:
- **Export to .ICS**: Allows users to export their timetable to an .ICS file for easy integration with calendar apps.
- **Google Calendar Import**: Import your timetable directly into Google Calendar without needing to manually import the .ICS file.

---

## How It Was Developed

The QUT Classmate App was primarily developed with the help of **AI-powered tools** to accelerate the development process. The project relied heavily on the use of **AI code generation** to generate key features such as:
- Timetable parsing and unit search functionality.
- Dynamic UI creation and responsiveness.
- Calendar integration (including Google Calendar and ICS file exports).
- The application design, with features like Dark Mode and clean layout structures, was generated based on user feedback and AI-driven suggestions for improving usability.

While the AI tools assisted in much of the coding, human input was also pivotal in finalizing the app’s structure, design, and specific features, ensuring it meets the needs of QUT students.

---

## Tech Stack

- **Frontend**: React, Svelte (for the web version), TailwindCSS for styling.
- **Backend**: Node.js (for any server-side operations if needed in the future).
- **APIs**: Integration with Google Calendar API for exporting timetables.
- **Tools**: AI-assisted coding for rapid development and functionality creation.
- **Deployment**: Hosted on Vercel for seamless deployment and easy scaling.

---

## Usage

1. **Search for Units**: Enter a unit code (e.g., CAB202) in the search bar to retrieve its timetable.
2. **Create Timetable**: Select the classes that work for you and add them to your personalized timetable.
3. **Export/Import**: Export your timetable to an .ICS file or directly to Google Calendar.
4. **Themes**: The app starts in Dark Mode by default, but you can switch to Light Mode using the toggle button.

---
## Changelog

Planned Features:
- Autocomplete search for units
- Google Calendar Integration
- Add a button next to each unit result that takes the user to the corresponding class in the Timetable Maker section on Unit Search
- When hovering over the activity types in the timetable (e.g., "LEC" or "PRC"), display all the classes of that activity type on the timetable grid (with 50% opacity for clarity) on Timetable Maker
- The information button for each unit in the Unit Search should be activated when clicked instead of on hover for better user interaction.
- Add more animation ;)

---


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Thank you for checking out the QUT Classmate app! 🎉
