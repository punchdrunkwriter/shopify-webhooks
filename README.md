# Shopify Webhooks

Serverless webhook handler for Shopify customer address changes, deployed on Vercel.

## Features

- **Address change detection** — Compares customer addresses and triggers email notifications
- **Webhook signature verification** — Validates all incoming Shopify webhooks
- **Vercel KV storage** — Maintains 30-day customer history for diff comparison
- **Email notifications** — Sends detailed before/after address changes via Fastmail

## Setup

### 1. Deploy to Vercel

```bash
git push origin main
```

Then in Vercel dashboard:
1. Click "New Project"
2. Import from GitHub: `punchdrunkwriter/shopify-webhooks`
3. Deploy

### 2. Environment Variables

Add these to your Vercel project (Settings → Environment Variables):

- `SHOPIFY_WEBHOOK_SECRET` — From Shopify custom app settings (API credentials → Webhook signing secret)
- `FASTMAIL_EMAIL` — Your Fastmail address
- `FASTMAIL_PASSWORD` — Fastmail app-specific password (Settings → Password & Security → App Passwords)
- `NOTIFICATION_EMAIL` — Where to send alerts

### 3. Enable Vercel KV

1. Vercel Dashboard → Storage → Create Database
2. Select "Vercel KV"
3. Connect to this project (auto-adds env vars)

### 4. Register Webhook in Shopify

In your Shopify custom app:
1. Settings → Admin API → Webhooks
2. Click "Add webhook"
3. Event: `customers/update`
4. URL: `https://your-project.vercel.app/api/webhooks/customer-update`
5. API version: Latest
6. Save

### 5. Test

1. Go to Shopify admin → Customers → pick a customer
2. Edit their address (add a suite number, change zip, etc.)
3. Save
4. Check your email in ~10 seconds

**Note:** First address change won't email (no prior state to compare). Subsequent changes will.

## How It Works

1. Shopify sends customer update webhook to `/api/webhooks/customer-update`
2. Handler verifies webhook signature against `SHOPIFY_WEBHOOK_SECRET`
3. Fetches previous customer state from Vercel KV
4. Compares addresses
5. If changed, sends email with before/after
6. Stores current state (30-day TTL)

## API Response

- **200 OK** — Webhook processed successfully
- **401 Unauthorized** — Invalid webhook signature
- **405 Method Not Allowed** — Non-POST request
- **500 Error** — Server error (Shopify will retry)
