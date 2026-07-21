# SendPulse Setup Guide

How to enable email OTP verification for signups in LearnAfrica. This guide walks you through creating a SendPulse account, verifying a sender domain, getting API credentials, and testing the integration end-to-end.

---

## Table of Contents

1. [What SendPulse Is](#what-sendpulse-is)
2. [Why LearnAfrica Uses It](#why-learnafrica-uses-it)
3. [Sign Up for a SendPulse Account](#sign-up-for-a-sendpulse-account)
4. [Verify a Sender Domain](#verify-a-sender-domain)
5. [Get Your API Credentials](#get-your-api-credentials)
6. [Set the Environment Variables on Render](#set-the-environment-variables-on-render)
7. [Enable OTP Verification in the Admin Panel](#enable-otp-verification-in-the-admin-panel)
8. [Testing the Full Flow](#testing-the-full-flow)
9. [Free Tier Limits](#free-tier-limits)
10. [Troubleshooting](#troubleshooting)
11. [What Happens When SendPulse Fails](#what-happens-when-sendpulse-fails)

---

## What SendPulse Is

SendPulse (https://sendpulse.com) is an email + SMS delivery service. LearnAfrica uses their email API to send verification codes to new users during signup.

Alternatives you could also use (with code changes): SendGrid, Mailgun, Postmark, Amazon SES. Right now the code is written for SendPulse specifically.

## Why LearnAfrica Uses It

When email verification is turned on in the admin panel, the flow is:

1. User signs up with name, email, password
2. Backend generates a random 6-digit code, hashes it, stores it in the database with a 24-hour expiry
3. Backend sends the plaintext code to the user's email via SendPulse
4. User enters the code on the verify page
5. Backend confirms it matches (within 5 attempts) and logs the user in

Without a service like SendPulse, the backend has no way to send emails.

---

## Sign Up for a SendPulse Account

1. Go to https://sendpulse.com
2. Click **Sign Up** (top right)
3. Sign up with email or Google/Facebook/GitHub
4. Verify your email address when prompted
5. Complete any onboarding questions (skip when possible)

Free plan works fine to start. You don't need to enter payment details.

---

## Verify a Sender Domain

SendPulse won't let you send emails from a random email address. You need to prove you own the domain you'll send from — otherwise your emails get rejected as spam.

**You need a domain you control** (e.g. `learnafrica.com`, `mydomain.co`). Free Gmail addresses won't work as senders — you need a real domain.

### Step 1 — Add your sender

1. In the SendPulse dashboard, go to **Settings** → **Senders** (in the left sidebar)
2. Click **Add new sender** or **Add email**
3. Enter the email address you'll send FROM (e.g. `noreply@learnafrica.com` or `hello@learnafrica.com`)
4. Enter the sender name (e.g. `LearnAfrica`)
5. Save

SendPulse will send a verification email to that address. Click the link in it to confirm.

### Step 2 — Verify domain ownership (DNS records)

For higher delivery rates and to prevent spam labelling, verify the domain itself:

1. SendPulse dashboard → **Settings** → **SMTP** → **DNS Settings** (or "Sender Verification")
2. It will show you DNS records to add:
   - **SPF record** (TXT record starting with `v=spf1 include:sendpulse.com ~all`)
   - **DKIM record** (long TXT record with a specific hostname)
   - **DMARC record** (optional but recommended)

3. Go to your domain's DNS provider (e.g. Cloudflare, GoDaddy, Namecheap)
4. Add the exact records SendPulse gave you
5. Wait 5-30 minutes for DNS propagation
6. Back in SendPulse, click **Verify** — it should say "Verified"

**If you don't have a domain yet:** You can still test with a free `@sendpulse.com` sub-address, but delivery rates are low and emails often land in spam. Get a real domain before going to production.

---

## Get Your API Credentials

1. SendPulse dashboard → click your account name (top right) → **Account Settings**
2. In the left sidebar, click **API**
3. On this page you'll see two fields:
   - **ID** (also called Client ID) — this is `SENDPULSE_CLIENT_ID`
   - **Secret** (also called Client Secret) — this is `SENDPULSE_CLIENT_SECRET`
4. Copy both values.

Also note down:
- The verified sender email address — this is `SENDPULSE_SENDER_EMAIL`
- The display name you want emails to appear from — this is `SENDPULSE_SENDER_NAME` (e.g. `LearnAfrica`)

⚠ Treat the Secret like a password. Never commit it to git or share it publicly.

---

## Set the Environment Variables on Render

1. Go to Render Dashboard → your backend service → **Environment** tab
2. Add these 4 variables:

| Key | Value |
|---|---|
| `SENDPULSE_CLIENT_ID` | Your Client ID from SendPulse |
| `SENDPULSE_CLIENT_SECRET` | Your Client Secret from SendPulse |
| `SENDPULSE_SENDER_EMAIL` | The verified sender email (e.g. `noreply@learnafrica.com`) |
| `SENDPULSE_SENDER_NAME` | The display name (e.g. `LearnAfrica`) |

3. Save. Render auto-redeploys the backend.

---

## Enable OTP Verification in the Admin Panel

By default, the LearnAfrica app has verification turned OFF — users sign up and log in immediately. To turn on OTP:

1. Log in to your app as an admin
2. Go to **Admin Panel** → **Settings** tab
3. Scroll to **Signup Verification** card
4. Select **Email OTP verification (SendPulse)**
5. It saves automatically

New signups from this point on will need to enter a code from their email before their account activates.

You can flip this back to "No verification" anytime without redeploying.

---

## Testing the Full Flow

### Test 1 — Basic signup with OTP on

1. Open your app in an incognito window
2. Click **Get Started Free** or **Sign Up**
3. Enter name, email (use a REAL email you can check), password
4. Submit
5. You should be redirected to `/verify-email` with the message "We sent a 6-digit code to your@email"
6. Check your email (and spam folder)
7. Enter the code — click Verify
8. You should be logged in and redirected to `/dashboard`

If any step above doesn't work, see the [Troubleshooting](#troubleshooting) section.

### Test 2 — Wrong code rejected

1. On the verify page, type `000000` (a code that's not yours)
2. Submit
3. You should see "Incorrect code. Please try again."
4. After 5 wrong tries, you'll see "Too many failed attempts. Request a new code."

### Test 3 — Resend

1. On the verify page, click **Resend code**
2. You should get a fresh email with a new code
3. The old code is invalidated — only the newest code works

### Test 4 — Expired code

1. Submit a code more than 24 hours after signup
2. Should say "Code has expired. Request a new one."

---

## Free Tier Limits

SendPulse's free tier includes:

- **12,000 emails/month** to up to 500 subscribers
- Rate limit: not documented publicly but roughly 100 emails/minute

For a small LMS this is plenty. If you outgrow it:

- Paid plans start around **$8/month for 500 subscribers**
- Scales up based on total contacts + volume

**To check usage:** SendPulse dashboard → **Reports** → **Overview** shows sent/delivered/opened.

If you hit the limit, SendPulse silently stops sending. Users will see "Failed to send verification code" errors. See [Troubleshooting](#troubleshooting) for what to do.

---

## Troubleshooting

### "Failed to send verification code" on signup

**Cause:** Something in the SendPulse chain broke.

**Fix:**
1. Check Render logs for the specific error (look for `SendPulse OTP send failed`)
2. Common errors and their meanings:

| Log message | Cause | Fix |
|---|---|---|
| `SENDPULSE_CLIENT_ID env var not set` | Env var missing | Add it in Render → Environment |
| `SENDPULSE_CLIENT_SECRET env var not set` | Env var missing | Add it in Render → Environment |
| `SENDPULSE_SENDER_EMAIL env var not set` | Env var missing | Add it in Render → Environment |
| `SendPulse auth failed: 401` | Wrong Client ID or Secret | Re-copy from SendPulse dashboard, update Render, redeploy |
| `SendPulse auth failed: 403` | Account suspended or plan expired | Check SendPulse dashboard for billing/status |
| `SendPulse send failed: 400` | Sender email not verified | Verify the sender domain in SendPulse |
| `SendPulse send failed: 429` | Rate limit hit | Wait a few minutes and retry |
| `SendPulse request exception` | Network / timeout | Try again in a few seconds |

### Emails not arriving

1. **Check spam folder** first — always the most common cause
2. Check SendPulse dashboard → **Reports** → **Statistics** — do you see the email as sent? If yes, it's a delivery problem, not a send problem
3. Try a different email provider (Gmail vs Outlook vs Yahoo) — sometimes one provider aggressively spam-filters
4. Verify your DNS records (SPF/DKIM) at https://mxtoolbox.com/spf.aspx and https://mxtoolbox.com/dkim.aspx

### Emails arrive but in spam

**Cause:** Domain reputation is low or DNS records aren't set up.

**Fix:**
1. Add SPF, DKIM, and DMARC records for your domain (SendPulse dashboard shows the exact values)
2. Wait 24-48 hours for reputation to improve
3. Ask users to whitelist your sender email

### "Too many failed attempts"

**Cause:** User entered 5 wrong codes in a row. Their code is now invalidated.

**Fix:** User clicks "Resend code" → new code is generated → they try that one.

---

## What Happens When SendPulse Fails

The app is designed to **fail gracefully** so users aren't permanently locked out if SendPulse breaks:

- If verification mode is `email_otp` but SendPulse env vars aren't set: signup falls back to auto-login (like `mode=none`), and a warning is logged in Render logs
- If SendPulse returns an error mid-signup: same fallback — user gets a token immediately, warning logged
- If the resend button fails: user sees an error message but their previous code (if still valid) still works

This means: **even if SendPulse is broken, your users can still sign up.** They just won't need to verify email until you fix SendPulse.

If you want to hard-block signups when SendPulse fails (no fallback), edit `signup()` in `backend/app/main.py`:

```python
if mode == 'email_otp':
    ok, err = _generate_and_send_code(...)
    if not ok:
        # Change this line — instead of falling through, return an error:
        return jsonify({'error': 'Verification is temporarily unavailable. Try again later.'}), 503
```

But for now, the safe fallback is the default.

---

## Quick Reference — What Goes Where

| Where | Value | Example |
|---|---|---|
| SendPulse Dashboard → API → ID | `SENDPULSE_CLIENT_ID` on Render | `abc123def456...` |
| SendPulse Dashboard → API → Secret | `SENDPULSE_CLIENT_SECRET` on Render | `xyz789...` |
| Verified sender email in SendPulse | `SENDPULSE_SENDER_EMAIL` on Render | `noreply@learnafrica.com` |
| Display name for emails | `SENDPULSE_SENDER_NAME` on Render | `LearnAfrica` |
| Admin Panel → Settings → Signup Verification | Radio button toggle | `Email OTP verification (SendPulse)` |

---

## Bottom Line — Setup Checklist

- [ ] SendPulse account created
- [ ] Sender email address verified in SendPulse
- [ ] Domain DNS records added (SPF, DKIM at minimum)
- [ ] `SENDPULSE_CLIENT_ID` env var set on Render
- [ ] `SENDPULSE_CLIENT_SECRET` env var set on Render
- [ ] `SENDPULSE_SENDER_EMAIL` env var set on Render (matches verified sender)
- [ ] `SENDPULSE_SENDER_NAME` env var set on Render
- [ ] Render service redeployed after setting env vars
- [ ] Admin panel → Settings → Signup Verification → set to "Email OTP verification"
- [ ] Test signup completes with real code arriving in a real inbox

Once all 10 items are ticked, email OTP is fully working.
