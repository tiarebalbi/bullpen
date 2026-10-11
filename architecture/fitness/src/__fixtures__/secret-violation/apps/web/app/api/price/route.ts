export function GET() {
  const key = process.env.COINGECKO_DEMO_API_KEY;
  return new Response(key ? "configured" : "missing");
}
