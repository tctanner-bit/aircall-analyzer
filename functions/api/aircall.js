export async function onRequest(context) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json"
  };
 
  if (context.request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors });
  }
 
  const url = new URL(context.request.url);
  const path = decodeURIComponent(url.searchParams.get("path") || "");
 
  // Use env vars — fall back to header for local dev
  const id = context.env.AIRCALL_ID || context.request.headers.get("x-aircall-id") || "";
  const token = context.env.AIRCALL_TOKEN || context.request.headers.get("x-aircall-token") || "";
 
  if (!id || !token) {
    return new Response(JSON.stringify({ error: "Aircall credentials not configured" }), { status: 401, headers: cors });
  }
 
  const creds = btoa(id + ":" + token);
 
  try {
    const response = await fetch("https://api.aircall.io/v1/" + path, {
      headers: {
        "Authorization": "Basic " + creds,
        "Content-Type": "application/json"
      }
    });
    const data = await response.text();
    return new Response(data, { status: response.status, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
