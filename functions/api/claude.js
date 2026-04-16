export async function onRequest(context) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
 
  if (context.request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors });
  }
 
  // Use env var — fall back to header for local dev
  const apiKey = context.env.ANTHROPIC_KEY || context.request.headers.get("x-api-key") || "";
 
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Anthropic API key not configured" }), { status: 401, headers: cors });
  }
 
  try {
    const body = await context.request.text();
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: body
    });
    const data = await response.text();
    return new Response(data, { status: response.status, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
