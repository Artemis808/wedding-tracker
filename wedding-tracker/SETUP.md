# 💍 Wedding Expenses Tracker

A shared expense tracker for couples planning a wedding. Both partners see the same data in real-time — add an expense on your phone, your partner sees it on their laptop instantly.

---

## 🎯 What This Does

- **Shared and personal expenses tracked separately** — shared costs split 50-50 automatically, personal expenses (your lehenga, his sherwani) stay separate
- **Splitwise-style settlement** — single bottom-line answer to "who owes whom?"
- **Bill attachments via links** — paste a Google Drive link to any receipt
- **Category budgets with progress bars**
- **Real-time sync** between bride's and groom's devices via Firebase
- **Mobile + Desktop** — same URL works on both, same data shows up everywhere

---

# 🚀 Setup Instructions

You'll need ~15 minutes and these accounts (all free):
- Google account (for Firebase)
- GitHub account (for code hosting)
- Vercel account (sign in with GitHub)

## Step 1 — Create Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Create a project"** → name it `wedding-tracker`
3. **Disable Google Analytics** → Click **Create project**
4. Wait ~30 seconds, then click **Continue**

## Step 2 — Set Up Realtime Database

1. Left sidebar: **Build → Realtime Database**
2. Click **"Create Database"**
3. Choose nearest location (for India: `asia-southeast1`)
4. Select **"Start in test mode"** → **Enable**

## Step 3 — Get Your Firebase Config

1. Click the **⚙️ gear icon** → **Project settings**
2. Scroll to **"Your apps"** → click the **`</>`** (web) icon
3. App nickname: `wedding-web` → **DO NOT** check "Firebase Hosting"
4. Click **Register app**
5. You'll see something like:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "wedding-tracker-xxxxx.firebaseapp.com",
  databaseURL: "https://wedding-tracker-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "wedding-tracker-xxxxx",
  storageBucket: "wedding-tracker-xxxxx.appspot.com",
  messagingSenderId: "...",
  appId: "1:...:web:..."
};
```

**Copy all those values.**

## Step 4 — Paste Config Into the Code

Open **`src/firebase.js`** and replace ALL placeholder values:

```javascript
const firebaseConfig = {
  apiKey:            "PASTE_HERE",
  authDomain:        "PASTE_HERE",
  databaseURL:       "PASTE_HERE",      // ← Must be the full URL Firebase gave you
  projectId:         "PASTE_HERE",
  storageBucket:     "PASTE_HERE",
  messagingSenderId: "PASTE_HERE",
  appId:             "PASTE_HERE",
};
```

> 💡 The most common mistake is the `databaseURL` — copy it **exactly** as shown by Firebase, including any region suffix like `asia-southeast1`.

## Step 5 — Push to GitHub

1. Create a new repo: **https://github.com/new** → name it `wedding-tracker`
2. In your terminal, inside the project folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wedding-tracker.git
git push -u origin main
```

## Step 6 — Deploy on Vercel

1. Go to **https://vercel.com** → sign in with GitHub
2. Click **"Add New Project"** → import your `wedding-tracker` repo
3. Framework Preset: **Create React App** (auto-detected)
4. Click **Deploy** — wait ~2 minutes

🎉 You'll get a URL like `wedding-tracker-xyz.vercel.app`

**Share this URL with your partner.** Both of you will see the same data on phone, tablet, or computer.

## Step 7 — Secure Your Database (Within 30 Days)

Test mode expires after 30 days. To prevent your database from locking up:

1. **Firebase Console → Realtime Database → Rules** tab
2. Replace with:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

3. Click **Publish**

This is safe for a private wedding tracker (no card numbers, no passwords). The URL is hard to guess, and there's no sensitive financial data.

---

# 📖 User Guide

## How to Open It

Once deployed, your Vercel URL works on:
- **Phone** (iOS Safari, Android Chrome) — same as a regular website
- **Tablet** — same URL
- **Computer** — any browser

**Bookmark the URL on all your devices.** Both of you should bookmark it too. You can also "Add to Home Screen" on your phone to make it feel like an app.

## The Three Tabs (Bottom Bar)

