// Routes outside trading and market-data may use moderation.
import { saveAndModerate } from "../../lib/moderation/moderate.js";
export const POST = () => saveAndModerate();
