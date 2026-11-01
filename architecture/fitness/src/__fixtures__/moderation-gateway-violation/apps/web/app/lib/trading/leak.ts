// A second reader of the key and a second caller of the gateway.
export const key = process.env.AI_GATEWAY_API_KEY;
export const ask = () => fetch("https://ai-gateway.vercel.sh/v1/evaluate");
