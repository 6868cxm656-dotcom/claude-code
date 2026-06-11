# Putting the risk register behind a staff-only login (Cloudflare Access)

Goal: the register lives at a private URL (e.g. `https://tcf-risk-register.pages.dev`).
Anyone opening it must verify a `@churchillfellowship.org` email address with a
one-time PIN before they see anything. Free for up to 50 users.

The repo's `cloudflare-pages` branch contains just `index.html` (the register).
Cloudflare deploys from that branch, so every register update pushed to it goes
live automatically.

## One-time setup (~20 minutes, done by the repo owner)

### A. Make the GitHub repo private (if not already done)
1. github.com → this repository → **Settings** → **General**.
2. Scroll to **Danger Zone** → **Change visibility** → **Make private**.

### B. Create the Cloudflare site
1. Sign up free at **dash.cloudflare.com** (use your work email).
2. In the dashboard: **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Authorise the GitHub connection and grant it access to this repository.
4. Select the repository, then configure:
   - **Project name**: `tcf-risk-register` (this becomes the URL — must be globally unique, adjust if taken)
   - **Production branch**: `cloudflare-pages`
   - **Framework preset**: None · **Build command**: (leave empty) · **Build output directory**: `/`
5. **Save and Deploy**. After ~1 minute the site is live at `https://<project-name>.pages.dev`
   — but still public. Do not stop here.

### C. Lock it down with Cloudflare Access
1. In the Cloudflare dashboard sidebar: **Zero Trust** (first visit asks you to pick a
   team name — anything, e.g. `tcf` — and the **Free** plan).
2. Go to your Pages project → **Settings** → **General** → **Access policy** → **Enable**.
   This creates an Access application protecting the project's preview URLs.
3. In **Zero Trust** → **Access** → **Applications**, open the application that was
   just created and click **Edit**:
   - Under the application domains, **add** the production domain
     `<project-name>.pages.dev` (the auto-created entry only covers `*.<project-name>.pages.dev` previews).
4. Edit the **policy**:
   - Action: **Allow**
   - Include → **Emails ending in** → `@churchillfellowship.org`
   - Save. (One-time PIN login is on by default — no passwords to manage.)

### D. Test
Open `https://<project-name>.pages.dev` in a private/incognito window:
you should hit a Cloudflare login page. Enter a work email → receive a PIN →
enter it → see the register. Try a personal email: it should be refused.

## Ongoing
- **Updating the register**: push the new `tcf-risk-register.html` as `index.html`
  to the `cloudflare-pages` branch; Cloudflare redeploys automatically in ~1 minute.
- **Who can get in**: anyone with a `@churchillfellowship.org` mailbox. To restrict
  further (named individuals only), change the policy Include rule to a list of emails.
- **Sessions** last 24h by default before re-verification.
- Optional later: a custom domain like `risk.churchillfellowship.org` (requires adding
  a CNAME in your DNS; the Access policy extends to it in the same application).
