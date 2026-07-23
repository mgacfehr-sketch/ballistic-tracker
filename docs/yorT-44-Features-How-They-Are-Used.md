# yorT — The 44 Features: How Shooters Actually Use Each One
### Real-world process, who needs it, and what "right" looks like

---

# CAPTURE & MEASUREMENT

**1. Target photo group measurement (any target)**
Today: shooter fires a group, walks downrange, holds calipers or a tape across the two widest holes, subtracts a bullet diameter, scribbles the number on the target, maybe photographs it. Numbers get lost; measurement method varies shooter to shooter (edge-to-edge vs center-to-center errors are constant forum arguments).
Who: everyone who shoots paper — load developers, zero-checkers, new-rifle break-in.
In yorT: photograph, two taps to set scale on any target, tap holes → exact center-to-center math, saved forever to the rifle. The user's real motive is *comparison over time* — "is this load/rifle/me better than last month" — which paper-and-calipers can't do.

**2. Fiducial auto-calibration ("Verified")**
Today: doesn't exist anywhere — scale is always trusted, never proven. Every "half-MOA rifle" claim on a forum is unverifiable, which is why nobody believes anyone.
Who: anyone whose number needs to be *believed* — certificate rifles, handicap, ammo trials, bragging rights.
In yorT: print the yorT target, the four corner markers set scale automatically and un-fakeably. The user does nothing extra — verification is a byproduct of using our paper.

**3. Full group statistics (mean radius, CEP, spreads, ATZ)**
Today: serious shooters know extreme spread (group size) rewards luck — one flier defines the group. Mean radius uses every shot and is the statistician's choice (Litz/Hornady both preach it), but computing it by hand means measuring every hole's x/y — so almost nobody does.
Who: load developers and data-driven shooters; casual users just see group size.
In yorT: since holes are tapped anyway, all stats are free. Show group size big (what people know), mean radius beneath (what actually matters); teach gently.

