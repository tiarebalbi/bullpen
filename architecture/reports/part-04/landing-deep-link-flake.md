# An intermittent landing test: "a deep link to #structure-adl opens it"

Written 2026-10-21 after a time-boxed look (about 20 minutes). **Cause not found.** The test is unchanged.

**The test.** `apps/landing/e2e/rules-adl.spec.ts`: on the home page it checks the Rules card links to the file, calls `page.goto("/#structure-adl")` and expects a dialog within 5 s. Two cases fail together
(1440 and 390 px), in the "every card links to the same file" test (line 154) or the "Rules card links" test (line 69).

**What I saw.** It failed in at least four of the forced `turbo run ... test` runs I made on 2026-10-20 and 21 (the same tests each time, late in the run, and no count was kept of the runs where it passed), and passed in others, including the two most recent full runs. It passed every time I ran it outside `turbo`: alone, 12 repeats; the whole spec with 8 workers, 144 runs; `pnpm run test` in `apps/landing`, 302 tests.

**What I tried, none of which reproduced it.**
- Twelve busy loops competing for the CPU while the two tests ran four times each: 8 passed.
- A scratch test that delayed every Next script by 1.5 s and then navigated to `/#structure-adl` before the page hydrated: the dialog still opened (the hook uses `useSyncExternalStore` on `hashchange`, which re-reads the hash after it subscribes, so a hash set before hydration is seen).
- `turbo run test --filter=@bullpen/landing` with only those tests (`--grep "deep link"`): 5 passed. With traces on (`--trace retain-on-failure`) the full suite passed, so there is no trace.

**What is known.** The page snapshot Playwright saved from a failing run showed the home page rendered with no dialog, so the navigation happened but the dialog did not open within 5 s. A hydration race is the likeliest cause and
I could not produce it. I did not add a wait to the test: without a reproduction I cannot say a wait fixes it, and a wait that hides the failure would weaken the check.

**If it shows up in CI.** Re-run once; if it fails again, run the spec with `--trace on` in the CI job, which is the evidence this note lacks.
