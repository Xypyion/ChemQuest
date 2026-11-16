# StoiVenture design direction

The student side of StoiVenture, as the owner asked for it: **a Valorant-style game menu, in the game's own colours.** This file is the direction the skin in `public/css/arena.css` is built from. The teacher console is not covered; it keeps its own look.

**Design read:** a classroom chemistry game for Thai secondary students, in a tactical game-lobby language.
**Dial: ENERGY 3 / RHYTHM 2 / MOTION 2.**

## The decisions, and the reason for each

| Decision | Reason |
|---|---|
| **Sky gradient as the ground** | It is the game's existing world. The owner asked to keep the colours. |
| **Ink `#241e3a` for the top bar, panels and text on fills** | One dark anchor makes the bright world readable. White on it measures 15.9:1. |
| **Brand pink as the only accent** | It marks two things and nothing else: the primary action on a screen, and "this is you / this is current". Where it carries white text it uses the dark pink `#c81f57` (5.5:1); the brighter pink is for large display type only. |
| **Green, yellow, grey on levels** | State, not decoration: done, open, locked. Each state also has its own icon (tick, number, padlock), so colour is never the only signal. |
| **Gold, silver, bronze on badges** | The tier a badge was earned at: 90%+, 75%+, pass. |
| **Hexagon as the motif** | A benzene ring. It is the one shape that says "chemistry", so it is used for the things a student collects and moves through: level markers, badges, the stage their character stands on. |
| **Diagonal slab** | The angular gesture of a game menu, used twice: behind every page, and on the profile banner. |
| **Bebas Neue for titles** | Tall condensed capitals are the voice of the game menu the owner asked for. Display sizes only. |
| **Chakra Petch for labels and buttons** | A squared technical face that also has Thai, so both languages share one voice. Thai text is never letter-spaced. |
| **Cut corner on buttons and the mission panel** | The cut corner means "this is an action". Content cards stay square so the two read differently. |
| **Faint graph grid, on the map board only** | The map is a board the levels are plotted on, for a course about quantities. Nowhere else has a grid. |
| **Shadow only on things that float** | The sticky top bar, toasts, the phone tab bar, the bottom sheet, the "your rank" bar. Everything else sits flat with a 1px line. |
| **No endless animation** | Motion marks a moment: a view opening, a badge being won, confetti on a pass. The one loop left is the quiz timer in its last ten seconds, which is a real warning. |

## What was asked for, and kept on purpose

- **It looks like a Valorant menu.** That is the brief, not an accident.
- **Capital letters in the menu and titles.** Part of that brief. Small descriptive labels are sentence case.
- **A dark top bar on a light page.** The bar is the HUD. The page stays light because this is a classroom tool used in daylight.
