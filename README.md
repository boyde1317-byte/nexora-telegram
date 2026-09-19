<div align="center">

```
╭─────────────────────────────────────────────────────╮
│                                                     │
│          ███╗   ██╗███████╗██╗  ██╗ ██████╗ ██████╗ █████╗         │
│          ████╗  ██║██╔════╝╚██╗ ██╔╝██╔═══██╗██╔══██╗██╔══██╗        │
│          ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║██████╔╝███████║        │
│          ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║██╔══██║██╔══██║        │
│          ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝██║  ██║██║  ██║        │
│          ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝        │
│                                                     │
│        Rich-native WhatsApp bot platform            │
│              By Aizen • v2.0.0                      │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://www.whatsapp.com)
[![Baileys](https://img.shields.io/badge/Baileys-v0.3.18--r6-FF6B35?style=for-the-badge)](https://github.com/boyde1317-byte/baileys)
[![Commands](https://img.shields.io/badge/Commands-181+-purple?style=for-the-badge)](#-command-reference)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

</div>

---

## ✨ What is NEXORA MD?

**NEXORA MD** is a production WhatsApp multi-device bot platform — **181 commands** across 15 categories, with a rich-message engine that makes the bot *feel native*: tappable pickers, copy-code buttons, interactive approval cards, image headers, voice synthesis, and full-text fallbacks everywhere.

Built on a **pinned private Baileys fork** ([`boyde1317-byte/baileys#v0.3.18-r6`](https://github.com/boyde1317-byte/baileys)) with device-verified rich-message generators. Every rich surface ships with a plain-text fallback, so nothing breaks when WhatsApp changes things underneath you.

---

## 🚀 Feature Highlights

### 🎨 Rich-Native Messaging (default ON)
- **Proven native-flow primitives only**: `quick_reply`, `cta_url`, `cta_copy`, `cta_call`, `single_select`, `cta_reminder`, `cta_cancel_reminder`, `send_location`, `address_message` — button taps dispatch their commands automatically
- **Tappable command directory**: `.menu` → category picker → `.help <category>` → command picker → detail card with a copy-command button
- **Media pickers with thumbnails**: `.play` / `.ytmp4` single-selects show the YouTube thumbnail as the card header
- **Interactive approval cards**: pairing requests and server orders land in the super owner's DM with native Approve / Deny buttons
- **LaTeX, maps, tables, galleries** as native cards (`.math`, `.locate`, `.weather`, `.pin`)
- Rollback to plain-text mode with `NEXORA_RICH_RESPONSE=0`; audit any device with `.testrich` (15 message types) or `.testmessage`
- **Sticker → command mapping**: tap a sticker and it runs its mapped command

### 👥 Multi-Session Pairing
- Link up to **5 additional WhatsApp numbers**, each running as its own NEXORA bot (`.pair`)
- **Super-owner tier** (`SUPER_OWNER_NUMBERS`): the super owner pairs directly and manages every session; everyone else files a *request* — an Approve/Deny card lands in the super owner's DM (`.pairapprove` / `.pairdeny` / `.pairrequests`), codes always DM'd, never posted to groups
- Session lifecycle alerts to the super owner's DM; `.logoutall` wipes every paired session at once
- Auto-resume on restart, auto-retry for transient pairing drops, 515-status resumption on socket loss

### 🧠 Multi-Provider AI
- **Provider walk with call-time fallback**: Gemini (image generation) → Groq (text + vision, free tier) → Mistral → OpenRouter — the first working provider is memoized
- Chat, code, proofread, translate, brainstorm, vision, step-by-step math with native LaTeX
- **`.remix`** — reply to a voice note: whisper-large-v3 transcription → style rewrite (corporate, Shakespeare, Gen Z, pirate, Yoda, Gordon Ramsay) → synthesized back **as a voice note**
- AI auto-reply mode (`.chatbot`) for non-command messages

### 💰 Economy & Engagement
- Coins, XP, levels, streaks, daily rewards (`.daily`), leaderboards, gambling and trivia games
- `.shop` — native tappable picker; buy custom titles, menu themes, sticker slots, XP boosts
- Passive XP from real chat activity

### 🖥️ Built-In Storefront
- `.store` — interactive plan picker; tapping a plan **files an order** (`.order`), the super owner approves from their DM, and the buyer gets a payment link automatically

