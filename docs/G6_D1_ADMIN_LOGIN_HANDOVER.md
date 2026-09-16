# G6-D.1 — operations login deployment handover

The operations console now uses an invite-only Netlify Identity account. Operators enter only their
administrator email (shown as **Username**) and password. A same-origin Netlify Function verifies
the signed-in identity, checks it against one authorized email, and proxies only the existing
read-only operations GET routes to Render.

## Required one-time Netlify configuration

1. In the `alderfell-operations` Netlify project, enable **Identity**.
2. Set registration to **Invite only**. Do not enable public sign-ups.
3. Invite the owner's administrator email. Use that exact lowercase email in
   `ADMIN_AUTHORIZED_EMAIL` below.
4. Add these runtime environment variables for Production (and Deploy Previews only if previews
   should reach production data):

   | Variable                     | Value                                                             |
   | ---------------------------- | ----------------------------------------------------------------- |
   | `ALDERFELL_SERVER_URL`       | `https://alderfell-server.onrender.com`                           |
   | `ADMIN_AUTHORIZED_EMAIL`     | The single invited administrator email                            |
   | `ALDERFELL_ADMIN_READ_TOKEN` | A newly rotated random token matching Render's `ADMIN_READ_TOKEN` |

5. Rotate the old admin read token because it was previously shared in conversation. Generate at
   least 32 random bytes in a password manager; set the same replacement as Render
   `ADMIN_READ_TOKEN` and Netlify `ALDERFELL_ADMIN_READ_TOKEN`. Never use a `VITE_` prefix.
6. Redeploy Render, verify `/readyz`, then redeploy the operations site from current `main`.
7. Open the Netlify invitation email on the operations domain, create a password of at least 12
   characters, and store it in a password manager.

## Acceptance checks

- The initial page shows only Username and Password—no endpoint or token field.
- A wrong password shows a generic refusal and reveals neither account existence nor server data.
- An Identity user whose email differs from `ADMIN_AUTHORIZED_EMAIL` receives no operations data.
- Login reaches Overview; Players, Reports, Events, save detail, snapshots, and restore audit work.
- Reload remains signed in; **Sign out** returns to the login screen and protected requests fail.
- **Forgot password?** sends the standard Netlify recovery email and accepts a new password.
- POST, PUT, PATCH, and DELETE against the proxy return 405; unrecognized paths return 404.
- Browser source, local UI fields, URLs, and network request URLs never contain the Render token.
- Render and Netlify secret values are never displayed, copied into documentation, or committed.

## Rollback and emergency access

The Render `ADMIN_READ_TOKEN` route remains available as a break-glass server credential, but the
browser UI no longer accepts it. If Identity or the proxy is unavailable, operators can roll back
the Netlify deployment without changing player data. Rotating the Render/Netlify token invalidates
the prior proxy credential immediately.