**◈ Dashboard** — Your summary
- Total budget, total spent, remaining
- Settlement box: who owes whom right now
- Bride/Groom personal totals
- Category breakdown with progress bars

**◎ Expenses** — Add and view all entries
- Filter: All / Shared / Bride / Groom
- Each card shows: title, date, category, who paid, bill link

**▣ Budget** — Set your numbers
- Edit total budget
- Click "Edit" to adjust category allocations

## Sync Indicator (in the header)

Next to "Wedding Planner" you'll see a small pill:
- **● SYNCED** (green) — connected, changes save instantly
- **● OFFLINE** (red, pulsing) — no internet, changes will queue and sync when reconnected

## Example 1: Adding a Shared Expense

**Scenario:** Photographer costs ₹1,05,000. You paid ₹20,000 as advance.

1. Tap **◎ Expenses** → **+ Add Expense**
2. Choose **🤝 Shared (50-50)**
3. Fill in:
   - **Date**: when you paid
   - **Description**: "Photographer advance"
   - **Category**: Photography
   - **Total Cost of Item**: `105000` ← the FULL amount
   - **Paid By**: Bride
   - **Amount Paid Now**: `20000`
   - **Bill Link**: paste Google Drive link
4. **Save**

Dashboard immediately shows: **Groom owes Bride ₹10,000**

> Why ₹10,000? Bride paid ₹20,000 on behalf of both. Her half (₹10,000) was her own share; the other ₹10,000 was the groom's share she fronted. He owes her that ₹10,000.

## Example 2: Adding a Personal Expense

**Scenario:** Bridal lehenga, ₹85,000.

1. **+ Add Expense**
2. Choose **👤 Personal**
3. Pick **✿ Bride**
4. Fill in date, description, category (Apparel), amount, bill link
5. **Save**

Personal expenses don't affect the settlement — they're tracked under the Bride/Groom Personal cards on the dashboard.

## Example 3: Multiple Payments to One Vendor

For installments (e.g. photographer paid in stages), add each as a separate row:

| Description           | Total Cost | Paid By | Amount Paid |
|-----------------------|------------|---------|-------------|
| Photographer advance  | 1,05,000   | Bride   | 20,000      |
| Photographer milestone| 1,05,000   | Groom   | 50,000      |
| Photographer final    | 1,05,000   | Both    | 35,000      |

Keep **Total Cost** the same so the dashboard knows the full obligation. Only **Amount Paid** changes each time.

## Uploading Bills

The app doesn't store image files (that costs money on Firebase). Instead, use Google Drive:

1. Upload receipt to **Google Drive** (use a "Wedding Bills" folder)
2. Right-click the file → **Get link** → set to **"Anyone with the link can view"**
3. Copy the link
4. Paste it in the **Bill / Invoice Link** field
5. Both of you can tap **📎 View Bill / Invoice** to open it

> Pro tip: name files like `2026-02-12_photographer_advance.jpg` so they're easy to find later.

## Editing or Deleting

Tap any expense card → **Edit** or **Delete** buttons appear at the bottom.

---

# 🛡️ Free Tier Limits

| Resource              | Free Limit       | Your Likely Usage |
|-----------------------|------------------|-------------------|
| Firebase storage      | 1 GB             | ~1 MB             |
| Firebase downloads    | 10 GB / month    | ~10 MB / month    |
| Firebase connections  | 100 simultaneous | 2                 |
| Vercel deployments    | Unlimited        | A handful         |
| Vercel bandwidth      | 100 GB / month   | ~100 MB / month   |

You'll use less than 0.1% of any free tier.

---

# 🔧 Troubleshooting

**"⚠️ Can't connect to database" error screen**
→ Your `databaseURL` in `firebase.js` is wrong, or your Realtime Database rules block read/write. Re-check Step 4 and Step 7.

**Sync indicator stuck on "OFFLINE"**
→ No internet, or Firebase rules blocking. Open the page in an incognito window to test.

**Vercel build fails**
→ Make sure all files are pushed to GitHub. Check that `package.json` is in the repo root.

**Data not appearing on partner's device**
→ Both must use the **exact same Vercel URL**. Bookmark it.

**Want to reset everything**
→ Firebase Console → Realtime Database → three dots at top of data → **Delete**.

---

Made with care for your special day. 💍
