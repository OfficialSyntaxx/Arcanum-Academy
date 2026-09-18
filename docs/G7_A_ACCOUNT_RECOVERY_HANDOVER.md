# G7-A — player account recovery deployment handover

G7-A lets a player protect the existing anonymous character with a separate Netlify Identity
login and recover it after clearing browser storage or moving devices. Render remains the only
authority for player IDs and saves. Passwords are handled only by Netlify Identity.

## Production configuration

Use the **player game's Netlify site**, not the invite-only Alderfell Operations site.

1. Enable Netlify Identity on the player site.
2. Set registration to **Open** and require email confirmation. Leave the operations tenant
   Invite-only; the two user directories must stay separate.
3. Generate a new random secret of at least 32 bytes. Store the same value in:
   - Render: `ACCOUNT_BRIDGE_SECRET`
   - player Netlify site: `ALDERFELL_ACCOUNT_BRIDGE_SECRET`
4. On the player Netlify site set `ALDERFELL_SERVER_URL` to
   `https://alderfell-server.onrender.com` (HTTPS, no trailing path).
5. Do not create a `VITE_*` version of either value. They are function-runtime secrets and must
   never be bundled into the browser.
6. Deploy Render first, wait for `/readyz` to return 200, then deploy the player Netlify site.

## Acceptance test

Use a disposable test character and two clean/private browser sessions.

- Browser A: enter the game, wait for Connected, expand the connection dot, open **Account**.
- Create a player login, confirm the email, sign in, then choose **Protect this character**.
- Confirm the page reloads and the same player ID/progress returns.
- Browser B: open the game, open **Account**, sign into the same player login, and choose
  **Recover my character**.
- Confirm Browser B reloads into the original player ID and authoritative progress.
- Reload Browser A. Its old rotated token must no longer authenticate; use recovery there if you
  want to move the active login back.
- Test **Forgot password?** and confirm the reset link permits recovery after changing the password.
- Attempt to protect a second player with the same login. It must be refused without altering
  either save.

## Security invariants

- Netlify's stable user ID, not the mutable email address, is the recovery key.
- Linking proves possession of the current Alderfell bearer token.
- Link and recovery rotate the bearer; only the newest token works.
- One Netlify user maps to one Alderfell player, and one player maps to one Netlify user.
- The browser calls only the same-origin Netlify Function. The bridge secret is used server to
  server and account routes are hidden with 404 when it is absent or incorrect.
- Recovery returns the same authoritative player record; it does not copy or merge saves.

## Rollback

Remove `ACCOUNT_BRIDGE_SECRET` from Render and redeploy. The account HTTP routes will not be
registered. Existing device tokens and linked database rows remain intact, so the feature can be
re-enabled without relinking players.
