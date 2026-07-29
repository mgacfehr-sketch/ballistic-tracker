# PHASEF-CLAIM-SPEC.md — Workhorse claim protocol design (for owner review)

**Status:** DESIGN DOCUMENT ONLY. No code and no SQL beyond what
`PHASEB-migrations.sql` P3 (`workhorse_packages`, schema-only, already
reviewed/deployed) already defines. Written per Amendment 1 Part B,
Phase F: *"Factory package build, secure claim (claim secret distinct
from serial; single-owner, revocable, transfer-capable), certificate
evolution. Support runbook: audited server-side repair operations, no
mobile admin."* Nothing here is built. This is the thing the owner
reviews BEFORE any of it gets built — matching the same discipline
`E-SHADOW-SPEC.md` used for the residual engine (spec before
implementation).

---

## 0. Terminology (read this first — two things share the word "transfer")

This codebase already has a working, shipped **certificate transfer**
flow (`js/transfer.js` / `api/transfer.js`, §2.11): a single-use token
lets an ALREADY-OWNED, already-calibrated rifle's profile move from one
Proven account to another (e.g. a private sale, one shooter to
another). It uses the `certificate_transfers` table, mint/redeem,
service-role-only writes. **This spec does not replace or duplicate
that.** It reuses its proven pattern where the shapes match.

**Claim** (this spec, new) is a DIFFERENT, EARLIER event: a **factory-built
Workhorse rifle or package**, before it has ever been associated with
ANY Proven account, gets bound to its FIRST owner. Think "activate a
new device," not "hand a used one to someone else." `workhorse_packages`
(P3) is the record of a physical, factory-produced item — it has a
`serial_number` and (once minted) a `claim_secret_hash` — sitting in
`status: 'unclaimed'` until someone claims it.

