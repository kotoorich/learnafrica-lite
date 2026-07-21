# Database Backup & Restore Guide

How to safely export and restore your LearnAfrica database using the admin panel.

---

## Table of Contents

1. [What Gets Backed Up](#what-gets-backed-up)
2. [What Does NOT Get Backed Up](#what-does-not-get-backed-up)
3. [Exporting a Backup](#exporting-a-backup)
4. [Restoring from a Backup](#restoring-from-a-backup)
5. [How Often Should I Back Up?](#how-often-should-i-back-up)
6. [Where to Store Backups](#where-to-store-backups)
7. [Inspecting a Backup File](#inspecting-a-backup-file)
8. [What to Do If a Restore Fails Partway](#what-to-do-if-a-restore-fails-partway)
9. [Security Considerations](#security-considerations)
10. [Common Errors](#common-errors)

---

## What Gets Backed Up

The export produces a single JSON file containing every row of every table in your database:

- **Users** — all accounts (admin, instructors, students) with hashed passwords
- **User stats** — completion counts, streaks, etc.
- **Courses** — all courses with metadata, tags, outcomes, perks
- **Sections + Lessons** — full curriculum for every course
- **Course resources + Lesson resources** — URLs and metadata (files themselves are on Supabase — see below)
- **Enrollments** — who's enrolled in what
- **User progress** — which lessons each student has completed
- **Time tracking** — how much time students have spent
- **Transactions + Payments** — payment records with amounts and status
- **Coupons** — discount codes and their usage
- **Live sessions + RSVPs** — scheduled meetings and attendees
- **Notifications** — in-app messages
- **Course reviews** — student ratings
- **Community messages** — chat history
- **Lesson discussions** — Q&A on lessons
- **Instructor guide** — the walkthrough steps
- **Issued badges** — achievement records
- **Quizzes and quiz questions**
- **Platform settings** — including your signup verification mode
- **Email verification codes** — pending OTP codes (usually empty or short-lived)

That's the entire logical state of your app.

---

## What Does NOT Get Backed Up

**Uploaded files themselves.**

The database stores URLs to files (thumbnails, avatars, resource PDFs, videos) but the actual files live on Supabase Storage. If you restore a database backup, all the URLs will still point to Supabase — as long as Supabase still has those files, everything works.

**To back up the files themselves:**
1. Go to Supabase Dashboard → Storage → your `learnafrica-uploads` bucket
2. Supabase Free tier: use the built-in export or manually download files you care about
3. Supabase Pro tier: they have automated backups. Check Project Settings → Backups.

For most use cases, the database backup is what matters — files rarely get deleted, but data changes constantly.

---

## Exporting a Backup

1. Log in to your app as an admin
2. Go to **Admin Panel** → **Settings** tab
3. Scroll to the **Database Backup** card
4. Click **Download full backup**
5. Wait a few seconds while the server prepares the JSON
6. The browser downloads a file named `learnafrica-backup-YYYY-MM-DD.json`

That's it. Save the file somewhere safe.

### What the file looks like

```json
{
  "signature": "LEARNAFRICA_BACKUP_V1",
  "exported_at": "2026-08-15T14:23:11.123456Z",
  "exported_by": "admin-user-id-xxx",
  "tables": {
    "users": [ { "id": "...", "name": "...", ... }, ... ],
    "courses": [ ... ],
    ...
  },
  "errors": []
}
```

The `signature` field is what the restore endpoint checks to make sure the file is a real LearnAfrica backup — random JSON files won't work.

---

## Restoring from a Backup

⚠ **This is destructive.** Restoring wipes your current database and replaces it with the backup contents. Users who signed up after the backup date will lose their accounts. Course changes made since the backup will be lost.

### Before you start

- **Download a fresh backup RIGHT NOW** first, as insurance. Even though the restore endpoint automatically saves a pre-restore snapshot on the server, having your own copy is safer.
- **Notify users** if this is a production restore. Everyone might get logged out.
- **Verify the backup file** is the one you want to restore. Open it in a text editor and check the `exported_at` date.

### Steps

1. Log in to your app as an admin
2. Go to **Admin Panel** → **Settings** → **Database Backup** card
3. Scroll to **Restore from backup** section
4. Read the red warning box
5. Click **Choose file** and select your backup JSON
6. Click **Continue with restore…**
7. In the confirmation panel:
   - Type `CONFIRM` (exactly, all caps) in the first field
   - Re-enter your admin password in the second field
8. Click **Restore now (destructive)**
9. Wait — this takes 10-60 seconds depending on database size
10. You'll see a success message with the number of rows inserted
11. **Log out and back in** — your session token from before the restore may be stale if user IDs changed

### What happens under the hood

1. Server verifies the JSON has the `LEARNAFRICA_BACKUP_V1` signature
2. Server verifies your admin password matches (bcrypt check)
3. Server exports a **pre-restore snapshot** of current data to `/tmp/learnafrica-pre-restore-YYYYMMDD-HHMMSS.json` on the Render container
4. Server DELETEs all rows from all tables (in reverse dependency order to avoid FK constraints)
5. Server INSERTs all rows from the backup JSON (in dependency order)
6. Server commits and returns the count of rows inserted

If any step fails, the error is included in the response.

---

## How Often Should I Back Up?

Depends on how much you'd hate losing recent data. Suggested schedule:

| Use case | Suggested frequency |
|---|---|
| Development / testing | Manually, before big changes |
| Small production (< 100 users) | Weekly |
| Active production (100-1000 users) | Daily |
| Very active production | Multiple times per day (automate it) |

**Automating backups** is not built into the app. You'd need to write a script that hits `/api/admin/database/export` with an admin token on a schedule (cron job, GitHub Actions, or a service like cron-job.org).

---

## Where to Store Backups

**Bad choices:**
- Just leaving them in your Downloads folder (you'll delete them by accident)
- Committing to git (backups contain password hashes — never commit them)
- Same computer as your app (if disk dies, both go)

**Good choices:**
- Google Drive folder or Dropbox (auto-sync)
- Encrypted external drive
- A private S3 bucket or backblaze B2
- A private git repo (backup files in `.gitignore` for main repo, but okay in a dedicated private repo)

Rule of thumb: **at least 2 copies in different physical locations**.

---

## Inspecting a Backup File

Backup files are plain JSON — open them in any text editor.

```bash
# Pretty-print the file
cat learnafrica-backup-2026-08-15.json | jq .

# Count users
cat learnafrica-backup-2026-08-15.json | jq '.tables.users | length'

# List course titles
cat learnafrica-backup-2026-08-15.json | jq '.tables.courses[].title'

# See when it was exported
cat learnafrica-backup-2026-08-15.json | jq .exported_at
```

Or use an online JSON viewer like https://jsonhero.io (but never upload backups with real user data to public tools).

---

## What to Do If a Restore Fails Partway

If the restore response shows errors in `errors_insert`:

1. **Don't panic** — the pre-restore snapshot is still on the server
2. Log into your Render service via SSH (or use the shell in Render dashboard)
3. Look for the snapshot file (path is shown in the response):
   ```
   /tmp/learnafrica-pre-restore-YYYYMMDD-HHMMSS.json
   ```
4. Download it (or copy it via `cat` and paste locally)
5. **Restore the snapshot** — same process as any other backup restore

If the app is completely broken and you can't get to the admin panel:
- Direct SQL access via Neon dashboard SQL editor — run the DELETEs and INSERTs manually
- Or contact the maintainer

**The pre-restore snapshot is your safety net.** As long as it exists, no restore is truly irreversible.

---

## Security Considerations

### Backup files contain sensitive data

- **Bcrypt password hashes** — someone with the file could try offline cracking
- **Email addresses** — a full list of your users
- **Transaction records** — payment amounts and dates
- **Discussion history** — private conversations
- **Sender emails / phone numbers** if stored

**Treat backup files like admin credentials.** Encrypt them at rest if storing long-term.

### Restore is admin-only + password-gated

- Only users with `role='admin'` or `role='superadmin'` can call the restore endpoint
- Password re-confirmation is required (bcrypt-verified server-side)
- Signature check prevents importing arbitrary JSON
- `CONFIRM` string prevents accidental drag-and-drop imports

### Backups made from prod work in dev, and vice versa

You can export prod data → import to a local dev instance to reproduce a bug. Just remember: after import, existing dev accounts are gone (replaced with prod users).

---

## Common Errors

### "This file is not a valid LearnAfrica backup (signature missing/wrong)"

**Cause:** You uploaded a JSON file that wasn't produced by our export endpoint.

**Fix:** Only import files with the `LEARNAFRICA_BACKUP_V1` signature at the top.

### "Password does not match. Restore cancelled."

**Cause:** You typed your admin password wrong.

**Fix:** Try again. If you've genuinely forgotten your admin password, you'll need to reset it directly in the database (via Neon SQL editor) before you can restore.

### "You must send confirm='CONFIRM' to proceed with restore"

**Cause:** The confirmation field wasn't filled in.

**Fix:** Type `CONFIRM` exactly (case-sensitive) in the confirmation box.

### Restore says "success" but the app looks the same

**Cause:** Your browser is showing cached data. The database was actually restored.

**Fix:** Log out completely, hard-refresh (Ctrl+Shift+R), log back in. You'll see the restored data.

### Restore succeeds but I can't log in

**Cause:** The user ID stored in your JWT no longer exists in the restored database.

**Fix:** Log out (or clear cookies/localStorage), then log in fresh with an admin account that exists in the restored data.

### Restore takes forever or times out

**Cause:** Very large database + Render's request timeout (default 30s on Free tier, 100s on Starter).

**Fix:**
- Upgrade Render to a plan with longer request timeouts
- Or split the restore into smaller batches (edit the endpoint to accept a `tables` array so you can restore one table at a time)

---

## Bottom Line — Best Practices Checklist

- [ ] Set up a regular backup schedule (weekly minimum)
- [ ] Store backups in at least 2 physically-separate locations
- [ ] Encrypt backups if storing long-term
- [ ] Test that a backup actually works — restore it into a dev environment periodically
- [ ] Never commit backup files to git
- [ ] Before any risky change (schema migration, mass edit), take a manual backup
- [ ] Keep the most recent 3-4 backups minimum; delete older ones if storage is tight
- [ ] Never share backup files publicly — they contain sensitive user data

If you follow all 8, you'll never lose more than a week's worth of data even in the worst-case scenario.
