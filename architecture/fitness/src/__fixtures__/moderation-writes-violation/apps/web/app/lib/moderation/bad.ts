// Moderation reaching into the trading schema.
export const rename = "UPDATE trading.accounts SET handle = $1 WHERE owner_user_id = $2";