**Once claimed**, a package's rifle record behaves like any other rifle
in the app, INCLUDING being eligible for the existing §2.11 certificate
transfer if the owner later sells it. Claim only covers the *first*
binding; every subsequent ownership change is the existing, already-
shipped transfer flow. This spec's "transfer-capable" requirement
(Amendment 1's own words) means: **a claimed package's rifle must be a
normal, unremarkable input to `js/transfer.js`'s existing mint/redeem —
no special-casing needed there.** The one NEW capability §2.11 doesn't
have today, which this spec does add, is **revoke** (§5).

---

## 1. Lifecycle state machine

`workhorse_packages.status` (already defined, P3):

```
unminted → unclaimed → claimed → (stays claimed under new owners, via §2.11 transfer)
                            ↓
                         revoked  (terminal — see §5 for what "terminal" means)
```

- **unminted** — a serial number exists in factory production tracking,
  but no `workhorse_packages` row exists yet, or one exists with
  `claim_secret_hash: NULL`. Not claimable.
- **unclaimed** — minted (§2): `claim_secret_hash` is set, `claimed_by`
  is NULL. Claimable by whoever presents the correct secret.
- **claimed** — `claimed_by`/`claimed_at` set. The bound account owns
  this package's rifle exactly like any manually-created rifle from
  this point on (§4's "what claiming actually does").
  **A transfer via §2.11 does not change `workhorse_packages.status`**
  — the package stays `claimed`, `claimed_by` is deliberately NOT
  updated on an ordinary owner-to-owner transfer (open question, §7.1
  — see the reasoning there for why `claimed_by` should probably mean
  "first claimant of record," not "current owner," with current
  ownership tracked the same way every other rifle's ownership already
  is: `rifles.user_id`).
- **revoked** — `revoked_at`/`revoked_reason` set. See §5 for exactly
  what this does and does not do.

No other transitions exist. A revoked package cannot be re-claimed
without a NEW mint (a fresh secret) — see §5.

---

## 2. Mint

**Who:** Workhorse's own factory/production process, NOT the shooter's
app. Mint is a support-runbook operation (Amendment 1's own words:
"audited server-side repair operations, no mobile admin" — the same
principle extends to mint, which is even more privileged than a
repair). **Out of scope for this spec to design a UI for** — it is
either a small internal tool the owner/Workhorse staff uses directly
against the service role, or a batch process run at production time.
This spec only defines the DATA CONTRACT mint must produce, so claim
(§3) has something correct to verify against.

**What mint does:**
1. Generate a claim secret — **high-entropy, NOT the serial number,
   NOT derived from it** (Amendment 1's own explicit requirement:
   "claim secret distinct from serial"). Recommend the same generation
   primitive already proven in this codebase: `crypto.randomBytes(24)`
   base64url-encoded (`api/transfer.js`'s existing token generation) —
   144 bits of entropy, well beyond brute-force range for a bounded
   number of guess attempts (§5 threat model covers rate limiting
   regardless).
2. Hash it (server-side, same discipline as a password — bcrypt/scrypt/
   argon2, NOT a bare fast hash like SHA-256 alone, precisely because
   unlike a password this secret has a SHORT, bounded guess space per
   package if an attacker somehow narrows down which package they're
   attacking — a slow hash is cheap insurance). Store ONLY the hash in
   `workhorse_packages.claim_secret_hash`. **The raw secret is never
   written to any database table, log, or `fact_events` payload,
   anywhere, at any point after mint.**
3. Print the raw secret on/with the physical product (box insert, engraved
   card — a physical-world decision outside this spec's scope) and
   discard it from every digital system that generated it. If the mint
   tool needs to display it once for printing, that display path must
   not log it, cache it, or persist it beyond the single mint
   operation's lifetime.
4. Set `status: 'unclaimed'`, `rifle_snapshot` to the factory build
   sheet (same shape `js/transfer.js`'s `buildSnapshot` already
   produces for the existing transfer flow — reuse that shape rather
   than inventing a second one).
5. `claimed_by`/`claimed_at` stay NULL.

**Why the secret can never be re-displayed:** if the physical copy is
lost, the recovery path is REVOKE + RE-MINT (§5.4), never "look it up
again" — because the system never has a way to look it up again
(only the hash is stored). This is a deliberate design choice, not an
oversight: it means a database compromise cannot leak usable claim
secrets, only hashes (same reasoning as password storage).

---

## 3. Claim

**Who:** the first real owner, through the app, once, ever, per
package.

**Flow (mirrors `api/transfer.js`'s proven shape — service-role-only
write, atomic single-use enforcement, never trust the client):**

1. The buyer signs into their Proven account (claim requires an
   authenticated user — same JWT-bearer pattern `api/transfer.js`
   already uses; an unauthenticated claim attempt is rejected before
   ever touching the package row, same as an unauthenticated transfer
   redeem today).
2. The buyer enters (or scans, if the physical packaging carries a QR/
   barcode) the serial number and claim secret.
3. A server endpoint (the Phase F equivalent of `api/transfer.js`,
   e.g. `api/claim.js` — NOT specified further here, this is
   implementation, not design) looks up `workhorse_packages` by
   `serial_number`, confirms `status = 'unclaimed'`, and verifies the
   presented secret against `claim_secret_hash`.
4. **Atomic claim, same pattern as `api/transfer.js`'s single-use
   redeem:** the UPDATE that sets `claimed_by`/`claimed_at`/
   `status = 'claimed'` must be conditioned on `status = 'unclaimed'`
   in the SAME statement (PostgREST's `?status=eq.unclaimed` filter on
   the PATCH, exactly like `redeemed_at=is.null` does today) — so two
   simultaneous claim attempts on the same package can only ever have
   ONE winner, enforced by the database, not by application logic that
   could race.
5. On success, the server creates the rifle (from `rifle_snapshot`,
   same import logic `js/transfer.js`'s `redeem()` already has for
   `certificate_transfers.rifle_snapshot` — reuse it) in the CLAIMING
   user's account, with the same `origin: 'factory'` /
   `certifiedBy`/`certifiedAt` provenance stamps §2.11 already
   establishes. The new rifle also stores a reference back to
   `workhorse_packages.id` (a new nullable column on `rifles`, additive,
   NOT yet in P3 — flagged as implementation-time schema work, not
   designed further here since it's a trivial additive column matching
   every other cross-reference in this codebase's schema).
6. A WRONG secret (right serial, wrong secret) does NOT reveal whether
   the serial exists at all beyond "claim failed" — same
   information-minimal error shape `api/transfer.js` already uses
   ("This transfer was already redeemed or the code is invalid" — one
   message for multiple distinct failure reasons, deliberately).

**What claim does NOT do:** it does not create any zero/velocity/steel
history beyond what's in `rifle_snapshot` (the factory build sheet) —
exactly like §2.11's transfer today. It does not touch `fact_events`
retroactively for history that predates the claiming account (there is
none — this is a first claim, not an import of prior use).

---

## 4. What claiming actually does to the rest of the app

Once claimed, the resulting rifle is, deliberately, **not special**.
It's a normal row in `rifles`, owned (`user_id`) by the claiming
account, subject to every existing rule: `calibration-status.js`'s
rollup, Amendment 1's validation statuses, config-memory's carry-forward,
export, deletion policy (A17) — all unchanged. The ONLY things that
make it different from a manually-entered rifle are the two provenance
stamps (`origin: 'factory'`, `certifiedBy`/`certifiedAt`) §2.11 already
established, plus the new `workhorse_packages` back-reference (§3.5).
**No new behavior needs to be invented in the rest of the app for this
to work** — claim's whole job is to correctly produce one ordinary,
well-formed rifle row, once, for the right account. That is a
deliberate scope minimization: Phase F should not become an excuse to
special-case Workhorse rifles throughout the codebase.

---

## 5. Revoke

The one genuinely NEW capability beyond what §2.11 already has.
**Support-only, server-side, audited — never a client-callable action,
never mobile admin** (Amendment 1's own words, and consistent with this
codebase's existing "no server-side admin check on admin_* RPCs" issue
being a KNOWN gap to fix, not a pattern to repeat here — revoke must
NOT ship with client-side-only gating the way the current admin
dashboard does. See CLAUDE.md's Known Issues.).

**When revoke is used (the real scenarios, not hypothetical):**
1. **A claim secret was compromised before use** (e.g. box photographed
   in a warehouse, secret posted publicly) — revoke the unclaimed
   package before anyone can claim it with the leaked secret, then
   re-mint a fresh package (new secret) for the same physical serial.
2. **A claim happened in error** (wrong account, e.g. a warehouse
   demo unit accidentally claimed to a staff account instead of staying
   unclaimed for the real customer) — revoke undoes the binding.
3. **Fraud/dispute** — a claim is contested (stolen product claimed by
   someone other than the rightful owner) and support needs to freeze
   it while the dispute resolves.

**What revoke does:**
- Sets `status: 'revoked'`, `revoked_at`, `revoked_reason` (free text,
  support-authored, never shooter-visible verbatim — the shooter sees
  a plain "this certificate has been revoked, contact support" line,
  not the internal reason).
- **Does NOT delete or alter the rifle row that was already created**
  from a claimed package (if the package was in `claimed` status when
  revoked). Per A17 ("editable/deletable in the UI is implemented as
  supersede/reversible-exclusion; physical erasure only under the
  deletion policy") — revoking the CERTIFICATE'S validity is not the
  same act as deleting a shooter's data. The rifle's `origin: 'factory'`
  provenance stamp should be joined against `workhorse_packages.status`
  at DISPLAY time (a live JOIN/lookup, not a denormalized flag baked
  onto the rifle) so a revocation is instantly reflected without a
  backfill write touching every affected rifle row.
- **Does revoke access?** Open question — see §7.2. Revoking the
  CERTIFICATE's authenticity does not obviously mean the shooter loses
  their own subsequently-logged data (their own zero checks, their own
  steel sessions since claiming) — that data is theirs regardless of
  what the factory provenance turns out to be. This needs an explicit
  owner ruling, not an assumption either way.
- **Is reversible by a NEW mint, never by un-revoking.** A revoked
  package's status is terminal for THAT `claim_secret_hash` — support
  can mint a fresh `workhorse_packages` row (new secret) against the
  same `serial_number` if the physical item is legitimately still sound
  and just needs a new claim cycle (e.g. scenario 1 above). This keeps
  "was this specific secret ever compromised" an immutable historical
  fact rather than something a status flip could quietly erase.

**Audit requirement:** every revoke (who, when, why, which support
account) is itself a fact worth preserving permanently — either a
dedicated small table or, more consistent with this codebase's existing
pattern, a `fact_events` row (`event_type: 'workhorse_package_revoked'`,
`provenance: 'support'`) so it inherits the same never-silently-
overwritten guarantee every other fact in this app already has.

---

## 6. Secret handling summary (collecting §2's rules in one place)

| Rule | Why |
|---|---|
| Generated with a cryptographically strong RNG, 144+ bits | Matches this codebase's own proven `api/transfer.js` token generation; brute-force-infeasible even before rate limiting |
| Distinct from `serial_number`, never derived from it | Amendment 1's explicit requirement — a serial (often sequential/public-facing on the product itself) must never double as the secret |
| Hashed with a slow, salted algorithm before storage | Same discipline as password storage; a slow hash matters BECAUSE the guess space per package, while large, is finite and the stakes (proof of factory-calibrated ownership) are real |
| Never re-displayed after mint | Removes "can the app leak a claim secret to the wrong person after the fact" as an entire class of risk — the only path back is revoke + re-mint |
| Never logged, never in `fact_events` payloads, never in error messages | A claim failure's error message must not distinguish "wrong secret" from "unknown serial" (§3.6) |
| Claim endpoint is rate-limited per serial AND per caller IP/account | Threat case §7's guessing scenario — see below |

---

## 7. Threat cases

1. **Brute-force guessing a claim secret.** Mitigated by entropy (144
   bits — infeasible even unthrottled) AND rate limiting (belt-and-
   suspenders — the endpoint should lock out or exponentially back off
   repeated failed attempts against the same serial number, same
   pattern any login-with-password endpoint needs). **Open
   implementation detail, not a design gap:** exact rate-limit
   parameters are a build-time decision.
2. **Claim race — two people submit the correct secret at nearly the
   same instant** (plausible if a secret leaked and both the rightful
   owner and an opportunist are racing). The atomic conditional UPDATE
   (§3.4) guarantees exactly one winner at the database level; the
   loser gets the same "already claimed" error as an ordinary late
   attempt. **This does not by itself resolve WHO should have won** —
   that's a support/revoke-and-investigate matter (§5.1/§5.3), not
   something the claim endpoint itself can adjudicate.
3. **Secret leaked before the rightful buyer ever claims** (photographed
   in transit, warehouse leak). Mitigated by revoke-before-claim (§5.1)
   IF caught in time; if not caught in time, falls into the claim-race
   case above.
4. **Claimed by the wrong account by innocent mistake** (fat-fingered
   while signed into a demo/staff account). Mitigated by revoke (§5.2).
   Open question §7.3: should claim show a confirmation step ("claiming
   as [account email] — correct?") before committing, given how
   consequential and support-heavy an accidental claim is to unwind?
5. **A revoked package's secret is reused in a NEW mint against the
   same serial, and the OLD (leaked) secret is somehow still tried.**
   Must fail — the old `workhorse_packages` row stays `revoked`
   permanently (§5, "terminal for that hash"); only the NEW row's NEW
   secret can succeed. Verify this is true by construction (lookup is
   by `serial_number` + row `status`, and a revoked row is never
   updated back to `unclaimed`) rather than needing extra enforcement
   code.
6. **Insider (support) abuse of revoke.** Mitigated by the audit
   requirement (§5, every revoke is a permanent, attributed fact) plus
   the existing, disclosed, NOT-yet-fixed gap that `admin_*` RPCs have
   no server-side admin check (CLAUDE.md Known Issues) — **revoke must
   NOT be built on that same pattern.** This is the single clearest
   place in this spec where reusing an existing shortcut would be a
   real security regression, not a convenience. Flagged explicitly so
   it isn't missed at implementation time.
7. **Client tampering — a modified client claims to already know a
   package is claimed/unclaimed, or submits a pre-computed hash instead
   of the raw secret.** The server must independently verify serial +
   secret against the database on every claim attempt (never trust a
   client-supplied status or hash) — same principle `api/transfer.js`
   already follows (client never writes `certificate_transfers`
   directly).
8. **Replay of a captured claim request.** Once a package is `claimed`,
   the same request (same serial+secret) fails on retry because
   `status` is no longer `unclaimed` — no separate replay protection
   needed beyond the state machine itself.

---

## 8. Open questions for the owner (not decided by this spec)

1. **Does `claimed_by` mean "first claimant" or "current owner"?**
   §1 recommends "first claimant of record," with CURRENT ownership
   tracked the normal way (`rifles.user_id`, updated by the existing
   §2.11 transfer flow) — meaning `workhorse_packages.claimed_by` would
   NOT be updated on a later ordinary transfer. This keeps "who
   originally claimed this" as a stable historical fact distinct from
   "who owns it now," but it's a naming/semantics decision worth
   confirming before build, since `claimed_by` reads ambiguously either
   way.
2. **Does revoking a certificate affect the shooter's OWN subsequently-
   logged data** (their zero checks, steel sessions, etc. logged after
   they claimed)? §5 leans toward "no, that data is theirs regardless,"
   but this is a real product/legal question, not a technical one.
3. **Should claim require an explicit confirmation step** naming the
   account being claimed into, given how support-heavy an accidental
   claim is to unwind (§7.4)?
4. **Where does `api/claim.js` live relative to `api/transfer.js`** —
   one endpoint with an `action` dispatch (matching `api/transfer.js`'s
   own `mint`/`redeem` dispatch shape) or a separate file? Pure
   implementation-time call, noted so it isn't forgotten.
5. **Rate-limit parameters** (§7.1) — exact thresholds are a build-time
   decision, not a design one.

---

## 9. What this spec deliberately does NOT cover

- **Certificate evolution** (Amendment 1 Phase F also names this) — how
  a claimed package's certificate changes over time as the rifle
  accumulates its OWN history beyond the factory snapshot. Genuinely
  separate design work; not attempted here to keep this spec to the
  claim protocol specifically, as the overnight instruction scoped it.
- **The support runbook itself** (who at Workhorse can invoke revoke,
  through what interface, with what audit trail beyond §5's data-level
  requirement) — a process document, not a software design document.
- **Any UI** for claim, mint, or revoke. Per this session's own
  standing instruction ("no UI feature work"), and because Amendment 1
  Part B's own build order lists Phase F as future work requiring the
  owner's go-ahead before ANY of it — including its UI — gets built.

---

## STOP

This is a design document only. No `workhorse_packages` schema changes
beyond what P3 already has (reviewed, deployed). No claim/mint/revoke
code exists anywhere in this codebase as of this commit. Five open
questions (§8) need the owner's answers before implementation begins;
everything else here is proposed but not decided until reviewed.
