# Staffany_bot

A Telegram bot for StaffAny staff to check their shifts, see who's rostered on a given day, and swap shifts with each other — built on the [StaffAny Workspace API](https://api.staffany.com/docs).

## How it works

The Workspace API is authenticated with a single org-wide API key (not per-user OAuth), so this bot keeps its own small link table mapping each Telegram user to their StaffAny staff record (matched by phone number via `/registerphone`). Swap offers are tracked locally too; claiming one calls the Workspace API to unassign the original staff member and assign the claimer.

Shift swapping (reassigning a shift slot) requires **Write access** on your Workspace API key, which StaffAny enables separately from (free) Read access. If your key only has Read access, `/offswap` and `/openswaps` still work, but `/takeswap` will fail with a clear error telling you to ask a manager to do it manually.

## Setup

1. Install [Node.js](https://nodejs.org/) 20+.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a Telegram bot via [@BotFather](https://t.me/BotFather) and grab the token.
4. Generate a StaffAny Workspace API key: `app.staffany.com` → Settings → Account & Security → Workspace API Keys.
5. Copy `.env.example` to `.env` and fill in `TELEGRAM_BOT_TOKEN`, `STAFFANY_API_KEY`, and `STAFFANY_TIMEZONE` (the IANA timezone your rosters are scheduled in, e.g. `Asia/Singapore`).
6. Run it:
   ```bash
   npm run dev
   ```
   or build and run compiled JS with `npm run build && npm start`.

## Commands

- `/registerphone` — link your Telegram account to your StaffAny profile by sharing your Telegram phone number (one-tap, no typing)
- `/whoami` — show your linked profile
- `/unlink` — remove the link
- `/myshifts [days]` — your upcoming shifts (default 7 days)
- `/whosworking [today|tomorrow|YYYY-MM-DD]` — who's rostered on a given day
- `/offswap` — shows your upcoming shifts as tappable buttons; tap one to offer it for swap
- `/openswaps` — list open swap offers
- `/takeswap` — shows open swap offers (other than your own) as tappable buttons; tap one to claim it (reassigns the shift to you via the Workspace API)
- `/cancelswap <requestId>` — cancel a swap offer you created

## Data

Links and swap requests are stored in `data/db.json` (gitignored). It's a flat file, fine for a single small team; if you outgrow it, swap `src/store.ts` for a real database without touching the bot commands.

## Notes / limitations

- Staff are matched by phone number against `/workspace/v2/staff`; matching is done on the last 8 digits so `+65 9123 4567`, `6591234567`, and `91234567` all match. If two staff share those last 8 digits, linking is refused rather than guessing — ask a manager to check the number on file.
- The API key inherits the permissions of the StaffAny account that generated it — an Owner key sees the whole org, a Manager key is scoped to their groups.
- There's no "who's available to work" command. StaffAny's `/workspace/v2/leaves/records/search` endpoint (needed to exclude staff on approved leave) is BETA and returned server errors (500) when tried, and its `dateRange.from`/`to` integer format isn't documented — this could be revisited once that endpoint is stable.
