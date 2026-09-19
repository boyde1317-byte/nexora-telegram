# TESTING.md — On-Device Verification Checklist

Run this on a **real phone** after every Railway deploy. Rich messages can
only be trusted when they render on actual WhatsApp clients — the harness
proves the payloads are well-formed; the device proves WhatsApp accepts them.

**Setup:** redeploy on Railway with these Variables set —
`OWNER_NUMBERS`, `SUPER_OWNER_NUMBERS`, `GROQ_API_KEY` (free key from
console.groq.com). Watch the deploy logs for the pairing code on first boot.

---

## 1. Core Audit (run first)

- [ ] `.testrich` — all 15 message types render, no ⚠️ marks in the report
- [ ] `.testmessage` — native list picker opens and dispatches rows
- [ ] `.ping` — product-card monitor renders (not plain text)
- [ ] `.menu` — category picker opens; tap a category → `.help` command picker opens; tap a command → detail card shows the 📋 Copy button
- [ ] Plain-fallback check: set `NEXORA_RICH_RESPONSE=0`, redeploy, confirm `.menu` still works as plain text, then set it back

## 2. New Features (this deploy)

### 🗺️ Group heatmap
- [ ] `.heatchart` in an active group — 24h bar chart renders in a native card with the copy button
- [ ] After the group chats for a while, re-run — peak hour / top talkers are non-empty
- [ ] `.heatchart` in a DM → correct "needs a group" info reply

### 🛒 Order flow
- [ ] `.store` — plan picker rows show "Tap to order"; tapping a plan files an order
- [ ] Super owner: Approve/Deny card lands in DM within seconds
- [ ] Approve → buyer gets a DM with the wa.me payment link; `.order list` shows empty
- [ ] Deny → buyer gets the decline notice
- [ ] Second `.order` before approval → "already have a pending order" warning

### 🎤 Voice remix
- [ ] Reply to a voice note with `.remix corporate` → a new voice note comes back in that style
- [ ] `.remix shakespeare` / `.remix genz` / `.remix pirate` / `.remix yoda` / `.remix gordon` all return voice
- [ ] `.remix` with no reply → usage card lists the styles

## 3. Multi-Session & Pairing (super owner required)

- [ ] `.pair <number>` from super owner — pairing code arrives in DM (group runs) or in chat (DM runs), with the 📋 Copy Code button
- [ ] Non-super-owner `.pair <number>` → request filed; Approve/Deny card in super owner DM
- [ ] `.pairapprove` → code goes to requester's DM; linked number boots as its own bot
- [ ] `.sessions` lists it; `.delsession <number>` unpairs it; `.logoutall` wipes all
- [ ] Lifecycle DM (link/unlink notices) arrives in super owner DM

## 4. Rich Media & Pickers

- [ ] `.play <song>` — single-select picker shows the YouTube thumbnail in the header; pill tap downloads
- [ ] `.pin <query>` — v2multiimg gallery of pins, tappable
- [ ] `.tt <tiktok url>` — downloads without watermark (backend1 must be up)
- [ ] `.fb <facebook url>` — inline video card
- [ ] `.math <expr>` — LaTeX answer card
- [ ] `.weather <city>` — map + table combo
- [ ] `.takeall` in a group with other people's stickers — packs members' stickers, not just the bot's

## 5. Greetings & VCard

- [ ] `.greetings off` in a group → welcome AND goodbye suppressed; `.greetings on` restores
- [ ] New member joins → welcome card renders with vCard AI quote (verify the quote rotates between joins)
- [ ] `.welcome off` alone only kills welcome

---

**Found something broken on device?** Note the command, what rendered vs
what was expected, and the client (Android/iOS/Web). Fix, redeploy, re-run
just that section.
