# G8-D — public profile links

G8-D completes the asynchronous social-read release with shareable profile links. Selecting an
opted-in public profile updates the current same-origin URL with only that profile's opaque public
ID. Opening the link opens Profile and loads the public comparison automatically. The **Share**
button uses the platform share sheet where available (including iPhone); compatible desktop browsers
fall back to copying the link.

## Privacy boundary

The query parameter is an opaque public profile ID, never the internal player ID, account subject,
recovery token, or a serialized save. The client treats it only as a format-bounded lookup key. The
server remains the authority that resolves it only for a currently opted-in profile; unknown,
private, and malformed IDs return no public detail.

No messaging, friend graph, presence, location sharing, or social write is introduced.

## Acceptance

With two opted-in accounts, select one in Hiscores and press **Share**. Open the link in a clean
browser session and confirm Profile opens to the selected public comparison. Close the comparison or
Profile and confirm the `profile` parameter is removed. Disable the selected account's public
listing, reopen the old link, and confirm no profile data appears.