**4. Multi-group ladder test**
Today (the researched process): the reloader loads 3 rounds each at 6–10 charge weights (0.2–0.5 gr steps), fires "round robin" at one multi-bull target or a bull per charge, labels everything with a Sharpie, photographs the target, then squints for the "node" — consecutive charges whose groups print to the same point of impact with low vertical. Then repeats the whole ritual for seating depth (3 rounds per depth, .010" steps). It's 30–100 rounds and an evening of Excel. The universal advice is literally "take high-res photos of your targets with charge weights labeled and keep them organized" — that's a manual description of this feature.
Who: every handloader; also factory-ammo shooters comparing 3 boxes.
In yorT: one photo of the multi-bull target → mark each bull's group → tag each with its charge weight (or load) → the app charts POI shift and group size across the series and flags the stable node. Paired with chrono import, velocity flat-spots overlay automatically. This turns the most data-intensive ritual in shooting into one guided flow.

**5. Garmin ShotView import**
Today: the Xero records beautifully, then the data dies in ShotView — users hand-type velocities into apps ("my fingers hurt from typing 20 strings"), or hand-write avg/SD on the paper target with a marker.
Who: every chronograph owner (the Xero C2 is the runaway market leader).
In yorT: export from ShotView, import the file, done. The bridge nobody built.

**6. Velocity string stats (avg/SD/ES)**
Today: shooters quote SD religiously — it predicts vertical dispersion at range. A hunting load with SD under ~10–12 fps is "good"; match loads chase single digits. ES (max−min) is the worst-case number.
Who: everyone with a chrono; the numbers ARE the language of load quality.
In yorT: computed Garmin-identically (population SD) so our numbers match what they see — trust preserved.

**7. Auto load-splitting by velocity clustering**
Today: Troy's problem and every chrono owner's problem — one range session, three ammos, one continuous chrono log. ShotView can't mark which shots were which load ("the summary stats are meaningless"). People keep paper notes or lose the association forever.
Who: anyone who shoots more than one load per trip (i.e., anyone doing load work).
In yorT: velocity bands + time gaps propose the splits; the human confirms every merge. Zero note-taking at the bench.

**8. Velocity-fingerprint duplicate detection**
Today: no one has this because no one stores per-shot velocities per rifle. Double-imports silently corrupt round counts and averages.
Who: invisible plumbing — the user "needs" it only in that their numbers stay true.
In yorT: identical per-shot sequences can never count twice, across rifles, regardless of filename.

**9. Ammo-box OCR**
Today: creating a load profile means typing brand, bullet, weight, BC, claimed velocity from the box — the exact data-entry friction that makes people abandon apps.
Who: every new user in their first ten minutes; hunters buying a new box.
In yorT: photograph the box, confirm the prefilled form. First-run magic moment.

**10. Auto-conditions**
Today: apps demand temp/pressure/humidity/altitude; users guess, skip, or carry a Kestrel. Wrong density altitude = wrong drops at distance.
Who: everyone using the solver; hunters at unfamiliar elevation most of all.
In yorT: GPS + station weather + elevation fill silently; a refresh button; a documented seam for a real barometer when native.

---

# THE RIFLE THAT KNOWS ITSELF

**11. Rifle/barrel/load profiles + build sheets**
Today: the "profile" is the owner's memory plus a folder of receipts. Component details (twist, barrel, trigger) live nowhere but matter for everything (bullet stability, ammo intelligence, resale).
Who: multi-rifle owners (most serious shooters own 3–15); anyone selling a rifle.
In yorT: the hub object everything else hangs on; the certificate prints from it.

**12. Round count & barrel life**
Today: almost universally guessed. Barrels are consumables ($400–900 + smith time); hot 6.5/7mm cartridges die at 1,200–2,500 rounds. The first symptom is velocity decay and opening groups — which nobody notices without records. Used-rifle buyers ask round count first, and sellers "don't keep track."
Who: everyone, but especially barrel-burner cartridges and resale-minded owners.
In yorT: chrono imports and sessions increment the count automatically; velocity-SD trend vs. round count flags a dying barrel before the shooter would notice.

**13. Cold-bore tracking & prediction**
Today (researched): disciplined shooters keep a dedicated cold-bore log — first shot of every outing marked on its own target/page — because the first shot from a cold, clean, or oil-fouled barrel often lands 0.2–1 MOA from the fouled zero. Hunters hold off from memory. The advice is verbatim: "track what is happening with that first shot and first shot only... maintain a record." Nobody automates it; and some discover their "cold bore problem" was actually THEM (flinch on shot one).
Who: hunters above all — the first shot is often the ONLY shot that matters all season.
In yorT: shot #1 of every session is auto-logged as cold bore; after 5+ points the app states the offset and the hold ("cold bore lands 0.16 high / 0.15 left — hold opposite for shot one").

**14. Zero records / scope-adjustment log / cleaning log**
Today: turret changes and cleanings live in memory. Classic failure: "did I dial back after last weekend?" — a full-value miss on an animal answers it.
Who: everyone; the scope log especially for people who dial rather than hold.
In yorT: every adjustment and cleaning is a dated record; fouling window (group size vs. rounds-since-cleaning) emerges free from the data.

**15. Zero drift tracking**
Today: shooters conflate three different problems — a moving zero (mount/scope trouble), normal group scatter, and their own inconsistency. Diagnosing means burning ammo methodically, which nobody does.
Who: anyone whose confidence is shaken; owners of suspect optics.
In yorT: every session's POA offset plots over time — a random cloud is normal; a walk is hardware. The app says which.

**16. Suppressed vs. unsuppressed configurations**
Today: hanging a can shifts POI (commonly 0.3–1+ MOA) and changes velocity. Suppressed-first is now doctrine, but people zero one way and hunt the other, or hand-note the shift. No product tracks both states.
Who: the majority of new precision/hunting builds; anyone who shares a can across rifles.
In yorT: a configuration toggle; every session/string/zero tags which; the app states the measured shift ("with can: 0.7 MOA lower, 28 fps faster").

**17. Scope-tracking verification (tall-target test)**
Today (researched process): shooter tapes a plumb-line target ~4 ft tall at an EXACTLY measured 100 yds (tape measure, turret-to-target), fires at the bottom dot, dials up 10 mil, fires again, measures actual travel with a tape (should be 36.0"), computes error percentage, then keeps a "correction factor" in a spreadsheet and mentally applies it to every solution forever. Also checks the reticle tracks plumb (no cant). Scopes routinely fail — 2–5% tracking error is common even in $1,500 glass, which wrecks long-range dope invisibly.
Who: anyone who dials for distance; every new-scope owner SHOULD (forums say so constantly; few do because it's fiddly).
In yorT: the fiducial target makes the tape measure obsolete — photograph the tall target after dialing, the app measures actual travel to sub-millimeter, computes true click value, stores it on the scope, and silently corrects every future solution. One photo replaces the whole ritual. Nobody has this.

**18. Session history**
Today: the shoebox of targets, the phone camera roll, the memory.
Who: everyone; it's the record that makes every insight feature possible.
In yorT: already built — searchable, photographed, contextualized.

---

# FIELD BRAIN

**19. G1/G7 solver**
Today: the commodity — everyone runs AB, Hornady 4DOF, Strelok heirs, or a Kestrel. Users trust the math but distrust their INPUTS ("apps are only as good as what you type in").
Who: anyone shooting past ~300.
In yorT: same math, measured inputs — the differentiator is upstream of the solver.

**20. Solver truing**
Today (researched): the ritual is universal doctrine — "software needs to match real world & you will very likely need to true-up." Process: shoot at 400–600, note actual drop vs. predicted, adjust MV until they match; then verify/tweak BC at transonic distances. AB buries this in "calibration" menus people fight with; most shooters true once, badly, or never.
Who: everyone who dials past 400; the #1 sophisticated ask in every app thread.
In yorT: every saved session with distance data feeds the model automatically; a confidence meter shows how trued each rifle is at each distance band. Truing stops being an event and becomes a byproduct.

**21. Zero Guardian verdict**
Today: the pre-season ritual — hunters check zero out of ethics and anxiety ("I can't go hunting assuming they're fine — I need the reassurance"). But the verdict is self-graded: is 1.5" left "fine"? How many clicks? People mis-correct constantly (wrong direction, chasing a good zero).
Who: the 11M+ rifle hunters — the widest audience of any feature; also anyone after a scope re-mount.
In yorT: photo → "✓ ZERO CONFIRMED — you're ready" or "8 clicks RIGHT." The ritual they already perform, given a scoreboard and an answer.

**22. Travel check**
Today (researched): the opening-day horror story — turret caught on a pack strap, "off a full 10 MOA, missed my opening day buck." Guys tape turrets and re-check zero at camp if they can find a range. Airlines and horseback are notorious.
Who: traveling hunters (fly-in, pack-in); anyone whose rifle rides rough.
In yorT: one shot at any marked target at camp, photo, verdict: "zero survived the trip" or "you're 2 MOA off — here's the correction." Cheap feature, enormous emotional value.

**23. Wind Call (holds w/ spin drift & Coriolis)**
Today: wind is THE unsolved input. Shooters memorize a rifle-specific "gun number" (e.g., 10 mph full-value = 0.8 mil at 600), bracket gusts between plate edges, and accept that the phone can't measure wind at the target. Spin drift (~0.1–0.3 mil at 1000) and Coriolis matter only at ELR but are badges of a serious solver.
Who: 600+ yard shooters; PRS/ELR.
In yorT: bracketed holds ("5 mph: 0.4 · 10 mph: 0.8 — the wind is yours"), never a fake single number. Honesty as positioning.

**24. Printable DOPE/range cards**
Today (researched): the near-universal artifact. Shooters generate drops in 25–50 yd increments from their app, format in Excel/Word, print, laminate, and mount: taped upside-down on the buttstock for a wrist-flip read, in a quarterback wrist coach, a Hawk Hill card holder, a stock pack, or scope-cap sticker. Contents: distance | elevation hold | wind holds at 5/10/15 mph, plus load and zero info; competitors make per-stage cards, hunters make per-altitude cards ("make a Colorado card before the trip"). The phone stays in the pocket — cards don't have batteries, glare, or gloves problems.
Who: everyone who dials — hunter and competitor alike; it's how dope actually rides on the rifle.
In yorT: one tap renders the trued solution to card formats (buttstock strip, 3x5 wrist-coach, full page), sized to the real holders people own, using THEIR trued numbers instead of box ballistics. Include a "destination card" (enter altitude/temp for the hunt, print before you fly).

**25. Steel/hit logging**
Today: steel practice generates zero records — hits are cheers, misses are shrugs. The disciplined few keep tally sheets by distance. Yet steel is where most practice volume happens.
Who: PRS practice days, ranch shooters, hunters proofing at distance.
In yorT: 3 taps per shot (distance auto-remembered, hit/miss, position); conditions auto-attach. Exists to feed #26 and #27 — the entry must be near-zero effort or it dies.

**26. Wind-call trainer/grader**
Today (researched): wind reading is learned by informal apprenticeship — call it, shoot, see the splash, adjust, remember. Forum exercises: watch flags/mirage, guess, check a Kestrel; shoot a .22 at 100 in wind. Nobody writes calls down, so learning is vibes. "Wind is the big equalizer" — the skill everyone says separates shooters.
Who: everyone past 400 yds; the improvement-minded middle of the market.
In yorT: before the shot, log your call (one dial: mph + direction); after, the actual correction that worked is computed from the impact. Over time: "your calls average 0.3 mil under in full-value wind; you read left-to-right better than right-to-left." Turns the mystical skill into a graded practice loop. No product does this.

**27. Personal effective range**
Today (researched): the ethical question every serious hunter asks and answers by feel. The disciplined version, verbatim from Rokslide: "pick a hit probability you think is ethical and cut off your distance where you drop below that percentage. This takes logging some rounds." Almost nobody has the logs.
Who: ethical hunters (the emotional core of the market); mentors setting limits for new shooters.
In yorT: computed from real sessions + steel logs: "prone with this rifle: 90% inside vitals to 480 yds; from sticks: 320." The number that answers "should I shoot?" before the moment arrives. Deeply on-brand: measured truth about YOURSELF.

**28. Offline field mode**
Today: mountains don't have bars. Apps that need signal die exactly where they're needed.
Who: every backcountry hunter.
In yorT: profiles and solutions cached; capture queues for later sync (write-queue is the eventual completion of this).

---

# BENCH

**29. Reloading recipes**
Today (researched): the universal tool is a self-built Excel sheet — columns for brass (and times fired), powder + charge, primer, bullet, COAL/CBTO, neck tension, then velocity and group per test. Threads sharing these spreadsheets run for years; the ask is verbatim: "somewhere to keep my own load data... specially designed... that gives some analytics." Paper notebooks + taped targets are the other half of the culture.
Who: handloaders — a massive, obsessive, underserved overlap with precision shooting.
In yorT: a recipe is a load with full component detail; every chrono string and group auto-attaches. The spreadsheet dies not because ours is prettier but because the DATA ARRIVES BY ITSELF.

**30. Component lot tracking**
Today: powder lots change burn rate enough to move velocity 30–60 fps — reloaders relabel and retest on every new 8-pounder. Brass work-hardens; firings-per-case matter (primer pockets loosen, necks split ~5–15 firings). Tracked, if at all, in the spreadsheet or on masking tape on the ammo box.
Who: serious handloaders; match shooters buying components in bulk.
In yorT: lots on every component; brass firing counts auto-increment per session; alert when a new powder lot's measured velocity departs the old lot's.

**31. Factory ammo lot manager**
Today (researched): box velocity lies — "marked 2,700, measured 2,860; that's five inches at 400." Serious factory-ammo shooters buy a case of one lot, verify velocity, and re-zero on lot change. Most hunters have never checked and get mystery misses.
Who: the factory-ammo majority — hunters especially; Workhorse customers directly (lot on the certificate).
In yorT: lot number on the load; each lot's measured velocity from chrono strings; on logging a new lot: "62 fps faster than your old lot — verify zero before hunting."

**32. Load-development logbook (the binder killer)**
Today: the process spans months — ladder targets, chrono printouts, seating-depth rounds, notes — held together by a binder and memory.
Who: same as 29; this is the VIEW that makes 4+5+29+30 feel like one product.
In yorT: per-load timeline: every test, every group, every string, every change, in order. "Show me everything I've tried in this rifle with H4350" — one tap.

**33. Ammo Trial (guided A/B/C)**
Today: "which ammo does my rifle like" is answered by shooting a few boxes casually and mis-remembering. Confounds (order, fouling, shooter fatigue) go uncontrolled.
Who: factory-ammo shooters facing a $60/box decision; new-rifle owners.
In yorT: a guided ritual — 2–3 loads, structured order, photograph targets, import chrono → a declared winner with the numbers. Also the statistically valid unit (within-shooter paired comparison) that makes the crowd dataset defensible.

---

# INTELLIGENCE

**34. Ask yorT**
Today: shooters ask forums and get twelve contradicting answers, or ask ChatGPT which knows nothing about THEIR rifle.
Who: everyone at the moment of confusion — and confusion is constant in this hobby.
In yorT: answers grounded in the user's actual rifles, sessions, and history ("your cold bore with this rifle runs 0.2 high — hold accordingly"). The moat is the grounding, not the chat.

**35. Miss Forensics**
Today: the post-miss spiral — hunter misses, can't explain it, cranks the turret at camp, and is now ACTUALLY off for the rest of the season. The classic blunder is chasing a zero that was never wrong.
Who: hunters after the miss; coaches diagnosing students.
In yorT: describe the miss; the app does the algebra against known zero/group/cold-bore: "your rifle accounts for ~2 inches of that 12-inch miss — this was ranging or wind. Do NOT touch your scope."

**36. Called Shot mode**
Today: practice without prediction is just ammo consumption. Coaches make students call their shots ("where did that break?") because the call-vs-impact gap IS the diagnostic.
Who: improvers; rimfire practicers; anyone bored of static zeroing.
In yorT: app predicts the expected group from the rifle's history, user shoots, app grades reality vs. prediction — separating rifle error from shooter error over time. Practice becomes a game with a score.

**37. Verified Handicap**
Today: no shooter has a number. Golf's handicap makes every round count and travels between courses; shooting has bar claims. Ballistics Report proved appetite for percentile scores but unverified.
Who: the competitive-with-themselves majority; ranges and clubs eventually.
In yorT: one number from verified (fiducial) sessions only — un-fakeable, personal-best framed. "What's your yorT?" is the long-game culture play.

**38. Crowd dataset foundation**
Today: "what ammo does a 1:8 6.5 CM like" is answered by anecdote. Manufacturers won't publish; forums are noise.
Who: you (admin/export now); every user later ("rifles like yours shoot best with...").
In yorT: anonymized, verified, within-shooter-paired data accumulating from normal use. The asset nobody can buy or copy.

---

# WORKHORSE / B2B

**39. Certificate of Performance**
Today: builders ship a 3-shot machine-rest target the market openly calls "a worthless marketing gimmick"; the praised alternative (Rbros) is a dummy round + load data that got a buyer to 700-yd hits in 30 rounds.
Who: Workhorse buyers; then partner builders' buyers.
In yorT: 20–60 documented rounds, named winning factory load + lot, chrono stats, verified group, QR that walks the buyer into the app with the rifle pre-loaded.

**40. Performance Report per serial**
Today: a builder's test data, if it exists, lives in the smith's notebook.
Who: Troy's bench workflow; the customer conversation ("here's everything your rifle did in testing").
In yorT: the aggregation view — all strings, all groups, best group, recommended load — that the certificate prints from.

**41. Admin dashboard + crowd warehouse export**
Today: n/a — this is your seat.
Who: Mitch. Filter/sort every anonymized row by caliber/barrel/twist/ammo; export CSV/XLSX; analyze outside the app.
In yorT: built (crowd-data branch) with real server-side admin auth.

---

# PLATFORM

**42. Cloud sync/backup**
Today (researched): a rage point — "ten rifles and load data on one phone and when it went TU, I was stuck reloading everything manually." ShotView's own sync silently loses sessions.
Who: everyone, discovered only at the moment of loss.
In yorT: Supabase-backed from day one; a stated feature, not plumbing.

**43. Account security / privacy / deletion**
Today: table stakes and app-store law (deletion is mandatory for store approval).
In yorT: built; deletion function defined, test deferred.

**44. Feature activation system (dormant tools, adaptive home, card hub)**
Today: competitor apps show everything to everyone — AB Quantum's menu maze is its own forum complaint genre.
Who: every user, invisibly — it's what makes 43 other features feel like 3.
In yorT: the UX architecture doc — actions not features, dormant until touched, one grammar.

---

## THE PATTERN ACROSS ALL 44
Read together, the features describe one loop the shooter already lives — **prepare (bench) → capture (range) → understand (insight) → apply (field) → repeat** — where today every arrow in that loop is a manual transcription (Sharpie on a target, retyping velocities, Excel, memory). yorT's entire value is deleting the transcriptions. The features aren't 44 products; they're 44 places the same loop leaks data today.