### 👥 Group Management
- `.heatchart` — a heatmap of when your group is actually alive: 24-hour activity chart, peak/dead hours, top talkers
- Welcome/goodbye cards (`.welcome`, `.goodbye`, `.greetings`), anti-link, anti-tag-spam, warns, timeouts, hidetag, sticker-pack theft (`.takeall`), Group Stories, polls, and events

### 📥 Downloaders
- YouTube (audio + video, with thumbnail pickers), TikTok, Facebook, Instagram, X, Spotify, Pinterest, APKs — plus `.download`, a smart auto-detecting downloader that routes any pasted URL to the right handler

### ⚙️ Ops & Reliability
- Pairing-code auth for headless deploys; graceful SIGTERM shutdown; 60s auto-save; bounded message cache; exponential reconnect backoff; `.connection` health dashboard; hot-reload without restart; per-plugin error tracking (`.stats`)

---

## 📋 Command Reference

Commands work with any configured prefix (`.` is the default). **181 commands** across 15 categories:

> `.menu` opens the native tappable directory — the fastest way to browse. `.help <category>` drills into any category, `.help <command>` shows a detail card with a copy button.

#### 🌐 General

| Command | Aliases | Description |
|---------|---------|-------------|
| `.about` | info, botinfo | Shows detailed bot and system information |
| `.brand` | brandcard | Interactive brand card with a full-screen brand details sheet (Moonson-style) |
| `.credits` | credit, dev | Shows bot developer, framework, and version credits |
| `.event` | createevent, meet | Generates a WhatsApp native event card in the chat |
| `.help` | categories, modules | Browse command categories |
| `.locate` | map, where | Pin any place on a live map card |
| `.menu` | ? | Shows the interactive command menu in your active presentation style |
| `.menulist` | styles, menus | Lists all available menu presentation styles — tap to switch instantly |
| `.channel` | newsletter, ch | Full WhatsApp Channel/Newsletter Manager — create, follow, info, and more |
| `.order` | orders, buyserver | Order a server plan |
| `.owner` | creator, dev, developer | Shows the bot owner's contact card |
| `.ping` | p, speed | Measures the response speed of the bot |
| `.poll` | vote, survey | Creates a custom interactive poll in the chat |
| `.stats` | botstats, sysstats | Shows comprehensive bot statistics — uptime, memory, commands, and health |
| `.store` | servers, hosting | Server hosting plans with an interactive plan picker (Moonson-style card) |
| `.version` | v, ver | Displays current bot, developer, core, and runtime version details |

#### 📥 Downloaders

