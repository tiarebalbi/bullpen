// The one place that reaches the gateway.
export const call = (key = process.env.AI_GATEWAY_API_KEY) => fetch("https://ai-gateway.vercel.sh/v1/evaluate", { headers: { authorization: `Bearer ${key}` } });
