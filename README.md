# skool.ai — Homework Board

A shared kanban board for tracking school assessments (drafts, finals, exams) for Year 7 and Year 11. Card positions sync live across everyone who has the page open, via Firebase Realtime Database.

## File layout

The app is now split into separate files instead of one big HTML file:

| File | What it is |
|---|---|
| `index.html` | Page structure only |
| `styles.css` | All styling |
| `app.js` | All logic (Firebase, rendering, the gremlin, PIN checking) |
| `data.json` | The bundled/default assessment calendar |
| `.github/workflows/deploy.yml` | Deploys the site and bakes in the PIN hash |

## Setup (one-time)

### 1. Lock down the database rules

In the Firebase console: **Realtime Database → Rules**, replace the contents with:

```json
{
  "rules": {
    "homeworkBoard": {
      ".read": true,
      ".write": true,
      "feedback": {
        "$entryId": {
          ".write": "!data.exists()",
          ".validate": "newData.hasChildren(['from','category','message','timestamp'])",
          "from": { ".validate": "newData.isString() && newData.val().length <= 40" },
          "category": { ".validate": "newData.isString() && newData.val().length <= 40" },
          "message": { ".validate": "newData.isString() && newData.val().length <= 600" },
          "timestamp": { ".validate": "newData.isNumber()" },
          "$other": { ".validate": false }
        }
      }
    },
    "$other": {
      ".read": false,
      ".write": false
    }
  }
}
```

Click **Publish**. This scopes access to only the `homeworkBoard` path and blocks everything else. There's no login on this app, so anyone with the page URL can still edit cards — reasonable for a family tool, just worth knowing.

The extra `feedback` block does two specific things: it stops anyone from overwriting or deleting an *existing* entry (each one can only be created once, never edited afterwards), and it rejects anything that doesn't match the expected shape, no giant messages, no extra junk fields, no wrong data types. It's a genuine guard against malformed or oversized submissions. It does **not** stop someone from submitting many small valid entries quickly, that's a different problem (see "About spam protection" below).

### 2. Add the repository secret (the parent PIN)

Gates "Reset board", "Upload new calendar", "Restore original calendar", and "View feedback" to just the two of you.

**Settings → Secrets and variables → Actions → New repository secret**
- Name: `RESET_PIN`
- Value: whatever code you want

The PIN itself never appears in the repo or the live site, only its SHA-256 hash gets baked into `app.js` at deploy time.

### 3. Add the files to your repo

Upload all of these, keeping the structure:
- `index.html` → repo root
- `styles.css` → repo root
- `app.js` → repo root
- `data.json` → repo root
- `README.md` → repo root
- `deploy.yml` → **must go inside `.github/workflows/`** (type the full path `.github/workflows/deploy.yml` in GitHub's "Add file" box so it creates the folders)

### 4. Switch Pages to deploy via GitHub Actions

**Settings → Pages → Build and deployment → Source → GitHub Actions.**

### 5. Trigger the first deploy

Any push to `main` runs the workflow. Check the **Actions** tab to watch it (about a minute), then the site's live at:

```
https://<your-username>.github.io/<repo-name>/
```

## Uploading a new calendar (e.g. next year)

No GitHub or code needed for this bit. From the **≡ menu** in the app itself:

1. Click **Upload new calendar…**
2. Enter the parent PIN when prompted
3. Choose a `.json` file in the same format as `data.json` (an array of objects, each with `date`, `day`, `kid`, `subject`, `type`)
4. Confirm — it replaces the calendar for everyone, on every device, instantly, no redeploy needed

The file gets validated before anything is saved (checks dates are `YYYY-MM-DD`, days are `Mon`–`Sun`, and `type` is one of `DR`/`FI`/`EX`/`EV`), so a malformed file gets rejected with a specific error rather than breaking the board.

To go back to the bundled `data.json`, use **Restore original calendar** from the same menu (also PIN-gated).

**Where does a new file come from?** Send the new school PDF calendar to Claude and ask for a `data.json` in this app's format — it'll hold the same date-parsing care as the original (weekday cross-checked against the actual calendar date, holidays that apply to both kids merged into one entry instead of listed twice).

**About `subjectGroup`:** each non-holiday item can optionally include a `subjectGroup` field — a short, clean subject name (e.g. `"Music"`, `"Biology"`) separate from the longer task description in `subject` (e.g. `"Music FIA3 Project"`). This is what powers **Manage subjects** (see below). If it's missing, the app makes a reasonable guess from the task text, but including it explicitly gives more reliable grouping, especially for a fresh year's calendar. Ask Claude to include it when generating a new `data.json`.

## Managing which subjects show up

From the **≡ menu → Manage subjects**, each student's subjects list with an on/off switch. Turning a subject off hides every card for that subject, for everyone, until switched back on, useful when a new year's calendar includes electives one of the boys doesn't actually take. New subjects (e.g. after uploading a fresh year's calendar) default to **on** until someone turns them off.

