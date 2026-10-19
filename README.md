# Stageverse Crowd Rehearsal

Build the core StageVerse feature: a realistic, interactive 3D virtual audience for stage-performance practice. Create a full-screen 3D auditorium using lightweight Three.js/react-three-fiber, with animated audience members who walk around, talk in small groups, clap, cheer, laugh, criticize, or support the performer through animations and speech bubbles.

Before starting, let users configure audience size, number of supporters (“Lovers”) and critics (“Haters”), with the remaining audience neutral. Validate counts so their total never exceeds the audience size. Let users start, pause and reset the simulation.

Make audience behaviour visibly distinct: supporters cheer and encourage; critics display skeptical expressions and occasional critical comments; neutral people talk, walk, or watch. Add realistic ambient crowd audio where feasible, with mute and volume controls.

Use a polished, cinematic 3D auditorium, stage lighting, depth, natural-looking movement and responsive controls for mobile and desktop. Use procedural animations and lightweight assets; avoid paid APIs, API keys, backend dependencies and unnecessary packages. Ensure the scene actually renders and interactions work, with graceful fallbacks for unsupported devices.

Scope: implement this working audience simulator only. No VR, eye-contact tracking, webcam analysis, or unrelated features. Prioritize functionality and performance over decorative UI. Reuse existing project components and styling wherever possible; do not rebuild the entire app.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/59716446-7068-4d64-9bb3-1ef2d93a200f).

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
