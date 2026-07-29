# What yorT does now — a plain-English summary

*Written for Troy, not a programmer. No code terms, no jargon you
didn't ask for. If something here doesn't match what you see in the
app, that's worth flagging — this is meant to be an accurate mirror of
the product, not a wish list.*

---

## What the app is, in one paragraph

yorT is a phone app for precision rifle shooters. You photograph a
target, tap where the bullets hit, and it does the math: group size,
where the center of your group is relative to your aim point, and how
confident you should be in the numbers given how many shots you fired.
It keeps a running record per rifle — every zero, every chronograph
reading, every steel hit at distance, every cleaning — and uses that
history to tell you one thing at a time: what to dial, whether your
rifle is actually "proven" to a given distance, and when something
looks off enough that you should stop and check the gun before
trusting a correction.

## What's been solid and working for a while

- **Photograph a target, get real numbers.** Mark your point of aim and
  each hole; the app measures group size, tells you in MOA whether
  you're on or off, and (if you're checking zero) tells you plainly
  "Zero confirmed" or exactly how many clicks and which direction to
  move.
- **A ballistic calculator that's actually yours.** Punch in your
  bullet, muzzle velocity, and zero distance and it builds a drop and
  wind chart — same physics tables (G1/G7) any serious solver uses.
- **A memory for every rifle.** Barrel round count, cleaning history,
  every chronograph string, every zero check, every correction ever
  made — nothing gets overwritten, it's all still there to look back
  on.
- **"Ask yorT."** A chat assistant that can see your rifle's actual
  history and answer shooting questions with real numbers instead of
  generic advice.
- **Works without cell service.** You can log a session at the range
  with no signal; it saves locally and syncs the next time you have a
  connection.

## What's new — the last stretch of work (this includes tonight)

Think of this chunk as: **the app got a lot better at knowing what it
doesn't know, and at not losing anything you tell it.**

1. **It remembers what changed, not just what's current.** If you
   swap a suppressor or switch ammo lots, it now keeps a timeline of
   that — so later, if a group looks off, it can connect the dots
   ("this rifle's had a new lot since the last confirmed zero") instead
   of guessing.

2. **It knows when to stop trusting its own math.** If a hit is way
   off from what the current numbers predict, the app now recognizes
   that as a real problem — not something to paper over with a bigger
   correction — and walks you through a short check-the-rifle sequence
   (zero, then mount, then chronograph again, then "this needs your
   builder") before it'll suggest any more corrections. Your shot is
   still logged either way — it just won't pretend to fix numbers that
   don't add up yet.

3. **Nothing you enter ever gets thrown away for being "incomplete."**
   Old versions of software like this often refuse to save something
   if one field is missing. This one doesn't — it saves what you gave
   it, marks what's missing, and figures out later whether it can use
   it for math. A dropped chronograph reading mid-string, two shots
   that landed in the same hole, a chronograph whose clock doesn't
   match the target log — the app now recognizes each of those as "I
   can't safely use this to fine-tune your rifle" without ever
   discarding the shot itself.

4. **Trip planning, if you ask for it.** Tell it you're headed out and
   how many rounds you expect to shoot, and it'll tell you whether your
   barrel needs a clean first and whether you have margin — using your
   OWN cleaning interval, not a generic number.

5. **"Export everything" actually means everything now.** Your data
   export now includes the full history trail (not just the visible
   numbers) — useful if you ever want to hand your data to someone
   else or just have your own backup copy outside the app.

6. **An experimental "per-shot" analysis engine — built, tested, NOT
   turned on yet.** This is a future feature: instead of just knowing
   your average muzzle velocity, it could eventually explain how much
   of your group's vertical spread on a given day was explained by
   shot-to-shot speed differences vs. something else unexplained. It's
   fully built and tested against made-up data, but it's not connected
   to anything you'll see in the app yet — no live feature depends on
   it, and no correction it computes could reach your rifle's actual
   numbers even by accident. Turning it on for real is a future
   decision, not something that happened tonight.

7. **Cleaned out old, unused code.** Two files that hadn't been part
   of the app in a long time (an old rifle-page layout and an old
   stylesheet) were confirmed genuinely dead and removed. Nothing you
   use changed.

8. **A map of the whole app, for whoever works on this next.** A
   developer-facing document (`DEVELOPER-MAP.md`) now lists every piece
   of the app and what it's responsible for — so a new developer (or
   you, six months from now) doesn't have to reverse-engineer it from
   scratch.

## What's planned but NOT built yet

- **A "claim your rifle's certificate" system for factory-built
  guns/loads** (mint a certificate, let the actual owner claim it,
  allow a supported transfer if the gun changes hands, revoke it if
  needed). Tonight's work included writing the DESIGN for this — how
  the claim codes would work, how a lost/compromised claim gets
  revoked, what a support person could and couldn't do — but no part of
  it is built or turned on. That's a decision for you to review first.

## Bottom line

Nothing in tonight's work changes what you or a customer sees in the
app today, except: exports now carry more history, and two dead files
are gone. Everything else is groundwork — memory, honesty about
uncertainty, and a tested-but-off experimental analysis engine — built
and verified, waiting for your review before anything new gets turned
on for real users.
