// import { orderPool } from "../../lib/trading/orders/pool.js" would break the rule; here it is only a comment.
import { readPool } from "../../lib/trading/reads/pool.js";
export const GET = () => readPool();
