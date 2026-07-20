# Supabase Storage Guide

Everything you need to know about how file uploads work in LearnAfrica, how to set up Supabase Storage from scratch, how to debug upload failures, and how to change the bucket name in the future.

This is a standalone reference — read it once when you set up Supabase, and come back to it whenever uploads break.

---

## Table of Contents

1. [What Supabase Storage Is Used For](#what-supabase-storage-is-used-for)
2. [How Uploads Work Under the Hood](#how-uploads-work-under-the-hood)
3. [Initial Setup — Creating Your Supabase Bucket](#initial-setup)
4. [Required Environment Variables on Render](#required-environment-variables-on-render)
5. [Verifying It Works — The Diagnostic Endpoint](#verifying-it-works)
6. [Common Errors and How to Fix Them](#common-errors-and-how-to-fix-them)
7. [Changing the Bucket Name Later](#changing-the-bucket-name-later)
8. [Where the Bucket Name Lives in Code](#where-the-bucket-name-lives-in-code)
9. [Security — service_role vs anon Keys](#security)
10. [Cost and Limits](#cost-and-limits)

---

## What Supabase Storage Is Used For

LearnAfrica stores three types of files in Supabase:

- **Course thumbnails** — the cover images shown on course cards. Uploaded to `thumbnails/` folder inside the bucket. Route: `POST /api/upload/thumbnail`
- **User avatars** — profile pictures. Uploaded to `avatars/` folder. Route: `POST /api/upload/avatar`
- **Course and lesson resources** — PDFs, slides, code samples, videos, anything downloadable. Uploaded to `resources/` folder. Route: `POST /api/upload/resource`

All three types go to the **same bucket** in Supabase — the folders are just prefixes on the file names.

---

## How Uploads Work Under the Hood

When a user (instructor or admin) uploads a file, this happens step by step:

1. Frontend sends the file to a backend endpoint (`/api/upload/resource`, etc.) as form-data
2. Backend reads the file, checks size (max 50 MB for resources, 5 MB for images) and extension
3. Backend calls `_upload_to_supabase()` — an internal helper that PUTs the file to Supabase's storage API
4. If Supabase accepts it, Supabase returns success and the file gets a public URL like:
   ```
   https://YOUR-PROJECT.supabase.co/storage/v1/object/public/learnafrica-uploads/resources/12345_filename.pdf
   ```
5. The backend saves that URL in the database and returns it to the frontend
6. Frontend now shows the file as a downloadable resource on the course/lesson page
7. Students click the link, get the file directly from Supabase (bypasses your backend entirely — Supabase is a CDN)

If step 3 fails (Supabase rejects the upload), the backend has a **local disk fallback** that writes the file to `backend/instance/uploads/` on the server. This works during local development but **does NOT work on Render** because Render's filesystem is ephemeral (files disappear on restart). So on Render, if Supabase fails, uploads fail entirely and you'll see a clear error message.

---

## Initial Setup

### Step 1 — Sign up for Supabase

Go to https://supabase.com and sign up. Free tier gives you 1 GB storage — plenty for a small app.

### Step 2 — Create a project

1. Click **New Project**
2. Name it (e.g. `learnafrica`)
3. Set a strong database password (you won't need this for storage, but you must set one)
4. Pick the closest region to your users (for African users: Europe or `ap-southeast-1` Singapore)
5. Click **Create**
6. Wait 1-2 minutes for provisioning

### Step 3 — Create the storage bucket

1. In the Supabase dashboard, click **Storage** in the left sidebar
2. Click **New bucket**
3. Name: **`learnafrica-uploads`** (this is what LearnAfrica's code defaults to — see [where the bucket name lives](#where-the-bucket-name-lives-in-code) if you want to use a different name)
4. **Toggle "Public bucket" ON** — critical. Without this, students can't download resources.
5. Optionally set file size limit (leave default unless you want to restrict)
6. Click **Save**

### Step 4 — Add bucket policies (if uploads fail)

Sometimes uploads fail with "row-level security policy" errors. If that happens:

1. Supabase Storage → click your `learnafrica-uploads` bucket
2. Click the **Policies** tab
3. Click **New policy** → **For full customization**
4. Add an **INSERT** policy:
   - Name: `Allow service_role to upload`
   - Target roles: `service_role`
   - USING expression: `true`
   - Save
5. Add a **SELECT** policy:
   - Name: `Public read`
   - Target roles: `anon`
   - USING expression: `true`
   - Save

(If your bucket is set to "Public bucket" from step 3, the SELECT policy may not be strictly necessary — but it doesn't hurt to have it.)

### Step 5 — Get your API keys

1. Supabase dashboard → **Settings** (gear icon at bottom left) → **API**
2. On this page you'll see:
   - **Project URL** — copy this. It looks like `https://xxxxxxxxxxxx.supabase.co`
   - **Project API keys** — you'll see two:
     - **anon** / **public** key — DON'T use this for the backend. Ignore it.
     - **service_role** / **secret** key — SCROLL DOWN to find this. Click "Reveal" and copy it. It's a very long JWT starting with `eyJ...`

You now have three things to plug into Render:
- Bucket name: `learnafrica-uploads`
- Project URL
- service_role key

---

## Required Environment Variables on Render

Once you have those three values, add them to Render:

1. Render Dashboard → your backend service → **Environment** tab (left sidebar)
2. Click **Add Environment Variable**
3. Add these three:

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` (from Supabase → Settings → API → Project URL) |
| `SUPABASE_SERVICE_KEY` | Your service_role JWT (from Supabase → Settings → API → service_role key) |
| `SUPABASE_STORAGE_BUCKET` | `learnafrica-uploads` (or whatever you named your bucket) |

4. Click **Save Changes** — Render will auto-redeploy your service

Note: If your bucket is named exactly `learnafrica-uploads`, you can technically skip setting `SUPABASE_STORAGE_BUCKET` because that's the code default. But setting it explicitly is safer — it prevents surprises if the default ever changes.

---

## Verifying It Works

There's a built-in diagnostic endpoint that tells you exactly whether uploads are configured correctly.

### How to use it

1. Log in to your app as an admin
2. Open this URL in a new browser tab (replace with your actual Render URL):
   ```
   https://YOUR-BACKEND.onrender.com/api/admin/storage-check
   ```
3. You'll see a JSON response

### What each response means

**Everything is set up correctly — uploads will work:**
```json
{
  "SUPABASE_URL": "set",
  "SUPABASE_SERVICE_KEY": "set",
  "SUPABASE_STORAGE_BUCKET": "learnafrica-uploads",
  "test_upload_ok": true,
  "test_upload_error": null,
  "upload_folder": "/opt/render/project/src/backend/instance/uploads"
}
```

Try uploading a resource file in the app — it should work now.

**Env var missing — uploads will fail:**
```json
{
  "SUPABASE_URL": "set",
  "SUPABASE_SERVICE_KEY": "MISSING",
  "SUPABASE_STORAGE_BUCKET": "learnafrica-uploads",
  "test_upload_ok": null,
  "test_upload_error": null
}
```

Any field marked `MISSING` needs to be added on Render → Environment tab. See [Required Environment Variables](#required-environment-variables-on-render).

**Env vars set but Supabase rejected the upload:**
```json
{
  "SUPABASE_URL": "set",
  "SUPABASE_SERVICE_KEY": "set",
  "SUPABASE_STORAGE_BUCKET": "learnafrica-uploads",
  "test_upload_ok": false,
  "test_upload_error": {
    "message": "Bucket not found",
    "statusCode": "404"
  }
}
```

The specific `test_upload_error` message tells you what's wrong. See [Common Errors](#common-errors-and-how-to-fix-them) below.

---

## Common Errors and How to Fix Them

### Error: `"Bucket not found"` (statusCode 404)

**Cause:** The value of `SUPABASE_STORAGE_BUCKET` on Render doesn't match your actual bucket name in Supabase.

**Fix:**
1. Go to Supabase → Storage — check the exact bucket name
2. Go to Render → Environment tab → find `SUPABASE_STORAGE_BUCKET` → make sure the value matches exactly (case-sensitive, no extra spaces)
3. Save on Render — service auto-redeploys
4. Retest `/api/admin/storage-check`

Alternative fix: if the bucket doesn't exist in Supabase yet, go create it (see [Initial Setup Step 3](#step-3--create-the-storage-bucket)).

### Error: `"new row violates row-level security policy"` (statusCode 403)

**Cause:** The bucket exists but doesn't allow the service_role to upload.

**Fix:** Add an INSERT policy to the bucket (see [Initial Setup Step 4](#step-4--add-bucket-policies-if-uploads-fail)).

### Error: `"Invalid JWT"` or `"Unauthorized"` (statusCode 401)

**Cause:** Your `SUPABASE_SERVICE_KEY` env var is wrong, expired, or you used the anon key by mistake.

**Fix:**
1. Supabase → Settings → API
2. Scroll to **Project API keys**
3. Click **Reveal** next to `service_role` (the long one, not `anon`)
4. Copy the full JWT string
5. Render → Environment tab → update `SUPABASE_SERVICE_KEY` → paste the fresh copy
6. Make sure there are no trailing spaces or newlines
7. Save on Render — retest

### Error: `"Local upload failed: [Errno 2] No such file or directory..."`

**Cause:** Supabase upload failed silently, so the app tried to fall back to writing to local disk on Render. But Render's disk is ephemeral so the local write also failed. The REAL error is that Supabase failed — the disk error is a symptom.

**Fix:** Hit `/api/admin/storage-check` — it will show you the actual Supabase failure reason. Then follow one of the fixes above based on what it says.

### Error: File uploads say "success" but students see a broken link when they click download

**Cause:** Bucket exists but isn't set to public. The upload works but the URL returns 401 or 403 when accessed anonymously.

**Fix:**
1. Supabase → Storage → click your bucket → click Settings icon (or the three dots menu)
2. Toggle **Public bucket** ON
3. Save

Existing uploaded files should immediately become downloadable.

### Error: Everything else / unclear error

**Fallback fix:**
1. Delete the Supabase bucket
2. Create it fresh with the exact name `learnafrica-uploads`
3. Set to Public
4. Re-verify env vars on Render match
5. Retest

---

## Changing the Bucket Name Later

Say you want to rename the bucket from `learnafrica-uploads` to something else — for example when you outgrow the free tier and create a new project.

### The easy way — just update Render env var

You don't need to touch code at all.

1. Create the new bucket in Supabase (with the new name, Public toggle ON)
2. Go to Render → Environment tab
3. Update `SUPABASE_STORAGE_BUCKET` to the new bucket name
4. Save — service auto-redeploys
5. Test — new uploads go to the new bucket

**Note:** Any files that were already uploaded to the old bucket stay in the old bucket. Their URLs still work (as long as you don't delete the old bucket). New uploads go to the new bucket.

### The hard way — change the code default

Only do this if you're sure you never want the old bucket name as a fallback. Editing the default in code:

1. Open `backend/app/main.py`
2. Search for `SUPABASE_STORAGE_BUCKET`
3. You'll find 3 matches — update each occurrence of the old bucket name to the new one
4. Save, commit, push to GitHub
5. Render auto-redeploys from GitHub

But honestly — just use the env var. It's easier and you don't have to redeploy from source code.

---

## Where the Bucket Name Lives in Code

For your reference, here are the exact locations in `backend/app/main.py` where the bucket name appears. These are the fallback defaults used ONLY when the `SUPABASE_STORAGE_BUCKET` env var isn't set.

### Location 1 — The main upload function (around line 3314)

```python
bucket = os.environ.get('SUPABASE_STORAGE_BUCKET', 'learnafrica-uploads').strip()
```

This is inside `_upload_to_supabase()` — the internal helper that all three upload endpoints (thumbnail, avatar, resource) call. The second argument to `os.environ.get()` is the default — used when the env var isn't set.

### Location 2 — The diagnostic endpoint's status message (around line 3508)

```python
'SUPABASE_STORAGE_BUCKET': bucket or 'MISSING (defaults to "learnafrica-uploads")',
```

Inside `admin_storage_check()`. This is just a display string — what the `/api/admin/storage-check` response tells you when the env var isn't set.

### Location 3 — The diagnostic endpoint's test upload (around line 3515)

```python
bucket_to_use = bucket or 'learnafrica-uploads'
```

Inside `admin_storage_check()`. When the diagnostic endpoint tries a real 1-byte test upload to verify things work, this decides which bucket it tests against.

### How to change them all in one go

Open `backend/app/main.py` in any code editor, press `Ctrl+F` (or `Cmd+F` on Mac), search for `learnafrica-uploads`, and update each of the 3 matches.

Or better — just set the env var and forget about editing code.

---

## Security

### Never expose the service_role key to the frontend

The `service_role` key bypasses all Row-Level Security. Anyone who has this key has full backend access to your Supabase project.

**Safe places to put it:**
- ✅ Backend env vars on Render (isolated, not shipped to browsers)
- ✅ Local `.env` file that's in `.gitignore`

**Never put it in:**
- ❌ Frontend code
- ❌ Public Git commits
- ❌ Environment variables prefixed with `VITE_` or `NEXT_PUBLIC_`
- ❌ Screenshots you share

If you accidentally leak it (committed to public repo, posted in chat, etc.):
1. Supabase → Settings → API → click the "Reset" icon next to `service_role`
2. Get the new key
3. Update `SUPABASE_SERVICE_KEY` on Render
4. Redeploy

Old key becomes invalid immediately.

### anon key vs service_role key

- **anon key**: safe to expose to browsers. Has RLS enforced. Used by frontend directly if you build client-side Supabase features.
- **service_role key**: backend only. Bypasses RLS. Full admin access.

LearnAfrica uses the **service_role key** because the backend needs to upload files on behalf of any authenticated user (server-to-server).

---

## Cost and Limits

Supabase Free tier includes:
- **1 GB storage total**
- **2 GB bandwidth per month** (downloads count)
- Unlimited file uploads within the storage limit
- File size limit set per bucket (default 50 MB, configurable)

For a small course platform this is fine. If you outgrow it:
- **Pro tier** ($25/month): 100 GB storage, 250 GB bandwidth
- Or move to AWS S3 / Cloudflare R2 (requires code changes)

To check usage: Supabase dashboard → **Reports** section shows your storage and bandwidth.

---

## Quick Reference — What Goes Where

| Where | Value | Example |
|---|---|---|
| Supabase Dashboard → Storage → bucket name | `learnafrica-uploads` | Match exactly to env var |
| Render → Environment → `SUPABASE_URL` | Project URL from Supabase | `https://xxxxxxxx.supabase.co` |
| Render → Environment → `SUPABASE_SERVICE_KEY` | service_role JWT from Supabase | `eyJhbGciOi...` (long string) |
| Render → Environment → `SUPABASE_STORAGE_BUCKET` | Bucket name from Supabase | `learnafrica-uploads` |
| `backend/app/main.py` code default (fallback) | Only used if env var is unset | `learnafrica-uploads` |

The env var on Render always wins over the code default. Setting the env var explicitly is the safest way to configure this.

---

## Bottom Line — Setup Checklist

Before you can upload files, ALL of these must be true:

- [ ] Supabase project exists
- [ ] Bucket `learnafrica-uploads` exists in that project
- [ ] Bucket is set to **Public** (toggle ON in bucket settings)
- [ ] `SUPABASE_URL` env var is set on Render
- [ ] `SUPABASE_SERVICE_KEY` env var is set on Render (service_role, not anon)
- [ ] `SUPABASE_STORAGE_BUCKET` env var is set on Render (matching bucket name)
- [ ] Render service has redeployed since setting the env vars
- [ ] `/api/admin/storage-check` returns `test_upload_ok: true`

Once all 8 are checked, uploads work reliably. If uploads fail after that, it's probably a size/extension issue, not a config issue.

---

Built for LearnAfrica. If you hit an issue not covered here, hit the `/api/admin/storage-check` endpoint first — 90% of upload problems show up there with a clear error message.