## Feedback

The thumbs-up-down button (bottom-right, always visible) lets anyone send feedback, no PIN needed to submit. It asks who it's from, what kind of thing it is (idea/bug/something's wrong), and a message, then saves straight into Firebase.

**Menu → View feedback** (PIN-gated) shows the full history, newest first. Since there's no automatic notification (no email, no push), checking that menu occasionally is the only way you'll see new feedback, worth building into a habit, or ask Claude about the notification options discussed earlier if that turns out to be a problem in practice.

### About spam protection

Because feedback can be submitted by anyone with the page URL, no login required, there's a real (if low-probability, for a small family app) risk of it being spammed. Three layers are in place, roughly weakest to strongest:

1. **Client-side throttle** — one submission per 30 seconds per browser. Trivial for anyone determined to bypass (clearing browser storage, or just hitting Firebase directly), but stops accidental double-sends and casual spam.
2. **Database rules validation** (the `feedback` block in step 1 above) — rejects malformed or oversized entries, and stops any entry from being edited after creation. Real protection against garbage data, not against submission *volume*.
3. **Nothing yet stops a determined attacker from writing many valid, small entries quickly.** If that ever becomes an actual problem (not a hypothetical one), the proper fix is **Firebase App Check** with reCAPTCHA — a free Google service built exactly for this, blocking non-browser/bot traffic at the database level before it even reaches your rules. It needs a one-time reCAPTCHA site key, a small script added to `index.html`, and enforcement turned on in the Firebase console. It's a genuine step up in setup complexity from everything else in this app, so it's not included by default, ask if you want it added.

## Changing the PIN later

Update the `RESET_PIN` secret, then re-run the workflow from the **Actions** tab (or push any small change to `main`).

## Forgot the PIN entirely?

Reset by hand instead: Firebase console → **Realtime Database** → delete the `homeworkBoard/status` node to clear the board, or `homeworkBoard/customData` to fall back to the bundled calendar.

## Holidays and shared dates

Dates that apply to both boys (school-wide holidays, pupil-free days) are stored once with `"kid": "BOTH"` rather than duplicated per child, so they only ever show up once in the "Upcoming" ribbon regardless of which kid filter is selected.

## How the sync works

Everyone's board reads and writes to the same Firebase paths (`homeworkBoard/status`, `homeworkBoard/hidden`, `homeworkBoard/customData`, `homeworkBoard/subjectVisibility`, `homeworkBoard/feedback`). Card moves, removed cards, calendar uploads, subject toggles, and feedback all update live, no refresh needed. Reset, Upload, Restore, and viewing feedback are PIN-gated — dragging, ticking off, removing/restoring cards, toggling subjects, and *submitting* feedback work for anyone. Since the database rules already cover the whole `homeworkBoard` path (step 1 above), nothing extra needs enabling for feedback to work.
