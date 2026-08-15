# PainLess

# PRODUCT SPECIFICATION & APP ARCHITECTURE PROMPT



## APP NAME

PainLess



## OVERVIEW

You are an expert mobile app developer building a clean, native-feeling Android application using Kotlin and Jetpack Compose. The core philosophy of "PainLess" is minimalist utility, extreme ease of use, and a frictionless UI. There must be zero bloat, zero clutter, and no unnecessary configuration. The entire application operates 100% offline using a local SQLite/Room database to ensure total health data privacy.



---



## 1. DESIGN & STYLE SYSTEM

*   **Theming:** Implements a soothing, pure black Dark Mode by default to protect light-sensitive eyes during an active headache. A clean white Light Mode can be toggled via Settings.

*   **Color Palette:**

    *   Pain-Free / Neutral: Faint Green or Light Blue

    *   Mild Pain: Soft Yellow (Hex: #F1C40F or similar)

    *   Moderate Pain: Orange (Hex: #E67E22 or similar)

    *   Severe Pain: Muted, deep Red (Hex: #C0392B or similar)

*   **Interface Feel:** High-performance, fluid, buttery-smooth screen transitions (200-300ms animations). Large tap targets. Everything should feel instant.



---



## 2. DATABASE SCHEMA (Room Database)

*   **User Profile Table:** Name (String), Age (Integer), Gender (String).

*   **Log Entries Table:** Date (LocalDate, Primary Key), HasHeadache (Boolean), Severity (String - "Mild", "Moderate", "Severe", or NULL if false).



---



## 3. CORE SCREEN LAYOUTS & USER FLOWS



### SCREEN 1: THE HOME CHECK-IN

*   **Core Logic:** The user opens the app and should complete their logging in under 3 seconds. 

*   **UI Elements:**

    *   Large, centered, prominent prompt text: "Did you have a headache today?"

    *   Two oversized, easy-to-tap buttons stacked vertically or side-by-side: [ YES ] and [ NO ].

*   **Interaction Flow:**

    *   If [ NO ] is clicked: Instantly write a record (`HasHeadache = false, Severity = NULL`) to the database for today's date, play a subtle checkmark success animation, and change the UI state to a "Logged!" screen. No submission button required.

    *   If [ YES ] is clicked: Smoothly slide into the Severity Selector overlay or sub-screen.



### SCREEN 2: SEVERITY SELECTOR

*   **UI Elements:**

    *   Prompt: "How severe was it?"

    *   Three large horizontal bars or buttons color-coded by severity:

        *   [ Mild ] (Soft Yellow)

        *   [ Moderate ] (Orange)

        *   [ Severe ] (Muted Red)

*   **Interaction Flow:**

    *   Tapping an option instantly saves the entry (`HasHeadache = true, Severity = SelectedValue`) for today's date and immediately executes a save confirmation animation, returning the user to the home screen context.



### SCREEN 3: HISTORY & EDITING

*   **UI Elements:** A minimal, clean monthly grid calendar view.

*   **Visual States:** 

    *   Days with a recorded headache are marked with a distinct solid dot corresponding to the severity color (Yellow, Orange, Red).

    *   Days with a "No Headache" log are marked with a faint green dot.

    *   Unlogged days are left plain gray.

*   **Editing Logic:** Tapping any calendar day pops open a clean bottom sheet or modal showing that day's log state. The user can change the severity, change "Yes" to "No", or delete the entry entirely. The calendar view must immediately update its visual state reflecting the change.



### SCREEN 4: ANALYSIS & STATS

*   **Date Filters:** A top row of neat "pill" buttons containing: `[ 7 Days ]`, `[ 30 Days ]`, and `[ Custom Range ]`. 

    *   `7 Days` is pre-selected by default.

    *   Tapping `Custom Range` brings up a standard Android date calendar picker allowing the user to select custom start and end dates.

*   **Smart Gap-Checking Tool (Crucial Feature):**

    *   Before calculating statistics, the app runs a background loop checking the selected date range.

    *   If there are calendar dates in that range with *no database entry*, display a prominent but elegant warning card directly below the date selectors: 

        *   *Text:* "You have X unlogged days in this period."

        *   *Button:* `[ Mark all as 'No Headache' ]`

    *   *Action:* Tapping the button batch-inserts a "No Headache" entry for all those empty dates instantly in a single transaction, dismisses the warning card, and dynamically re-renders the stats on the screen.

*   **Data Layout:**

    *   Display two big numbers side-by-side: **Total Headache Days** and **Pain-Free Days**.

    *   Display a vertical "Severity Breakdown" section showing the percentage of each type alongside absolute days (e.g., "Moderate: 50% (6 Days)"). 

    *   At the bottom, place a prominent button: `[ Export Summary as JPG ]`.



### SCREEN 5: SETTINGS & DETAILS

*   **Personal Details Section:** Input fields for Name, Age, and Gender. Users can tap to edit these details at any point. They are saved directly into the local user profile database table.

*   **Reminders:** A clean time-picker to schedule a daily push notification. Implement interactive notifications: the push notification itself must display quick-action buttons `[ Yes ]` and `[ No ]` directly on the lock screen. Clicking `No` logs a pain-free day via background broadcast receiver without loading the app foreground UI; clicking `Yes` loads the app directly into the Severity Selector screen.

*   **Database Backup:** Two simple buttons: `[ Export Database File ]` (saves the raw SQLite/Room file to the user's Downloads or Document folder) and `[ Import Database File ]` (restores data from a previously saved file).



---



## 4. INFOGRAPHIC EXPORT SPECIFICATIONS

When the user clicks `[ Export Summary as JPG ]` on the Analysis screen, the app must programmatically construct a canvas layout, render the current filter metrics, convert it to a static Bitmap image file, and save it to the Android MediaStore under the Pictures/Gallery directory.



**Visual Layout Requirements for the JPG File:**

1.  **Strict Color Rule:** The exported picture MUST use a clean, sharp **white background with dark charcoal/black text and bold typography**. It must be explicitly printer-friendly so physicians can print or scan it without destroying printer ink.

2.  **Layout Orientation:** Structured vertically (Portrait 4:3 or 16:9 aspect ratio).

3.  **Zone 1: Header Context:** 

    *   Top Left: "PainLess App Summary" (Small, light-gray typography).

    *   Center: Bold, highly readable date range: "**[Start Date] to [End Date]**".

    *   Top Right: A physical text entry line stating: "`Patient Name: [Database Saved Name value or blank underline if empty]`" followed by custom entries for Age and Gender.

4.  **Zone 2: Big Picture Frequency Metrics:**

    *   Two columns containing massive large-font metrics. Left: **Total Headache Days** (styled in soft crimson/red text). Right: **Pain-Free Days** (styled in deep green or slate blue text).

5.  **Zone 3: Severity Breakdown Bars:**

    *   Heading: "Severity Breakdown"

    *   Three solid horizontal stacked progress-style bars indicating proportional percentage. Mild (Yellow), Moderate (Orange), Severe (Red). 

    *   Each bar must have explicit label text overlayed or adjacent: "Mild: 25% (3 Days)".

6.  **Zone 4: Pattern Matrix Chart:**

    *   A grid array layout representing a chronological sequence of squares for every calendar day in the selected date range. 

    *   Squares are color-coded directly to match data states: Grey (Unlogged), Green (Pain-free day), Yellow (Mild), Orange (Moderate), Red (Severe).



---



## 5. GENERATION INSTRUCTIONS

Please build out the app logic, screens, local Room database pipelines, and UI layer components sequentially. Prioritize clear state management so that clicking bulk log buttons or editing the history calendar dynamically triggers updates across screens flawlessly. Start by showing the codebase structure or primary application UI layout code.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bepainless.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e825bf24-2d21-4003-9b14-bedf3e91b435).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
