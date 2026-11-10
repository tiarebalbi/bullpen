/** The model, the question and the numbers moderation runs on, in one place (ADR-0027). */
export const MODERATION_MODEL = "typesafe-ai/jev";

/** The question's name in the request and in the answer: the answers come back as an array, and this is how the one answer is found (`name`). */
export const QUESTION_NAME = "acceptable";

export const QUESTION = {
  question: "Is this handle acceptable to show publicly?",
  yes: "An ordinary name, nickname, word or joke that insults no one and is fine on a public leaderboard: a first name, a hobby, an animal, a place, a mild pun.",
  no: "Insults or slurs aimed at any person or group, threats or encouragement of violence, sexual content, offers of drugs or other illegal goods, or impersonation of Bullpen, its staff or moderators, or a real public figure.",
} as const;

/**
 * The predicate's `instructions`. /v1/decisions has no `criteria` for a predicate (the old /v1/evaluate boolean had a true and a false), so the same two criteria, word for word,
 * are written into the instructions, as Vercel's mapping table says (ADR-0027, follow-up of 2026-11-10).
 */
export const QUESTION_INSTRUCTIONS = `${QUESTION.question} Answer yes for: ${QUESTION.yes} Answer no for: ${QUESTION.no}`;

/** A decision that takes longer than this is a failure, and a failure goes to review. */
export const TIMEOUT_MS = 2000;

/**
 * A handle is approved only when the model's probability is strictly above this; at it, or below, a person looks. MEASURED, kept at 0.90 (ADR-0027, post-facts/bonus.md):
 * the labelled-set run's highest reject was 0.88, so 0.90 approves none of the 40 rejects with a margin of 0.02. It sends 17 of 106 clean handles (16.0%) to review, over the
 * 1-in-20 target; the owner decided on 2026-11-10 to keep 0.90 anyway (a wrongly accepted handle is public, a wrongly queued one costs a short wait), because lowering it
 * to fit the target would approve rejects (0.85 approves 2). A real queue over 10 handles a week means rewriting the question and re-measuring.
 */
export const APPROVE_ABOVE = 0.9;
