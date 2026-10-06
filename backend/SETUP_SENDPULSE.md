# Set up SendPulse email on LearnAfrica

The app already has SendPulse built in. It sends the 6-digit signup
verification code. You only need to add credentials and turn the feature on.

There are three parts:

1. Get your SendPulse API keys and a verified sender address.
2. Put those values on the backend (Render + local).
3. Turn on email OTP in the admin panel.

Do them in this order. The feature does nothing until all three are done.

---

## 1. Get your SendPulse values

Log in at <https://sendpulse.com>.

**API keys (ID + secret)**

1. Go to **Account** (bottom-left) → **API**.
2. On the **API keys** tab, click **Create a new API key** (or copy an existing one).
3. Copy the **ID** and the **Secret**. These map to:
   - `SENDPULSE_CLIENT_ID`
   - `SENDPULSE_CLIENT_SECRET`

Keep the secret private. Treat it like a password.

**A verified sender address**

1. Go to **Settings** → **Senders** (sometimes under **Email → Settings**).
2. Add the address you want mail to come from, for example
   `no-reply@yourdomain.com`.
3. SendPulse emails you a confirmation link. Click it to verify the address.
4. That verified address maps to `SENDPULSE_SENDER_EMAIL`.

> The sender address must be verified in SendPulse. If it isn't, sends fail
> with an error mentioning the sender.

---

## 2. Put the values on the backend

### Render (production)

Your backend runs on Render. Add four environment variables:

1. Open the Render dashboard → your backend service → **Environment**.
2. Add:
   - `SENDPULSE_CLIENT_ID` = your ID
   - `SENDPULSE_CLIENT_SECRET` = your secret
   - `SENDPULSE_SENDER_EMAIL` = your verified sender address
   - `SENDPULSE_SENDER_NAME` = `LearnAfrica` (or any display name)
3. Save. Render redeploys automatically.

`render.yaml` already lists these variables, so a new deploy from that file
will prompt for them too.

### Local (development)

```bash
cd backend
cp .env.example .env
# then edit .env and fill in the four SENDPULSE_ values
```

`.env` is git-ignored, so your keys are never committed.

---

## 3. Test the credentials

From the `backend` folder:

```bash
pip install python-dotenv requests
python test_sendpulse.py                    # checks the keys only
python test_sendpulse.py you@example.com    # also sends a real test email
```

You should see the token step pass, and (with an address) the email step pass.
If the email step fails and mentions the sender, re-check step 1's verified
address.

---

## 4. Turn on email verification in the app

1. Log in as an admin.
2. Open the **Admin Panel** → signup verification settings.
3. Choose **Email OTP verification (SendPulse)**.
4. Save.

That switch stores the setting `signup_verification_mode = email_otp`. New
signups then must enter the code before they are active.

---

## How it behaves

- Signup creates the account, sends a 6-digit code, and does not log the user in
  until they enter it.
- Codes are 6 digits, expire in **15 minutes**, and are stored hashed.
- The code endpoints are rate-limited:
  - sending: 10 per IP and 5 per email, per hour
  - verifying: 30 per IP and 10 per email, per 15 minutes
- If SendPulse is not configured, signup falls through and logs the user in with
  a warning in the server logs. So test before switching on.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `SENDPULSE_CLIENT_ID env var not set` | Var missing on Render | Add all four vars, redeploy |
| `SendPulse auth failed: 401` | Wrong ID or secret | Re-copy both from Account → API |
| `SendPulse send failed` mentions sender | Sender not verified | Verify the address in SendPulse |
| Email never arrives | Inbox/spam, or credits | Check spam; check SendPulse credit balance |
| Users logged in without a code | Mode still `none`, or vars unset | Do steps 2 and 4 |

---

## What changed in this package

- `backend/render.yaml` — declared the four SendPulse variables (kept out of git
  with `sync: false`).
- `backend/.env.example` — new; a local template including the SendPulse vars.
- `backend/test_sendpulse.py` — new; checks credentials and can send a test.

No application logic changed. The sending code already exists in
`backend/app/main.py` (`_send_via_sendpulse`).
