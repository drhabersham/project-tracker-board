# Simple Project Tracker Board

A lightweight board-style tracker built with plain HTML, CSS, and JavaScript.

## Features

- Three-column board: To Do, In Progress, Done
- Add, move, and delete tasks
- Drag and drop on desktop
- Mobile-friendly layout
- Local browser saving
- Share-link support so you can open the same board state on another device
- Optional auto sync with Supabase

## Run locally

Open `/Users/sheridahabersham/Documents/project-tracker-board/index.html` in a browser.

## Use across devices

Deploy this folder to any static host such as GitHub Pages, Netlify, or Vercel.

After you make updates:

1. Click `Copy share link`.
2. Open that link on your other device.
3. The board state will load there and save locally on that device too.

## Auto sync setup

This app now supports automatic cross-device sync using Supabase.

1. Create a Supabase project.
2. In the SQL editor, create a table:

```sql
create table public.boards (
  id text primary key,
  board jsonb not null,
  updated_at timestamptz not null default now()
);
```

3. Allow your app to read and write that table for the anon key you plan to use.
4. Edit [sync-config.js](/Users/sheridahabersham/Documents/project-tracker-board/sync-config.js) with:
   - `enabled: true`
   - your `supabaseUrl`
   - your `supabaseAnonKey`
   - your preferred `boardId`
5. Push the updated files to GitHub Pages.

Once configured, the board will:

- save locally
- push changes automatically
- poll for remote updates every 15 seconds
- refresh when the page becomes active again

## Files

- `index.html` contains the app shell
- `styles.css` contains the visual design and responsive layout
- `app.js` contains the board logic and persistence
- `sync-config.js` contains sync settings
