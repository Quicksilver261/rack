# Luck Jump

Git-based distribution version of the mini game.

## How to publish with GitHub Pages

1. Set your Supabase project URL and public anon key in `config.js`.
2. Push this repository to GitHub.
3. Enable GitHub Pages with the workflow in `.github/workflows/pages.yml`.

## Files

- `luck_single.html`: single-file game build
- `config.js`: public runtime config for leaderboard access
- `netlify/functions/*`: old Netlify functions kept for reference

## Leaderboard

The leaderboard reads and writes directly to Supabase when `config.js` is filled in.
If the config is empty, the game still runs but only the local leaderboard is used.
