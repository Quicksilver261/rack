# Luck Jump

Git-based distribution version of the mini game.

## How to publish with GitHub Pages

1. Push this repository to GitHub.
2. In GitHub repository settings, add Actions secret `API_BASE` with this value:
	- `https://luck-leaderboard.gingingin20050806.workers.dev`
3. Run or trigger `.github/workflows/pages.yml`.
4. Open the published page URL from the workflow run result.

## Files

- `luck_single.html`: single-file game build
- `config.js`: public runtime config for leaderboard access
- `netlify/functions/*`: old Netlify functions kept for reference

## Leaderboard

The leaderboard uses the Worker proxy through `window.LUCK_CONFIG.apiBase`.
If `apiBase` is empty, the game still runs but only the local leaderboard is used.
