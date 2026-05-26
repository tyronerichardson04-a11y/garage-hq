# Garage HQ — Claude Code Guide

## Project Overview
Multi-vehicle repair and maintenance tracker. Vanilla JS + Vite + Supabase + Netlify.
Separate Supabase project from the Charger RT planner.

## Project Location
`C:\Users\lilsa\Documents\Claude Code\garage-hq\`

## File Structure
```
index.html
netlify.toml
supabase-setup.sql    ← run this in the new Supabase project SQL editor
src/
  main.js             ← app boot, state, routing, add-vehicle modal
  style.css           ← all styles (dark industrial theme, no frameworks)
  data.js             ← static arrays: repairTemplates, CATEGORIES, etc.
  lib/
    supabase.js       ← Supabase client
    auth.js           ← sendMagicLink, signOut, getSession, onAuthChange
  components/
    Sidebar.js        ← sidebar render + status dot logic
    VehicleCard.js    ← vehicle card (future fleet-grid view)
    ProjectCard.js    ← project card render + badge helpers
    TaskRow.js        ← task row render
    DueRow.js         ← due maintenance row + urgency logic
    Modal.js          ← showToast, openModal, closeModal, bindModalClose
  pages/
    Dashboard.js      ← vehicle detail view, log repair, project panel
    Schedule.js       ← all-vehicle schedule view grouped by urgency
    Spend.js          ← per-vehicle accordion spend summary
```

## Dev Commands
```bash
npm run dev     # localhost:3001
npm run build   # production build to dist/
```

## Supabase Setup (kingdomfit project — shared with Charger planner)
Tables are prefixed `garage_hq_` to coexist with `planner_users` / `planner_tasks`.
1. Open the kingdomfit project SQL editor (iglljahivmmzpmgzfroc)
2. Run `supabase-setup.sql` — creates all 6 tables, RLS policies, seeds templates,
   and adds the `get_user_id_by_email` function for vehicle sharing
3. Under Auth → URL Configuration, add the new Netlify site URL to Redirect URLs
   (localhost:3001 may already be there from Charger planner)

## Environment Variables
```
# Same values as Charger planner — kingdomfit project
VITE_SUPABASE_URL=https://iglljahivmmzpmgzfroc.supabase.co
VITE_SUPABASE_ANON_KEY=<same anon key as charger-repair-planner>
```
Set these in Netlify → Site settings → Environment variables AND create a `.env` locally.

## Netlify Deployment
```bash
# First deploy via Netlify CLI or connect GitHub repo
netlify deploy --build --prod
```
- Build command: `npm run build`
- Publish directory: `dist`
- The `netlify.toml` already handles SPA redirect rules

## Design Tokens (CSS variables in style.css)
```
--bg-primary:   #0d0d0f
--bg-surface:   #111114
--border:       #1e1e22
--gold:         #e8b84b
--red:          #e05050
--amber:        #e8a030
--green:        #3dba72
--blue:         #4499e8
--purple:       #9966e8
```

## State Architecture
All state lives in `state` object in `main.js`:
- `ownedVehicles` / `sharedVehicles` — fetched on every `renderApp()`
- `tasksByVehicle` — flat map of vehicleId → tasks array (used for status dots + schedule)
- `activeVehicleId` — persists across page navigation
- `activePage` — 'fleet' | 'schedule' | 'spend'

`refreshApp()` re-runs `renderApp()` which re-fetches everything. No local cache, always fresh.

## Supabase Tables
- `vehicles` — one row per car
- `vehicle_members` — sharing (role: owner/editor/viewer)
- `repair_templates` — public read seed data
- `repair_projects` — per-vehicle projects with status/priority/budget
- `repair_tasks` — individual service records; `next_due_date` / `next_due_mileage` drive the schedule
- `parts_list` — parts tracked per project

## Common Tasks

### Add a new field to the Log Repair modal
Edit `logRepairModalHTML()` in `src/pages/Dashboard.js` → add input → add to `payload` object in `lr-save` click handler.

### Change status dot urgency thresholds
Edit `computeStatusDot()` in `src/components/Sidebar.js`.
Edit `getDueUrgency()` in `src/components/DueRow.js` (also controls Schedule page grouping).

### Add a new page/tab
1. Add tab button in `renderApp()` topbar in `src/main.js`
2. Add page module in `src/pages/`
3. Add case to `renderPage()` switch in `src/main.js`

### Vehicle sharing — get_user_id_by_email RPC
The share-by-email feature calls `supabase.rpc('get_user_id_by_email', { email_input })`.
You need to create this function in Supabase:
```sql
create or replace function get_user_id_by_email(email_input text)
returns uuid
language sql
security definer
as $$
  select id from auth.users where email = email_input limit 1;
$$;
```
