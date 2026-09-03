# Launch plan

The commercial half of turning Pilcrow into a business. `INFRA-MANUAL-STEPS.md`
is the mechanical checklist; this is the reasoning, and the numbers that decide
whether any of it works.

---

## 1. The unit economics, which do not currently work

ElevenLabs Flash v2.5 costs **$0.05 per 1,000 characters**, and that rate does
not fall on higher plans — paid tiers bundle more included credits rather than
discounting the unit. Stripe takes 2.9% + $0.30, so a $9.99 subscription nets
**$9.40**.

| | characters | our cost |
| --- | ---: | ---: |
| One average read (~2,000 chars) | 2,000 | $0.10 |
| A free user who exhausts the trial | 30,000 (capped) | **$1.50** |
| A subscriber at 5,000 chars/day | ~150,000 | **$7.50** |
| Break-even on one subscription | ~188,000 | $9.40 |

**A heavy subscriber costs more than they pay.** A free user who never converts
costs $1.50 in pure acquisition. Both are bounded in code:

- `services/src/shared/plans.ts` caps the trial at **20 reads or 30,000
  characters**, whichever comes first.
- The Pro plan includes **150,000 characters/month**. Past it, synthesis is
  slowed by 1.5s per chunk rather than stopped — cutting off a paying customer
  mid-paragraph to save $0.10 is a worse trade than the audio costs.
- `infra/modules/tts` reserves 50 concurrent executions, which bounds how fast
  money can leave if something loops.

At those settings, gross margin is ~80% for a typical user and ~20% at the
ceiling. Watch the `CharsSynthesized` metric on the CloudWatch dashboard; if
median monthly characters per subscriber goes above ~60,000, either the price or
the allowance has to move.

### The lever that actually fixes this

The audio cache is currently per-machine. Moving it into a shared S3 cache keyed
by `sha256(voice + model + speed + text)` — which is already the local key —
means the second person to read a given paragraph costs nothing. For anything
widely-read (documentation, popular articles, error messages) the hit rate could
be substantial. This is the single highest-value follow-up and is deliberately
**not** in the first release, because it needs real traffic to size.

---

## 2. Positioning, honestly

$9.99/month for read-aloud competes against free. macOS has a built-in system
voice and Speech Controller; Edge and Chrome have Read Aloud; a dozen browser
extensions do this badly for nothing.

What is worth paying for is not "text to speech." It is the normalization engine
— the thing that took the longest and that nobody else has bothered with. Every
free alternative treats a newline as a full stop, so the moment you point it at
anything that is not flowing prose it stutters unbearably.

**The landing page must sell that difference, not the category.** The
before/after audio demo of the same terminal output is more persuasive than the
entire rest of the site. Record it before launch.

Target the people for whom this is acute, in order:

1. Developers who read build output, logs and documentation. They feel the
   stutter problem daily and are already paying for tools.
2. People with dyslexia or ADHD who read by listening. Highest willingness to
   pay, and the most vocal advocates when something finally works.
3. Anyone who reads long-form on a laptop and wants to look away.

---

## 3. Build order

Steps 1–5 are the critical path; 6 and 7 can run alongside.

| | What | Milestone |
| --- | --- | --- |
| 1 | `infra/bootstrap`, `data`, `auth` | Google sign-in works end to end |
| 2 | `services/api` `/me`, client auth service | The app knows who you are |
| 3 | `services/tts`, client `tts.ts` | Delete your ElevenLabs key; it still works |
| 4 | Quota and paywall UI | Read 21 shows the wall |
| 5 | Stripe | Paying unblocks you |
| 6 | `web/` | pilcrow.app is live |
| 7 | Signing, notarization, DMG, auto-update | A stranger can download and run it |
| 8 | Observability, budget alarms | You find out on the day, not on the invoice |

---

## 4. Pricing sensitivity

$9.99 is defensible but not obvious. Worth knowing before launch:

- **$4.99** roughly doubles conversion in most consumer-tool cohorts, but at
  ~94,000 characters it breaks even — half the current allowance. Only viable
  alongside shared caching.
- **$9.99** is the plan. Comparable to Bear, Things, a dozen menu-bar utilities.
- **$14.99** is defensible if the accessibility audience turns out to be the core
  market; they are used to paying far more for far worse software. Do not start
  here — raising a price is easy, lowering one signals failure.
- **Annual at $79** (a 34% discount) improves cash flow and cuts churn. Add it
  once monthly retention is known, not before. The bootstrap script creates only
  the monthly price today.

Do not add usage-based pricing. Metered billing on something invoked by a
keystroke makes people hesitate before pressing the key, which destroys the
product.

---

## 5. Launch checklist

**Two weeks before**
- [ ] Record the before/after demo audio
- [ ] Privacy and Terms reviewed by counsel
- [ ] `support@pilcrow.app` exists and someone reads it
- [ ] Notarized build passes `spctl` on a Mac that has never seen the source
- [ ] Ten people who are not you complete the flow: download → sign in → 20 reads → pay

**Launch day**
- [ ] Show HN, framed around the normalization problem, not the app
- [ ] r/macapps, r/apple — read each subreddit's self-promotion rules first
- [ ] Product Hunt
- [ ] The CloudWatch dashboard open, and the budget alarm confirmed

**First week**
- [ ] Watch `PaywallHit` against sign-ups — that ratio is your conversion rate
- [ ] Watch `CharsSynthesized` per subscriber against §1
- [ ] Every "it paused weirdly here" report becomes a fixture test in
      `src/main/text/__tests__/`, which is how that engine got good and how it
      stays good

---

## 6. Support and refunds

One person answering email. Set the expectation at 48 hours and beat it.

**Refund anything asked for within 30 days, without a form.** At $9.99 the
argument costs more than the refund, and one of the few durable advantages a
small product has is being pleasant to deal with. The policy is already written
into `web/src/app/support/page.tsx`.

---

## 7. Legal, before taking money

- Privacy policy and Terms — drafts exist in `web/src/app/`, both need review.
- **Stripe Tax registration.** Digital-goods VAT/GST applies from the first sale
  in many jurisdictions. Checkout already passes `automatic_tax`, but you must
  register.
- A business entity, if you want liability separation. Not strictly required to
  take payments through Stripe as an individual, but do it before revenue is
  meaningful.
- ElevenLabs' terms allow reselling synthesis on a paid plan — confirm the tier
  you choose does, in writing, before launch.

---

## 8. What is deliberately not built

Written down so it is a decision rather than an oversight.

- **Shared server-side audio cache.** The biggest margin lever (§1). Needs real
  traffic to size.
- **Windows and Intel Mac builds.** The Swift helper is Apple-silicon-only.
- **A team plan.** No demand signal yet.
- **An annual price.** Add once monthly churn is known.
- **In-app analytics.** The CloudWatch metrics answer the commercial questions
  and nothing is shipped that watches what people read.
- **BYO ElevenLabs key as a cheaper tier.** Two ways to pay for the same thing
  doubles every code path, and the escape hatch would mostly be used to dodge the
  paywall. The `.env` route survives in unpackaged development builds only.
