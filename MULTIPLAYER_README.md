# Plungee multiplayer lobby – first stage

Copy the files over the project root, run `npm install`, then `npm run build`.

Netlify env: `VITE_APINATOR_KEY` (public), `APINATOR_SECRET` (secret), `APINATOR_KEY` (same public key for signing), `VITE_APINATOR_CLUSTER` (`us` or `eu` matching your Apinator app). Existing Upstash credentials are also required.

Run locally with `npx netlify dev`. Test with two browsers / private window, create lobby and join with code or invite link.

This is the lobby connectivity milestone only: no ready state, settings, gameplay, or race replay yet.

Limitations: the Redis room member set persists for up to 2 hours; a browser tab closed without leaving may temporarily occupy a slot. The room creator closing the tab without clicking Back also leaves an orphaned room until expiry. Room codes are invitation secrets, not user accounts. Do not treat host identity as trusted solely from the client. The frontend is not yet hooked into a dedicated character lobby animation.

**Verification:** TypeScript/build and live Apinator connection were not executed in this environment.
