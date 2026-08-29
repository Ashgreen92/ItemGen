# SnapStock — setup (browser only, no Node/VS Code needed)

## 1. Supabase (shared database)

1. Go to supabase.com, sign up free, create a new project.
2. Open the **SQL Editor** (left sidebar) and run this to create the table:

```sql
create table items (
  id uuid primary key default gen_random_uuid(),
  title text default 'Untitled item',
  description text default '',
  category text default '',
  condition text default '',
  brand text default '',
  price_low numeric,
  price_high numeric,
  confidence text,
  notes text,
  status text default 'processing',
  photos text[] default '{}',
  thumbnail text,
  created_at timestamptz default now()
);

alter table items enable row level security;

create policy "allow all for this app" on items
  for all using (true) with check (true);
```

3. Go to **Project Settings > API**. Copy the **Project URL** and the **anon public key** — you'll need both for step 3 below.

> Note: the policy above allows anyone with your Supabase keys to read/write the table. That's fine here because the app itself is passcode-protected and the data (resale photos) isn't sensitive — but it's worth knowing this isn't bank-grade security, just enough friction to keep it private between you and your partner.

## 2. GitHub (holds the code, browser only)

1. Go to github.com, sign up free if you don't have an account.
2. Create a new **empty** repository (e.g. "snapstock").
3. Use **Add file > Upload files** and drag in every file from this project, keeping the folder structure (`pages/`, `pages/api/`, `lib/`, `styles/` should stay as folders — GitHub's uploader preserves this if you drag the whole extracted folder in).
4. Commit.

## 3. Vercel (hosting)

1. Go to vercel.com, sign up free using your GitHub account (this connects them automatically).
2. Click **Add New > Project**, pick your snapstock repository, click **Import**.
3. Before deploying, open **Environment Variables** and add these four (values from steps 1 and console.anthropic.com):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`
   - `NEXT_PUBLIC_APP_PASSCODE`
4. Click **Deploy**. Wait a minute or two.
5. You'll get a live URL like `snapstock-yourname.vercel.app` — this works from any phone or laptop browser.

## 4. On your phone

1. Open the Vercel URL in your phone's normal browser (not through Claude).
2. Enter the passcode.
3. Tap **Take photo** — your phone's real camera will open this time, since it's a real website, not an embedded artifact.
4. Optional: use your browser's **Add to Home Screen** to get an app icon.

Send the same URL and passcode to your partner — they'll see the same shared stock list on their own phone or laptop.

## Updating later

Any time I give you updated files, just re-upload the changed ones to the same GitHub repo (Add file > Upload files, same filenames) — Vercel redeploys automatically within a minute or two.
