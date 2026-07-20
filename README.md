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

### 1. Turn on Google Sign-In

**Authentication → Sign-in method → Add new provider → Google → Enable → Save.**

Then, still in the Authentication section: **Settings tab → Authorized domains → Add domain**, and add your GitHub Pages domain (`<your-username>.github.io`). Without this step, sign-in will fail with an "unauthorized domain" error, Firebase only allows sign-in popups from domains you've explicitly approved.

### 2. Lock down the database rules

In the Firebase console: **Realtime Database → Rules**, replace the contents with:

```json
{
  "rules": {
    "homeworkBoard": {
      ".read": "auth != null && (auth.token.email == 'chris.brasch@gmail.com' || auth.token.email == 'maria.brasch09@gmail.com' || auth.token.email == 'carlislerubio07@gmail.com' || auth.token.email == 'oliverbrasch@gmail.com')",
      ".write": "auth != null && (auth.token.email == 'chris.brasch@gmail.com' || auth.token.email == 'maria.brasch09@gmail.com' || auth.token.email == 'carlislerubio07@gmail.com' || auth.token.email == 'oliverbrasch@gmail.com')",
      "feedback": {
        "$entryId": {
          ".validate": "!data.exists() && newData.hasChildren(['from','category','message','timestamp'])",
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

Click **Publish**. This is a real change from before: previously anyone with the page URL could read and write the board; now the database itself rejects any request that isn't signed in as one of these four specific email addresses, checked server-side by Firebase, not just gated by the app's UI. This is what actually secures the data, not just the page.

The `feedback` block still does its job underneath that: it stops anyone (even an allowed family member, by mistake or otherwise) from editing or deleting an existing feedback entry, and rejects malformed submissions.

**Bonus**: this also fully closes the feedback-spam concern from before. With writes restricted to four specific signed-in accounts, there's no path left for an anonymous bot to write anything at all, the client-side throttle and validation rules are now backup layers rather than the main defence.

To add a fifth person later, or change an email, edit this rules block (adding another `|| auth.token.email == '...'` clause) and re-publish, no code changes needed.

### 3. Add the repository secret (the parent PIN)

Gates "Reset board", "Upload new calendar", "Restore original calendar", and "View feedback" to just the two of you.

**Settings → Secrets and variables → Actions → New repository secret**
- Name: `RESET_PIN`
- Value: whatever code you want

The PIN itself never appears in the repo or the live site, only its SHA-256 hash gets baked into `app.js` at deploy time.

### 4. Add the files to your repo

Upload all of these, keeping the structure:
- `index.html` → repo root
- `styles.css` → repo root
- `app.js` → repo root
- `data.json` → repo root
- `README.md` → repo root
- `deploy.yml` → **must go inside `.github/workflows/`** (type the full path `.github/workflows/deploy.yml` in GitHub's "Add file" box so it creates the folders)

### 5. Switch Pages to deploy via GitHub Actions

**Settings → Pages → Build and deployment → Source → GitHub Actions.**

### 6. Trigger the first deploy

Any push to `main` runs the workflow. Check the **Actions** tab to watch it (about a minute), then the site's live at:

```
https://<your-username>.github.io/<repo-name>/
```

## Signing in

First visit, everyone sees a sign-in screen, "Sign in with Google". Only the four emails in the database rules can get past it, anyone else's Google account gets a clear "you're not on the family list" message and is signed straight back out.

Once signed in, it stays signed in on that device/browser (standard Google session persistence), no need to sign in again each visit. **Menu → Sign out** if someone wants to switch accounts or sign out of a shared device.

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

The thumbs-up-down button (bottom-right, always visible) lets anyone signed in send feedback, no PIN needed to submit, just a valid family sign-in (which everyone using the board already has by this point). It asks who it's from, what kind of thing it is (idea/bug/something's wrong), and a message, then saves straight into Firebase.

**Menu → View feedback** (PIN-gated) shows the full history, newest first. Since there's no automatic notification (no email, no push), checking that menu occasionally is the only way you'll see new feedback, worth building into a habit, or ask Claude about the notification options discussed earlier if that turns out to be a problem in practice.

### About spam protection

Now that the whole board sits behind Google Sign-In restricted to your four family emails (see step 1-2 above), this is largely a solved problem, no anonymous account can write anything at all, feedback included. Two lighter layers still sit underneath as backup, mostly to catch accidental issues rather than real attacks:

1. **Client-side throttle** — one submission per 30 seconds per browser.
2. **Database rules validation** (the `feedback` block in step 2 above) — rejects malformed or oversized entries, and stops any entry from being edited after creation.

If one of the four accounts were ever compromised, that's a different (and much smaller) problem than open public access, and standard Google account security (2FA, etc.) is the relevant defence there, not something this app needs to handle itself.

## Changing the PIN later

Update the `RESET_PIN` secret, then re-run the workflow from the **Actions** tab (or push any small change to `main`).

## Forgot the PIN entirely?

Reset by hand instead: Firebase console → **Realtime Database** → delete the `homeworkBoard/status` node to clear the board, or `homeworkBoard/customData` to fall back to the bundled calendar.

## Holidays and shared dates

Dates that apply to both boys (school-wide holidays, pupil-free days) are stored once with `"kid": "BOTH"` rather than duplicated per child, so they only ever show up once in the "Upcoming" ribbon regardless of which kid filter is selected.

## How the sync works

Everyone's board reads and writes to the same Firebase paths (`homeworkBoard/status`, `homeworkBoard/hidden`, `homeworkBoard/customData`, `homeworkBoard/subjectVisibility`, `homeworkBoard/feedback`). Card moves, removed cards, calendar uploads, subject toggles, and feedback all update live, no refresh needed. Reset, Upload, Restore, and viewing feedback are PIN-gated — dragging, ticking off, removing/restoring cards, toggling subjects, and *submitting* feedback work for anyone. Since the database rules already cover the whole `homeworkBoard` path (step 1 above), nothing extra needs enabling for feedback to work.
