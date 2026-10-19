# The status-aware drift check, run on the real model

Date: 2026-10-16. The check is `model currency` in `check:arch` (ADR-0016): a node that names a provider is held to an
Accepted ADR, and a Proposed one counts as undecided. I ran the repo's own `runChecks` on a throwaway copy of this
repository (a temporary directory, nothing in the working tree changed), first with ADR-0008 set to Proposed, then set back
to Accepted, as it is on this branch.

```
=== ADR-0008 set to Proposed
✗ model currency: every external system in a CALM moment is decided in an Accepted ADR's Decision or listed as in use in docs/data-sources.md
  where:   architecture/calm/moments/part-03.architecture.json
  why:     Node "stock-data-provider" is the external system "Alpha Vantage", which ADR-0008 decides, but ADR-0008 is proposed: only an Accepted decision authorizes the model, so Alpha Vantage is still undecided (ADR-0016).
  fix:     Accept ADR-0008 before the model names Alpha Vantage, or rename the node to a provider that is decided.

✗ model currency: every external system in a CALM moment is decided in an Accepted ADR's Decision or listed as in use in docs/data-sources.md
  where:   architecture/calm/planned/part-04.architecture.json
  why:     Node "stock-data-provider" is the external system "Alpha Vantage", which ADR-0008 decides, but ADR-0008 is proposed: only an Accepted decision authorizes the model, so Alpha Vantage is still undecided (ADR-0016).
  fix:     Accept ADR-0008 before the model names Alpha Vantage, or rename the node to a provider that is decided.

✗ model currency: every external system in a CALM moment is decided in an Accepted ADR's Decision or listed as in use in docs/data-sources.md
  where:   architecture/calm/planned/part-05.architecture.json
  why:     Node "stock-data-provider" is the external system "Alpha Vantage", which ADR-0008 decides, but ADR-0008 is proposed: only an Accepted decision authorizes the model, so Alpha Vantage is still undecided (ADR-0016).
  fix:     Accept ADR-0008 before the model names Alpha Vantage, or rename the node to a provider that is decided.
=== ADR-0008 set back to Accepted
model currency: no violations
```

Part 3's moment fails, and so does every planned moment that carries the node, while the ADR is Proposed; with ADR-0008
Accepted the check holds. The unit tests that pin the same behaviour are in
`architecture/fitness/src/model-currency-check.test.ts` ("only an Accepted decision authorizes the model").
