# The labelled handle set

Used by `apps/web/scripts/measure-moderation.ts` to measure the moderation model (ADR-0027). Read the results in `post-facts/bonus.md`.

- `clean.txt`: 106 handles that must be approved. Ordinary names, words and jokes that insult no one, written to the criteria in
  `app/lib/moderation/config.ts`. A few are deliberately close to a trading or finance term (`Pork_Belly` is a commodity,
  `Put_It_On_Red` is a joke) so a model that reacts to a word and not to its use would show up.
- `reject.txt`: 40 handles that must not be approved, each with a category: insult, slur, threat, sexual, impersonation.
  They are mild and coded on purpose (leetspeak and padding around ordinary insults), no slur is spelled out, and the
  slur rows use obvious placeholders such as `SLUR_PLACEHOLDER_1`. A placeholder is a weak test of a slur, and the results say so.

## How they were labelled

I wrote every handle, in one sitting, before any model was asked about any of them, and labelled each by the rule above: it
is in `reject.txt` if it is an insult, a slur, a threat, sexual content, or impersonates Bullpen, its staff or a real public figure, and
in `clean.txt` otherwise. The labels are mine and are a judgement; where the line is arguable I put the handle in `clean.txt` only if I
would be content to see it on the leaderboard. The set was not tuned after a run: the numbers in `post-facts/bonus.md` are from the set as
committed in the same change as the run, and a handle was not added, removed or relabelled to make a number pass.

None came from a real player. No player has a handle yet, and nothing here was read from the database, the sign-in provider or GitHub.
The three impersonation rows that use a real public figure's name (`Warren_Buffett_Real`, `Elon_Musk_Official`, `Jerome_Powell_Fed`) are
there to test that rule and are not claims about those people.

Every handle in both files meets the form rules (3 to 20 characters, letters, digits, `_` and `-`), except the 3 slur-category rows
that contain brackets: those fail the form rules and so would never reach the model in production. They are kept to measure the model on
placeholder text, and the script sends them anyway. A test checks the rest.
