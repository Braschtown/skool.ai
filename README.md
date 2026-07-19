# skool.ai

A shared kanban board for tracking school assessments (drafts, finals, exams) for Year 7 and Year 11, Semester 2 2026. Card positions sync live across everyone who has the page open, via Firebase Realtime Database.

## Setup (one-time)

### 1. Lock down the database rules

Right now your database is in test mode, which means it stops allowing reads/writes automatically after 30 days — and until then, it's wide open to the entire internet, not just this app.

In the Firebase console: **Realtime Database → Rules**, replace the contents with:

```json
{
  "rules": {
    "homeworkBoard": {
      ".read": true,
      ".write": true
    },
    "$other": {
      ".read": false,
      ".write": false
    }
  }
}
```

Click **Publish**. This scopes read/write access to only the `homeworkBoard` path this app uses, and blocks everything else in the database. Note this still means anyone who finds the page URL could edit the board — there's no login. That's a reasonable trade-off for a family homework tracker with nothing sensitive in it, but worth knowing.

### 2. Add the files to your repo

Upload both `index.html` and this `README.md` to the root of your GitHub repo (drag-and-drop works fine on github.com, or `git add` / `commit` / `push` if you're using the command line).

### 3. Turn on GitHub Pages

In your repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main, folder: / (root) → Save**.

GitHub will give you a URL like:

```
https://<your-username>.github.io/<repo-name>/
```

It usually takes a minute or two to go live the first time.

## Updating the assessment dates

If the school sends an updated calendar mid-term, send the new PDF back to Claude and ask for a refreshed `index.html` — the assessment data is baked into the file as a small JSON block near the bottom, so the whole file gets regenerated and just needs re-uploading.

## How the sync works

Everyone's board reads and writes to the same `homeworkBoard/status` path in your Firebase Realtime Database. When anyone drags a card or taps an arrow, it updates for everyone else's open tab automatically — no refresh needed.
