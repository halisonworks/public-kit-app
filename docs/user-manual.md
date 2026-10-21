# KIT Apps User Manual

> Last updated for **v0.3.10**.

KIT Apps is a Windows desktop app that turns any AI-generated React component into something you can save, reopen, render live, and ship as its own installer. You paste code, KIT Apps renders it. That's the whole loop.

This manual covers:

1. [What KIT Apps is for](#1-what-kit-apps-is-for)
2. [Installing](#2-installing)
3. [The core workflow at a glance](#3-the-core-workflow-at-a-glance)
4. [Getting code from ChatGPT Canvas](#4-getting-code-from-chatgpt-canvas)
5. [Getting code from Gemini Canvas](#5-getting-code-from-gemini-canvas)
6. [Pasting into KIT Apps](#6-pasting-into-kit-apps)
7. [How to prompt AI for KIT Apps-friendly canvases](#7-how-to-prompt-ai-for-kit-apps-friendly-canvases)
8. [Use cases with example prompts](#8-use-cases-with-example-prompts)
9. [Saving, renaming, organizing](#9-saving-renaming-organizing)
10. [Packaging a canvas as a standalone app](#10-packaging-a-canvas-as-a-standalone-app)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. What KIT Apps is for

You ask ChatGPT or Gemini for "a React dashboard that shows X." It produces a single-file `App.jsx` component. Normally you'd have to spin up a Vite project, install deps, paste, run, five minutes of plumbing per experiment. KIT Apps collapses that to **paste, see**.

It's useful for:

- **Throwaway prototypes**, try ten variants of the same UI in fifteen minutes
- **Living calculators / dashboards**, keep the canvas in your library, reopen it whenever you need it
- **Sharing a working tool**, package the canvas as its own `.msi` installer and hand it to a colleague who doesn't have any developer tools

What it is *not*: a code editor, a debugger, or a project scaffolder. There's no source control inside KIT Apps. If your canvas grows beyond one file, eject the code into a real project.

---

## 2. Installing

1. Download the latest installer from [the KIT Apps releases](https://github.com/halisonworks/halison-software/releases). Look for `KIT.Apps_<version>_x64-setup.exe` (recommended, no admin needed) or `KIT.Apps_<version>_x64_en-US.msi`.
2. Double-click. SmartScreen may warn the build isn't code-signed — click **More info** → **Run anyway**.
3. Installs to `%LOCALAPPDATA%\KIT Apps\` (no admin required).
4. Launch from the Start menu (search "KIT Apps").

---

## 3. The core workflow at a glance

```
   ┌──────────────────────────────┐
   │  ChatGPT / Gemini / Claude   │
   │  generates a React component │
   └──────────────┬───────────────┘
                  │  copy code
                  ▼
   ┌──────────────────────────────┐
   │  KIT Apps: paste → render  │
   │  save to canvas library      │
   └──────────────┬───────────────┘
                  │  optionally
                  ▼
   ┌──────────────────────────────┐
   │  Build Installer → .msi      │
   │  (your canvas as its own app)│
   └──────────────────────────────┘
```

Each canvas is one self-contained `App.jsx` file. KIT Apps compiles it at runtime, fetches any unknown libraries from `esm.sh`, and renders the result inside a sandboxed iframe with full Tailwind JIT (so any class, including arbitrary values like `text-[10px]` or `bg-[#1a73e8]`, works as written).

---

## 4. Getting code from ChatGPT Canvas

ChatGPT's Canvas feature opens a side panel where it generates and edits code in place.

**Steps:**

1. In ChatGPT, prompt with something like *"Build a React component that shows X. Use Tailwind. Single file. Default-export the component."*
2. ChatGPT opens a Canvas with a `.jsx` file.
3. Click **Copy** at the top-right of the Canvas panel (the icon looks like two overlapping rectangles).
4. Switch to KIT Apps. Paste into the editor (see §6).

**What to ask for in the prompt:**

- *"Use only React + Tailwind"* (no Material UI, no Chakra, those add weight without payoff)
- *"Single file, default-export the component"* (KIT Apps expects `export default`)
- *"No external state libs"* (use `useState` / `useReducer`, Redux/Zustand would need extra setup)
- *"Use only `recharts` if you need charts"* (KIT Apps knows about it; it'll auto-load)
- *"Use only `lucide-react` for icons"* (same reason)

If ChatGPT splits the code into multiple files, ask it to *"merge everything into a single `App.jsx`."* KIT Apps renders one component per canvas.

---

## 5. Getting code from Gemini Canvas

Gemini's Canvas works similarly but the layout is different.

**Steps:**

1. Prompt Gemini for a React component (same kind of prompt as ChatGPT, see §7).
2. Gemini opens the Canvas with a code preview.
3. Click the **Copy code** button (top-right of the code block, three-line icon menu in some versions).
4. Switch to KIT Apps. Paste into the editor.

**Gemini quirks to watch for:**

- **Gemini often produces a full HTML document** (`<!DOCTYPE html>...<html>...<body>...`) instead of a React component. As of v0.1.6, KIT Apps detects HTML pastes and renders them as-is in a nested iframe, the HTML's own `<script>`, `<style>`, and Tailwind CDN tags work exactly as in a browser. No conversion needed. Caveat: HTML canvases can't be packaged as standalone Runtime apps yet (Runtime expects React); ask the AI to convert to a React component first if you need the `.msi`.
- Gemini sometimes wraps the code in ` ```jsx ... ``` ` markdown fences when copying. Strip the fences before pasting (KIT Apps doesn't yet, that's a known follow-up).
- Gemini occasionally invents library names that don't exist on `esm.sh`. If the auto-loader can't find a library, KIT Apps shows a `Missing Library: <name>.<member>` placeholder where the component would be, replace the import with a real package or remove the dependency.
- Gemini tends to use `Heroicons` more than `lucide-react`. Either ask it to switch (*"Use lucide-react for icons, not Heroicons"*), or accept that Heroicons will be auto-fetched from `esm.sh` (slower first render).

---

## 6. Pasting into KIT Apps

1. In KIT Apps, click **New** in the top nav. The editor pane opens.
2. Paste the copied code (Ctrl+V).
3. Click **Save Component** (top-right of the editor pane). Give it a name.
4. The canvas appears in the sidebar on the left and renders immediately.

**Re-opening:** click the canvas name in the sidebar.

**Editing:** click the **Edit** button on a canvas card (or the Edit toolbar action) to reopen it in the editor. Save replaces the source while keeping the canvas's name, category, and packaging. This is non-destructive — the original is overwritten only on save.

**Loading from a `.jsx` file on disk:** click **Load**. The desktop app opens a native file picker. The selected file is added as a new canvas in your library.

---

## 7. How to prompt AI for KIT Apps-friendly canvases

A short list of phrases that consistently produce code KIT Apps renders cleanly on the first try:

- **"Single file React component, default export."**
- **"Use Tailwind utility classes for all styling, no styled-components, no CSS modules."**
- **"Use only `react`, `recharts`, and `lucide-react`. If you need anything else, tell me first."**
- **"No build configuration, no `package.json`, no setup instructions, just the component code."**
- **"Use `useState` for state. Don't use Redux, Zustand, or context libraries."**

If you're iterating, you can also ask things like:

- *"Refactor this so it works as a single React component with no external state library."*
- *"Replace the Material UI imports with Tailwind classes."*
- *"Remove all the imports that aren't `react`, `recharts`, or `lucide-react`."*

A short reusable prompt template you can paste into any AI:

> Generate a single-file React component, default-exported. Use only `react`, optionally `recharts` for charts, and `lucide-react` for icons. Style everything with Tailwind utility classes (you can use arbitrary values like `text-[10px]` or `bg-[#1a73e8]`). No external state libraries, no `package.json`, no setup instructions, just the JSX file content.
>
> The component should: **<your description here>**

---

## 8. Use cases with example prompts

### 8.1 Quick dashboard / KPI board

> Build a React dashboard component for a SaaS team. Show four KPI cards (MRR, active users, churn rate, NPS) at the top, a line chart of MRR over the last 12 months below, and a table of the top 5 customers by revenue. Mock the data inline. Tailwind styling, lucide-react icons, recharts for the chart, single file, default export.

KIT Apps loads `recharts` + `lucide-react` from `esm.sh` automatically, no setup needed.

### 8.2 Calculator / what-if model

> Build a React funnel calculator. Inputs: monthly impressions, CPM, CTR, conversion rate, average order value. Outputs: ad spend, leads, customers, revenue, CAC, LTV:CAC ratio. Two scenarios A and B side by side with a "Compare" view. Tailwind + recharts. Single file, default export.

Save it once; reopen whenever you want to plug different numbers in. Package it as a standalone `.msi` and hand the `.msi` to your CMO.

### 8.3 Mockup / design exploration

> Mock up a settings page for a dev tool. Sidebar nav with 6 sections, the active section is "API keys". Show a list of API keys with create/rotate/delete actions, an empty state, and a confirmation modal for delete. No real backend, fake the data. Tailwind, lucide-react icons, single file, default export.

Iterate by asking the AI for variants ("now make it dark mode," "now use a tabbed layout instead of a sidebar"). Save each version as its own canvas, KIT Apps' library acts as a comparison gallery.

### 8.4 Live data viewer

> Build a React component that fetches GitHub trending repositories and shows them as cards. Use the public GitHub API. Loading state, error state, refresh button. Tailwind, lucide-react. Single file, default export.

`fetch` works from inside the iframe like in any browser. The canvas can talk to public APIs, but CORS rules apply (just like a normal web page).

### 8.5 Internal tool / form

> Build a React form for adding a new customer to a CRM. Fields: name, email, plan tier, signup date, notes. Validation: email format, required fields. On submit, log the payload to console. Tailwind, single file, default export.

Useful for showing a teammate "this is what I want the form to look like" before you build the real one in your actual codebase.

### 8.6 Educational / interactive explainer

> Build a React component that explains a concept visually. Show <topic>. Include an interactive control (slider, toggle, or input) the reader can manipulate to see the concept change. Tailwind for styling, recharts if useful. Single file, default export.

Save the canvas, package it as a `.msi`, send it to a student or colleague. They get a self-contained Windows app, no browser, no build step, no terminal.

---

## 9. Saving, renaming, organizing

The sidebar on the left is your canvas library. All canvases live in browser localStorage under the key `gview_canvases_v2` (kept from the ViewR → KIT Apps rename so existing canvases survived the upgrade).

- **Save:** click **Save Component** in the editor. Pick a name.
- **Rename:** right-click (or use the rename icon next to the canvas in the sidebar). Names don't have to be unique, but unique names are easier to scan.
- **Duplicate:** useful when you want to fork a canvas to try a variant without losing the original.
- **Delete:** click the trash icon in the sidebar. There's no undo, the canvas is gone.
- **Search:** there isn't one yet. If your library grows past ~20 canvases, this will start to hurt; on the roadmap.

**Storage location:** localStorage. If you wipe your browser data (or in KIT Apps' case, the WebView2 data folder), saved canvases are lost. There's no export-all-canvases feature yet, workaround: open each canvas, copy the code, save the file manually.

---

## 10. Packaging a canvas as a standalone app

This is the killer feature. Pick a canvas, fill in four fields, click Build Installer, and you get a `.msi` you can hand to anyone with a Windows machine.

### What the result looks like

- A normal Windows app with its own name (e.g. "Sales Calculator")
- Installs to `C:\Program Files\<your bundle ID's manufacturer>\<App Name>\`
- Has its own Start menu entry, its own icon, its own window title
- Opens directly to the canvas, no sidebar, no editor, no library
- Bundles its own copy of React + Tailwind so it works offline (except for any external libraries the canvas uses, which still load from `esm.sh` at runtime, make sure your testers are online for first launch)

### Steps

1. Select the canvas in the sidebar.
2. Open the **Packaging** panel (sidebar, below the canvas selector).
3. Fill in:
   - **App name**, what shows up in the Start menu and window title bar
   - **Window title**, usually the same as app name
   - **Bundle ID**, reverse-DNS, lowercase, no spaces (e.g. `com.acme.salescalculator`)
   - **Icon**, optional; pick a 256×256 PNG. KIT Apps uses a default if you skip this.
4. Click **Validate** to dry-run the metadata.
5. Click **Build Installer**. Packaging takes **seconds** — KIT Apps uses a prebuilt runtime, so no Rust or Node.js compilation happens on your machine.
6. When the build finishes, KIT Apps reports the path to the produced installer (`.exe`). Open Explorer there, double-click to test.

### Requirements on the build machine

None. KIT Apps ships with everything it needs to produce an installer. No Node.js, Rust toolchain, or Visual Studio Build Tools required.

### What gets bundled

- Your canvas (as `App.jsx`)
- The shared runtime renderer (compiled from `src/components/DynamicRenderer.jsx`, `src/utils/runtimeDependencies.js`, etc.)
- Tailwind with the **full** safelist (so every class your canvas uses works, including arbitrary values, hover/focus states, responsive prefixes, the niche color palette)
- A Tauri shell that opens a window directly to the canvas

What does NOT get bundled: external libraries. Recharts, lucide-react, and anything else loaded via `import` in your canvas are still fetched from `esm.sh` at runtime in the produced app. This is a deliberate trade-off, keeps the `.msi` small (~5 MB) at the cost of requiring internet on first launch.

---

## 11. Troubleshooting

### The canvas renders blank / partial

- Make sure the code has `export default <ComponentName>;` at the bottom. KIT Apps looks for the default export to render.
- Check the error pane (red box, top-right of the render area). Compile errors show there.
- If it's a layout issue (responsive grid not kicking in, etc.), confirm the Tailwind classes you're using are valid, typos in arbitrary values (`text-[10ppx]`) silently render with no style.

### "Loading libraries: <name>..." spinner never finishes

The auto-loader is fetching a library from `esm.sh` and it's slow or unreachable.

- Check your internet connection
- Try the canvas again in a few minutes
- If the library doesn't exist, KIT Apps renders a red `Missing Library: ...` placeholder where the component should be, replace the import

### "Runtime Error" with a stack trace

The user code threw at execution or render time. The error message is usually the same as you'd see in a browser console.

- Common culprits: missing `useState` import, wrong icon name from `lucide-react`, calling `useEffect` outside a function component
- Ask your AI to debug: paste the error message back into ChatGPT/Gemini and ask for a fix

### Build Installer fails

- Make sure you are on the desktop app (packaging is not available in the browser)
- Check `%LOCALAPPDATA%\com.halisonworks.kitapps\build-log.txt` for the full log
- If the error mentions a missing file, try restarting KIT Apps — it may have been interrupted mid-download on first run
- [File an issue](https://github.com/halisonworks/public-kit-app/issues) with the contents of `build-log.txt`

### The canvas works in Studio's preview but breaks in the packaged `.msi`

The Studio preview and Runtime build use the same renderer logic, so this is rare. If it happens, the most common cause is a library version drift, Studio's runtime cache has an older version of a library than what `esm.sh` serves the produced app.

Workaround: explicitly pin the version in your canvas (`import x from 'recharts@2.12.7'`).

### PNG export is blurry / cut off

- The export captures the canvas at 2× scale. Very large canvases may exceed the browser's max canvas size, workaround is to reduce the canvas content area before exporting.
- If the bottom of the canvas is cut off, scroll to the bottom of the canvas pane before clicking Export PNG.

### KIT Apps won't launch after install

- Look for `KIT Apps.exe` at `C:\Program Files\Halison\KIT Apps\KIT Apps.exe`. If it's not there, the install failed silently, try uninstalling and reinstalling.
- Check Windows Event Viewer → Application logs for crash reports.
- File an issue at the [GitHub repo](https://github.com/halisonworks/public-kit-app/issues) with the Windows version (`winver`) and any error message.

---

## Reporting bugs / feature requests

[GitHub issues](https://github.com/halisonworks/public-kit-app/issues). Helpful info to include:

- Which step failed
- The canvas code (or a minimal repro)
- Windows version
- KIT Apps version (visible in the Help menu top of the dropdown)
- Whether you were online during the test

For build failures specifically, the streamed log in the UI is the most useful thing to attach.