| Command | Aliases | Description |
|---------|---------|-------------|
| `.apk` | apkdl | Searches for Android APKs |
| `.fb` | facebook, fbdl | Downloads a Facebook video |
| `.githubrelease` | ghrelease, release | Get the latest release of a GitHub repository |
| `.ig` | instagram, igdl | Downloads Instagram posts, reels, and stories |
| `.chanreact` | chreact, creact, chanreaction | React to a Channel post (owner) — \`.chanreact <post link> <emoji>\`, \`.chanreact off <link>\` removes it |
| `.logo` | logomaker, makelogo | AI logo maker — \`.logo <text> [style]\` (minimalist default), \`.logo styles\` lists all |
| `.neon` | neonlogo | Neon sign logo — \`.neon <text>\` |
| `.gaming` | esports, esportslogo | Esports mascot emblem logo |
| `.fire` | firelogo | Blazing flame-text logo |
| `.glass` | glasslogo | Glassmorphism badge logo |
| `.metallic` | 3d, threed, chrome | 3D chrome/gold metallic logo |
| `.share` | copycard | Any text as a tappable copy-card (wallet addresses, WiFi passwords, links) with a native cta_copy button |
| `.warns` | | View/forgive protection strikes: richTable overview, `.warns reset @user` — dispatched by the strike card's quick-replies |
| `.wordchain scores` | | In-game scoreboard as richTableCard (per-player word attribution) |
| `.remind` | reminder, remindme | Persistent reminders: `.remind 30m|2h30m|1d <text>`, list (rich table), cancel/clear. Survive restarts; missed ones delivered up to 24h late. Native device-clock CTA gated behind NEXORA_REMINDER_CTA=1 |
| `.meme` | memes | Fresh memes in ONE stacked rich message — short title on top of each inline image. `.meme [1-5] [dank\|wholesome\|meirl\|programming]` |
| `.setchannel` | — | Owner: sets/clears the channel pill on menu cards (`.setchannel <name> <...@newsletter>` / `off`). Auto-captured by `.channel create` |
| `.backup` | — | Owner database-backup manager: status, now (snapshot), list, restore (safety copy first). Auto: 24h snapshots, 7-day retention |
| `.viewonce` | vv, reveal, readonce | View Once reader — reply to a one-view photo/video/voice note to reveal it (group admins only) |
| `.mascot` | wolf, wolflogo | Wolf mascot badge logo |
| `.retro` | vintage, retrologo | 70s vintage badge logo |
| `.channels` | chan, chans, mychannels, newsletters | List the WhatsApp channels this bot follows (owner) |
| `.download` | dl, autodl | Smart downloader — paste any URL and it auto-detects the platform |
| `.pinterest` | pin, pindl | Searches Pinterest and sends images directly |
| `.play` | yta, ytmp3 | Search & download YouTube audio |
| `.spotify` | sp, spdl | Downloads a Spotify track as mp3 |
| `.tiktok` | tt, ttdl | Downloads a TikTok video without the watermark |
| `.ttmp3` | tmp3, ttaudio, tiktokmp3 | Download a TikTok as MP3 audio — playable audio message, document fallback over 16 MB, ffmpeg extraction fallback
| `.twitter` | x, twdl, xdl | Downloads a video from an X/Twitter post |
| `.ytmp4` | ytv, youtube | Search & download YouTube video |

#### 🎬 Media

| Command | Aliases | Description |
|---------|---------|-------------|
| `.artist` | singer, band | Search for an artist on iTunes |
| `.download` | dl, save, get | Downloads and returns media from a replied message, effectively bypassing View Once limits |
| `.movie` | imdb, omdb | Lookup movie or series information |
| `.podcast` | podcasts | Search for a podcast on iTunes |
| `.remix` | style, redub | Reply to a voice note to get it back rewritten in a style, as a new voice note |
| `.sticker` | s, wm, pack | Convert image/video to sticker |

#### 👥 Group

| Command | Aliases | Description |
|---------|---------|-------------|
| `.antilink` | antilinks, nolink | Toggle anti-link protection |
| `.antitag` | antimention, notag | Toggle protection against mass-mention ("tag everyone") spam by non-admins |
| `.antibot` | nobots | STRONG anti-bot: join gate (verified bot names turned away), instant removal for bot-named members, behavior scoring (menu walls, foreign command streaks). Subcommands: `on/off/status`, `scan` (audit members), `whitelist/unwhitelist @user`, `list` |
| `.antisticker` | nosticker | Toggle non-admin sticker deletion (shared 3-strike counter) |
| `.antispam` | antiflood | Toggle flood control — 5 messages / 8s window (shared 3-strike counter) |
| `.antiword` | bannedwords | Banned-word filter. Subcommands: `add/remove/list` — word-boundary matching |
| `.antidelete` | snitch | Repost deleted messages (deleted-message snitch mode) |
| `.antiviewonce` | noviewonce | Auto-rescue view-once media and repost it |
| `.antiforeign` | localonly | Country-code join filter. Subcommands: `on/off/status`, `allow/remove <cc>`, `list` |
| `.copylink` | gcl | Get the current group's invite link with a copy button |
| `.demote` | unadmin, dm | Demotes a group admin back to regular participant |
| `.gcstory` | groupstory, swgc, gstatus | Sends a Group Story (status) to the current group |
| `.groupinfo` | ginfo, gcinfo, groupdetails | Shows detailed metadata for the current group |
| `.grouplink` | invitelink, invite | Gets or resets the group invite link |
| `.groupsettings` | gset, open, close | Change group settings |
| `.joinreq` | joinrequests, jreq, jr, pending | Manage pending join requests — list, approve/reject one or all, toggle the join-approval gate |
| `.heatchart` | heat, activity | When this group is actually alive — hourly activity chart, peak hours, and top talkers |
| `.hidetag` | htag, stag, silentall | Mentions all group members silently — no @names shown in the message |
| `.kick` | remove, k | Removes a participant from the group |
| `.mute` | closegroup | Mutes the group so only admins can send messages |
| `.promote` | admin, pm | Promotes a group participant to Group Admin |
| `.setcmd` | | Group admins define custom text commands (.setcmd .name text, {sender}/{chat} placeholders, never shadow built-ins) |
| `.broadcast` | | Owner announcement to every group the bot is in, paced (dry run: .broadcast count) |
| `.subscribe` | | Daily fact digest at 08:00 for this chat (.subscribe status / .unsubscribe) |
| `.del` | | Reply to any message and delete it for everyone — own messages anytime, members' messages when the bot is group admin |
| `.delall` `.clearchat` | | Sweep every message the bot recently sent in this chat (paced deletes, tracks rich sends too) |
| `.purge` | prune, delmsg | Delete multiple messages |
| `.revoke` | resetlink | Revokes the current group invite link and generates a new one |
| `.setdesc` | - | Changes the group description |
| `.setgcpp` | gcpp, grouppp, setgroupicon | Sets or removes the group profile picture |
| `.setname` | - | Changes the group subject/name |
| `.tagall` | everyone, all, announce | Mentions all participants in the group with an optional message |
| `.taginfo` | whois, userinfo2, checkuser | Show info about a user |
| `.timeout` | muteuser, tempmute, shh | Temporarily mute a user |
| `.unmute` | opengroup | Unmutes the group so all participants can send messages |
| `.warn` | warning | Warn a user |

#### 🧠 AI & Tools

| Command | Aliases | Description |
|---------|---------|-------------|
| `.ai` | gpt, ask, chat | Chat with Nexora AI |
| `.brainstorm` | ideas, ideate | Generates creative ideas on a topic |
| `.chatbot` | autoreply, aireply | Toggle AI auto-reply for non-command messages |
| `.code` | codegen, coder | Generate code with Nexora AI |
| `.debug` | fixcode | Analyzes code for bugs and provides a fix |
| `.math` | solve | Step-by-step math solver with native LaTeX |
| `.calc` | calculate | Quick calculator — +, -, *, /, %, sqrt and more |
| `.proofread` | grammar, fixtext | Proofreads and corrects grammar/spelling |
| `.translate` | tr, trans, translator | Translate text |
| `.vision` | analyze, imageai | Analyzes an image using AI |

#### 🪙 Economy

| Command | Aliases | Description |
|---------|---------|-------------|
| `.balance` | bal, wallet, coins | Quick check of your coin balance, XP, and level |
| `.daily` | claim, dailyreward, checkin | Claim your daily reward |
| `.leaderboard` | lb, top, topusers | Shows top users by XP |
| `.profile` | prof, stats, rank | Shows your profile — level, XP, coins, streak and rank |
| `.settitle` | title, mytitle | Set a custom title on your profile (requires shop purchase) |
| `.shop` | buy | Spend your coins on perks |

#### 🎮 Games

| Command | Aliases | Description |
|---------|---------|-------------|
| `.bet` | gamble, casino | Gamble coins |
| `.rps` | rockpaperscissors | Play Rock Paper Scissors |
| `.trivia` | quiz, question | Answer a trivia question for coins and XP |
| `.wordchain` | wc, chain, shiritori | Word chain game for groups |

#### 🎲 Fun

| Command | Aliases | Description |
|---------|---------|-------------|
| `.advice` | tip | Get random life advice |
| `.cat` | cats, meow | Get a random cat picture |
| `.choose` | pick, decide | Choose between options |
| `.dare` | dares | Get a random dare challenge |
| `.darkweb` | tor, onion | A purely-for-fun "dark web terminal" roleplay |
| `.dog` | dogs, woof | Get a random dog picture |
| `.eightball` | 8ball, 8b | Ask the magic 8-ball a yes/no question |
| `.fact` | facts, trivia | Get a random interesting fact |
| `.flip` | coinflip, coin | Flip a coin |
| `.joke` | jokes, funny, lol | Fetches a random safe-mode joke from JokeAPI |
| `.love` | ship, lovemeter, compatibility | Checks love compatibility between two names or two mentions |
| `.quote` | inspire, wisdom, qotd | Random inspirational quote with one-tap copy and author lookup |
| `.quoter` | quote, inspire, wisdom | Fetches a random inspirational quote with one-tap copy and author lookup |
| `.roll` | dice, rolldice | Roll a dice |
| `.truth` | truths | Get a random truth question |
| `.wouldyourather` | wyr, thisorthat | Get a random "Would You Rather" question to spark group discussion |

#### 🕸️ Web

| Command | Aliases | Description |
|---------|---------|-------------|
| `.summary` | summarize, tldr | Summarize text, a quoted message, or a URL |
| `.weather` | - | Get the current weather for a location |
| `.calc` | calculate | Quick calculator — +, -, *, /, %, sqrt and more |
| `.convert` | conv, unit, convertor | Convert units and currencies |
| `.crypto` | price, coin, coinprice | Get cryptocurrency prices |
| `.currency` | - | Convert currency |
| `.define` | dict, dictionary | Get the dictionary definition of a word |
| `.dns` | - | Look up DNS records for a domain |
| `.docs` | mdn | Search MDN Web Docs |
| `.github` | repo | Get information about a GitHub repository |
| `.headers` | - | Get HTTP headers for a URL |
| `.news` | - | Get the latest news articles |
| `.npm` | - | Search for an NPM package |
| `.screenshot` | ssweb, webshot | Takes a screenshot of any website |
| `.search` | - | Search the web using DuckDuckGo |
| `.time` | - | Get current time for a timezone |
| `.whois` | - | Lookup WHOIS information for a domain |

#### 🔧 Utility

| Command | Aliases | Description |
|---------|---------|-------------|
| `.addsticker` | setsticker | Map a sticker to a bot command |
| `.afk` | away | Set yourself as AFK |
| `.base64` | b64, encode, decode | Encodes or decodes base64 |
| `.calc` | calculate, math, maths | Quick calculator |
| `.checkchid` | channelid, chid, chatid | Get JID and metadata for current chat or a WhatsApp Channel link |
| `.delsticker` | removesticker, unsticker | Remove a sticker → command mapping |
| `.device` | devinfo, deviceinfo | Device info check — linked-device index (`:N` suffix), sender-key encryption, verified business name, About, pfp, group role, last-seen. Usage: `.device [@user | reply | number]` |
| `.get` | fetchhtml, html | Fetch a website and return its raw HTML |
| `.ip` | ipinfo, iplookup, geoip | Looks up info for an IP address or domain |
| `.liststicker` | stickerlist, stickercmds | Show all registered sticker to command mappings |
| `.lyrics` | lyric | Fetch song lyrics |
| `.ocr` | readtext, textfromimage, extract | Extracts text from an image |
| `.password` | genpass, pwgen | Generates a secure random password |
| `.paste` | pastebin, hastebin, upload | Uploads text to paste |
| `.qr` | qrcode, makeqr, genqr | Generates a QR code image from any text or URL |
| `.remind` | reminder, remindme, timer | Sets a personal reminder |
| `.rich` | richresponse | Test the new rich response components and combo generators |
| `.tinyurl` | shorten, short, shorturl | Shortens a long URL using TinyURL |
| `.tourl` | geturl, mediaurl, uploadmedia | Uploads any media (image, video, audio, sticker, document) to a public host and returns a direc |
| `.userinfo` | whoami, me, profile2 | Shows your detailed user profile with stats and account info |
| `.wiki` | wikipedia | Look up a Wikipedia summary |

#### 🧰 Developer

| Command | Aliases | Description |
|---------|---------|-------------|
| `.hash` | md5, sha1, sha256 | Generates a hash for the given text |
| `.jsonformat` | json, prettyjson | Formats and validates JSON string |
| `.jwt` | jwtdecode | Decodes a JSON Web Token (JWT) payload |
| `.uuid` | guid | Generates random UUID(s) |

#### 🌸 Anime

| Command | Aliases | Description |
|---------|---------|-------------|
| `.anime` | waifu, neko, wallpaper | Anime pics + GIF cards |

#### 👑 Owner & Sessions

| Command | Aliases | Description |
|---------|---------|-------------|
| `.anticall` | blockcalls | Toggle automatic rejection of incoming calls to the bot |
| `.ban` | banuser | Ban a user from using the bot |
| `.checkwa` | checkban, wacheck, iswabanned | Check if a phone number is on WhatsApp and whether it has been banned |
| `.connection` | health, conn | Shows WhatsApp connection health, metrics, and reconnect diagnostics |
| `.create` | newgroup, creategroup, gc | Creates a new WhatsApp group with optional picture and description |
| `.createtheme` | - | Create and register a custom border theme (Owner Only) |
| `.delsession` | removesession, unpair | Log out and remove an extra session |
| `.eval` | > | Executes JavaScript expressions in a sandboxed context |
| `.generateassets` | genassets, makeassets | Regenerates all AI-powered bot assets using Gemini |
| `.generateimage` | genimage, imagine | Generates a custom image based on the prompt using Gemini |
| `.goodbye` | gb | Toggle goodbye messages on or off (per-group or global) |
| `.greetings` | greeting, greets | Toggle welcome AND goodbye messages at once (per-group or global) |
| `.logoutall` | unpairall, killsessions, sessionpurge | SUPER OWNER ONLY — log out and remove every paired session at once |
| `.middleware` | mw, pipeline | Shows registered middleware pipeline and rate-limiter status |
| `.pair` | addsession, linksession | Link another number as a bot session |
| `.pairapprove` | papprove, approvepair | SUPER OWNER — approve a pending  |
| `.pairdeny` | pdeny, denypair | SUPER OWNER — deny a pending  |
| `.pairrequests` | pairlist, pairqueue | SUPER OWNER — list pending pairing requests |
| `.public` | - | Allows everyone to use the bot (public mode) |
| `.reload` | rl, hotreload | Hot-reload plugins without restarting the bot |
| `.restart` | reload, reboot | Hot-reloads all plugin files, or restarts the container process |
| `.self` | private | Restricts the bot to owner-only use (private mode) |
| `.sessions` | listsessions | List extra linked bot sessions |
| `.setchannel` | setch, setdefaultchannel | Sets the default official WhatsApp broadcast channel JID for the framework |
| `.setfooter` | footerstyle, footer | Changes the global active bot message footer style (Owner Only) |
| `.setgoodbyetext` | setgbtext, gbtext | Set custom text for goodbye notifications |
| `.setimagemode` | imgmode, imode | Configure the dynamic image selection mode (static, random, or rotate) |
| `.setmenu` | changestyle, setmenustyle | Changes the global active menu presentation style (Owner Only) |
| `.setmenuaudio` | menuaudio, maudio | Enable or disable the background menu audio message playback |
| `.setmenuimage` | setimage, setimg | Saves the replied image as background/banner for the currently active menu style |
| `.setmenumedia` | media | Ingest or update background media files (audio, image, thumbnail) for the menu system |
| `.setprefix` | prefix | Set custom command prefix(es) |
| `.settheme` | theme, style | Changes the global active bot design theme (Owner Only) |
| `.setthumbnail` | thumbnail, thumb | Enable/disable menu thumbnails or save the replied image as the menu thumbnail |
| `.setwelcome` | stylewelcome, wcstyle | Set greeting layout style (1 = Image, 2 = Document Card, 3 = Interactive, 4 = Minimal) |
| `.setwelcomeimage` | setwcimg, wcimg | Set custom background image for welcome cards (image or URL) |
| `.setwelcometext` | setwctext, wctext | Set custom text for welcome notifications |
| `.status` | story, sendstatus, broadcaststatus | Sends a WhatsApp Status (Story) to contacts or groups |
| `.statusprivacy` | sp | Controls who can see your WhatsApp Status |
| `.sudo` | addowner, delowner, rmowner | Manage sudo owners |
| `.takeall` | packall, stealpack | Bundle all stickers in this group into a sticker pack named nexora (styled font) |
| `.testmessage` | testmsg, msgdebug | Test all interactive message types via a native WA list picker |
| `.testrich` | testrichmsg, richdebug | 🧪 Test party for OURIN-baileys rich message generators (V1 + V2) |
| `.unban` | pardon | Unban a user |
| `.viewstatus` | vs, statuslist, fetchstatus | Views WhatsApp Status updates from contacts |
| `.welcome` | wc | Toggle welcome messages on or off (per-group or global) |


---

## 🛠️ Installation

### Prerequisites
- **Node.js 20+** and **npm 8+**
- A **WhatsApp account** to link as the bot number

### Clone & Install

```bash
git clone https://github.com/boyde1317-byte/NEXORA-MD.git
cd NEXORA-MD
npm install
```

### Configure

```bash
cp .env.example .env
```

The essentials in `.env`:

```env
# Your phone number(s) — comma-separated, country code, no + or spaces
OWNER_NUMBERS="233XXXXXXXXX"

