# skool.ai — Homework Board

A shared kanban board for tracking school assessments (drafts, finals, exams) for Year 7 and Year 11, Semester 2 2026. Card positions sync live across everyone who has the page open, via Firebase Realtime Database.

## Setup (one-time)

### 1. Lock down the database rules

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

Click **Publish**. This scopes access to only the `homeworkBoard` path and blocks everything else. There's no login on this app, so anyone with the page URL can still edit cards — reasonable for a family tool, just worth knowing.

### 2. Add the repository secret (the parent PIN)

This is what gates the "Reset board" button to just the two of you.

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.
- Name: `RESET_PIN`
- Value: whatever code you want (a 4+ digit PIN, or a short phrase — either works)

Nobody, including you, will be able to see this value again once saved — that's normal, GitHub secrets are write-only. If you ever forget it, just create a new secret with the same name to overwrite it.

**Important:** the PIN itself never appears in the repository or the live site. Only its SHA-256 hash gets baked into the page during deployment (see the workflow below), so even someone reading the site's source code can't recover the actual PIN, only confirm a guess against the hash.

### 3. Add the files to your repo

Upload these three files, keeping the folder structure:
- `index.html` → repo root
- `README.md` → repo root
- `deploy.yml` → **must go inside a folder named `.github/workflows/`** (create that folder path when uploading — GitHub lets you type the full path in the "Add file" box, e.g. `.github/workflows/deploy.yml`)

### 4. Switch Pages to deploy via GitHub Actions

**Settings → Pages → Build and deployment → Source → GitHub Actions** (not "Deploy from a branch" — that older method won't run the PIN-hashing step).

### 5. Trigger the first deploy

Any push to `main` runs the workflow automatically. If you've just uploaded the files, that push already triggered it — check the **Actions** tab in your repo to watch it run (takes about a minute). Once it's green, your site is live at:

```
https://<your-username>.github.io/<repo-name>/
```

## Changing the PIN later

Update the `RESET_PIN` secret (Settings → Secrets and variables → Actions → edit `RESET_PIN`), then re-run the workflow from the **Actions** tab (or just push any small change to `main`) so the new hash gets baked in.

## Forgot the PIN entirely?

You can still reset the board by hand: Firebase console → **Realtime Database** → find `homeworkBoard/status` → delete that node. Everything moves back to To Do.

## Updating the assessment dates

If the school sends an updated calendar mid-term, send the new PDF back to Claude and ask for a refreshed `index.html` — the assessment data is baked into the file as a small JSON block near the bottom, so the whole file gets regenerated and just needs re-uploading (the PIN hash placeholder stays intact, no need to touch the secret again).

## How the sync works

Everyone's board reads and writes to the same `homeworkBoard/status` and `homeworkBoard/hidden` paths in your Firebase Realtime Database. Card moves and removed cards update for everyone else's open tab live, no refresh needed. Only the Reset button is PIN-gated — dragging, ticking off, and removing/restoring cards work for anyone.
