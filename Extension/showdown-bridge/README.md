# Pokemon Champions Showdown Bridge

Load this folder as an unpacked Chrome extension.

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select `Extension/showdown-bridge`.
5. Reload any already-open Pokemon Showdown and helper app tabs so the content
   scripts attach.
6. Keep one tab on Pokemon Showdown and one tab on this app.

The bridge injects a page-context probe into Pokemon Showdown, reads the active
`BattleRoom` runtime state, and relays sanitized snapshots into the helper app.
The popup does not need to stay open because all relay work runs through content
scripts and the extension service worker.