# Super owner: full session control (defaults to first OWNER_NUMBERS entry)
SUPER_OWNER_NUMBERS="233XXXXXXXXX"

# AI — free key from console.groq.com (enables chat, remix, summary, math AI)
GROQ_API_KEY="gsk_..."

# Optional — image generation (Google AI Studio)
GEMINI_API_KEY="AIza..."

# Optional — server plans shown by .store / .order
# STORE_PLANS='[{"ram":"1GB","price":10},{"ram":"4GB","price":40}]'
```

### Start

```bash
npm start
```

On first run the console prints a **pairing code** — enter it on the bot's phone under WhatsApp → Settings → Linked Devices → Link a Device → *Link with phone number instead*. The session persists to `./session/` and reconnects automatically on every restart.

---

## ☁️ Deployment

### Railway (recommended)
1. Fork/push this repo to GitHub
2. New project → **Deploy from GitHub repo**
3. Add the env vars above in *Variables* (at minimum `OWNER_NUMBERS` and `GROQ_API_KEY`)
4. Deploy — the build installs pinned git dependencies keylessly (Dockerfile includes git for the lockfile)
5. Open the deploy logs for the pairing code on first boot

### Docker
```bash
docker build -t nexora-md .
docker run -d --env-file .env -v nexora-session:/app/session nexora-md
```

### VPS / Pterodactyl / Termux
Node 20 + `npm install` + `npm start` — same steps as above; use PM2 (`pm2 start server.js`) on VPS. Session state lives in `./session/`.

---

## 🔌 Writing a Plugin

Every command is a single `.js` file in `src/plugins/`. The minimum shape:

```js
// src/plugins/greet.js
export default {
  name: 'greet',                    // trigger: .greet
  aliases: ['hello', 'hi'],        // also: .hello, .hi
  category: 'general',
  description: 'Sends a greeting.',
  cooldown: 2000,                   // ms; overrides global default
  permissions: {
    owner: false,                   // set true to restrict to owner
    groupOnly: false,               // set true for groups only
    admin: false,                   // require sender to be group admin
    botAdmin: false                 // require bot to be group admin
  },

  execute: async ({ m, args, prefix, sock, db, config }) => {
    const name = args[0] || 'friend';
    await m.reply(`👋 Hello, ${name}!`);
  }
};
```

For rich cards, import the builders from `src/lib/interactiveKit.js` (`selectMenu`, `actionCard`, `copyResultCard`) — every consumer keeps a plain fallback if the rich send fails. Load a plugin at runtime with `.reload`.

---

## 🧩 Rich Message System

- **Outbound**: the pinned Baileys fork exposes V1/V2 generators — text, tables, LaTeX, maps, image grids, content items. `src/lib/interactiveKit.js` wraps the proven subset (native flow CTAs, single-select, buttons, carousels) that renders on real devices
- **Inbound**: `parseRichMessage()` decodes inbound rich messages into readable text
- **Testing**: `.testrich` runs the full generator audit; `.testmessage` tests all interactive message types via a native picker. Anything experimental is gated behind `experimentalCta: true` until device-verified
- **Rollback**: `NEXORA_RICH_RESPONSE=0` disables every rich surface in one env var

---

## 🛡️ Security Notes

- Pairing codes are always DM'd — never printed to groups
- `.order`, `.pair` and other request-style commands only *file* a request; nothing executes without super-owner approval
- `.eval` is owner-only and sandboxed; ban/warn/mute are permission-gated
- Session files in `./session/` are the bot's identity — never commit them

---

## 📦 Key Dependencies

| Package | Why |
|---------|-----|
| `baileys` (pinned fork `#v0.3.18-r6`) | WhatsApp multi-device socket + rich message generators (keyless git install via Dockerfile `insteadOf`) |
| NIXCODE rich-message builder | Native cards, buttons, carousels (vendored `src/lib/NIXCODE.js`, attribution preserved) |
| `qrcode-terminal` | Headless pairing |
| `sharp` | Image processing for thumbnails and stickers |

---

## 📬 Connect with the Developer

<div align="center">

**Aizen** — Creator & Lead Developer of NEXORA MD

| Platform | Link |
|----------|------|
| 💬 WhatsApp | [wa.me/233533416608](https://wa.me/233533416608) |
| ✈️ Telegram | [@DeathCore_Xr](https://t.me/DeathCore_Xr) |
| 📢 WhatsApp Channel | [Join for updates & announcements](https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326) |

> Star ⭐ the repo if you find it useful.

</div>

---

<div align="center">

**© NEXORA MD — By Aizen**

*Use responsibly. This project is not affiliated with or endorsed by WhatsApp Inc.*

</div>
