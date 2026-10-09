# ADR-0010: Product analytics with Google Analytics 4 and Microsoft Clarity, behind consent

## Status

Proposed

## Date

2026-10-01

## Summary

GA4 and Clarity, only after consent, only in production

## Part

1

## Context

I want to know how Bullpen is used: which parts of the series people read,
whether the architecture explorer makes sense, which decision records get
opened, and where a page breaks on a phone. Without measuring any of it I am
guessing, and the series is built in public precisely so that I can learn
from what readers do.

Measuring puts third-party scripts and cookies on every page, which is a
privacy cost to the visitor and a legal one to me. So the question is not
only which tools, but under what conditions they are allowed to run. Both
tools below are free, so this stays inside the Hobby plan's non-commercial,
no-bill posture (ADR-0001): no cost, and no DNS change.

## Decision

I am adding product analytics with Google Analytics 4 and Microsoft Clarity,
behind the visitor's consent, in production only. The rules:

- Measure with two external systems, Google Analytics 4 and Microsoft
  Clarity, on the landing site and on the trading app. Google Analytics 4
  counts page views and a short list of custom events; Microsoft Clarity
  records heatmaps and session recordings.
- Consent comes first. Nothing from Google Analytics 4 or Microsoft Clarity
  loads, and none of their cookies exist, until the visitor accepts in a
  banner shown to everyone until they choose. A visitor who rejects gets no
  script at all. The choice lives in one first-party cookie,
  `bullpen_consent`, per app, because the two apps share no parent domain.
- Advertising stays off. For Google Analytics 4, `ad_storage`,
  `ad_user_data` and `ad_personalization` are always denied, with the
  Consent Mode default call queued before the tag; only `analytics_storage`
  changes, and only on accept. Microsoft Clarity gets its consent signal with
  advertising storage denied.
- Production only. A tag loads only when `VERCEL_ENV` is `production`, the
  tool's id is set (`NEXT_PUBLIC_GA_MEASUREMENT_ID`,
  `NEXT_PUBLIC_CLARITY_PROJECT_ID`) and the visitor accepted. Previews and
  local development send nothing.
- No library: both tags are loaded by a small loader in `packages/ui`, so
  the Consent Mode default is provably ahead of the Google tag and no
  dependency is added. Components report events only through one `track`
  helper that does nothing until consent is given.
- Withdrawing is as easy as accepting: a "Cookie settings" link in each
  footer reopens the banner, and withdrawing stops both tools and deletes
  the cookies of theirs that the site can reach.
- The CALM Part 1 moment gains Google Analytics 4 and Microsoft Clarity as
  external systems, connected from the landing site and from the trading app.

## Consequences

- Third-party scripts run on every page for visitors who accept. That is the
  point, and it is also a cost: more requests, and two vendors that see
  those visitors.
- A banner on first visit, a `/privacy` page, and a footer link in both apps
  are now part of the product, and the privacy page has to stay true to
  what the code does. Cookie names and lifetimes come from the vendors' own
  documentation and can change under me.
- Microsoft Clarity sets some cookies on Microsoft's own domains that the
  site cannot delete on withdrawal; the privacy page says so.
- Some behaviour is set by hand in the vendors' consoles, outside the
  repository: Google Analytics 4's "page changes based on browser history
  events" must be off, because the landing navigates by hash and page views
  are sent by hand, once per pathname.
- Ids live in Vercel's environment variables, for Production only. An id
  that is missing means that tool simply never loads.
- Part 1's explorer shows the two systems. The planned moments for Parts 2
  to 6 predate this decision and do not name them, so the explorer carries
  them forward into those parts, marked as built in Part 1, until a built
  moment says otherwise (ADR-0011).

## Alternatives

- **Vercel Web Analytics** — free on Hobby and cookieless, but limited to
  50,000 events a month, a one-month reporting window and no custom events
  on that plan, and it has no recordings or heatmaps. It would answer "how
  many" and not "where did it break".
- **Plausible** — privacy-friendly and cookieless, but it is a paid
  subscription or a service of my own to run, which is a new thing to pay
  for or operate before Part 1 has earned it.
- **None** — nothing to consent to and nothing to maintain, at the price of
  guessing how the site is used.

## Links

- ADR-0001 (stack) — the Hobby, free-tier posture this stays inside.
- ADR-0006 (React Flow explorer) — the explorer content must match the CALM
  moment, so the two new systems appear in both.
- `architecture/calm/moments/part-01.architecture.json` — the Part 1 moment
  that names both systems.
- Google Consent Mode: https://developers.google.com/tag-platform/security/guides/consent
- Microsoft Clarity Consent API v2: https://learn.microsoft.com/clarity/setup-and-installation/clarity-consent-api-v2
