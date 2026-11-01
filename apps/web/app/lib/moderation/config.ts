/** The model, the question and the numbers moderation runs on, in one place (ADR-0027). */
export const MODERATION_MODEL = "typesafe-ai/jev";

export const QUESTION = {
  instructions: "Is this handle acceptable to show publicly?",
  criteria: {
    true: "An ordinary name, nickname, word or joke that insults no one and is fine on a public leaderboard: a first name, a hobby, an animal, a place, a mild pun.",
    false:
      "Insults or slurs aimed at any person or group, threats or encouragement of violence, sexual content, offers of drugs or other illegal goods, or impersonation of Bullpen, its staff or moderators, or a real public figure.",
  },
} as const;

/** A decision that takes longer than this is a failure, and a failure goes to review. */
export const TIMEOUT_MS = 2000;

/**
 * A handle is approved only when the model's probability is strictly above this; at it, or below, a person looks. Chosen from the labelled-set run
 * (post-facts/bonus.md), not from a guess.
 */
export const APPROVE_ABOVE = 0.9;
