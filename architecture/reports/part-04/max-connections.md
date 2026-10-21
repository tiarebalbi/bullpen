# max_connections on the production compute

Date: 2026-10-20, 16:50 (local time of the console session).

## The reading

`SHOW max_connections` returned **112** on the Neon production branch (database `neondb`, primary compute, Active).
I read it in the Neon console SQL editor myself, not through `DATABASE_URL_TRADING` and not from a script; the
console's query history shows it at "Oct 20, 2026 - 4:50pm". I did not print or handle any connection string.

Earlier readings on the same branch: 901 on 2026-10-13 and 2026-10-19 (`../part-03/neon-roles.md`). The compute
is set to 0.25 CU as of 2026-10-20; I did not record when it was changed.

## What Neon's docs say (raw pages read 2026-10-20)

An earlier version of this file gave a table with 112, 225 and 901 for the compatibility and "Manage computes" pages and a
formula `450.5 × compute_size`. **That was wrong.** It came from a search summary, and neither page says it. I fetched each page
again as raw text, and `450.5` and `901` appear on neither. What they say:

1. [Postgres compatibility](https://neon.com/docs/reference/compatibility), section "Parameter settings that differ by compute size":

   > `max_connections = max(100, min(4000, floor(compute_size × 419.66)))`

   and, for a range that starts at 0.25 CU and ends at 2 CU:

   > Compute size = min(2, 8 × 0.25) = min(2, 2) = 2
   > Max connections = 2 × 419.66 = 839 connections

   The same page's table of default Postgres parameters (a different section) lists `max_connections` as `112`, with the note
   "The value differs by compute size." So 112 is the page's default value, with no compute size attached to it.

2. [Manage computes](https://neon.com/docs/manage/computes), section "How to size your compute", the table of compute size, RAM,
   cache and `max_connections`: 0.25 CU is 104, 0.50 is 209, 1 is 419, 2 is 839.

3. [Connection pooling](https://neon.com/docs/connect/connection-pooling), the table of compute size, RAM and `max_connections`: the same four
   numbers, 104, 209, 419 and 839, and the sentence "Seven connections are reserved for the Neon superuser account. For a 0.25 CU compute,
   this means 97 connections are available for your application (104 total - 7 reserved)."

So the docs agree with each other on 104 at 0.25 CU and 839 at 2 CU (839 is also what the formula gives for a 0.25 to 2 CU autoscaling
range), and they do not contain 112 as a figure for 0.25 CU, nor 901 for anything.

## Reading it

- The live values are 112 now and were 901 on 2026-10-13 and 2026-10-19. Against the docs they are 7.7 % above 104 and 7.4 % above 839. The two
  ratios are almost the same, and 112 and 901 are each close to a single multiplier of about 450 connections per CU
  (112 / 0.25 = 448; 901 / 2 = 450.5). That is an observation about my two numbers. **I have not found a Neon page that states that
  multiplier**, so I cannot say why the live value is above the documented one.
- What this supports: the live value dropped from 901 to 112 between 2026-10-19 and 2026-10-20, in the same proportion as the documented
  drop from 839 to 104, which is what a change of the maximum from 2 CU to 0.25 CU would do. That is the evidence for "capped at 0.25 CU" and it
  is an inference from the proportion. The compute size itself is read in the console (Branches, Compute, Edit), which I did not do.
- It does not show what the compute did between 2026-10-13 and the change; Part 3's reports already say that is unknown.
- I am not treating 104 or 112 as a documented figure for this compute. The reading is a record of what the database reported while the Part 4
  runs were done, not a claim about Neon's documentation.
