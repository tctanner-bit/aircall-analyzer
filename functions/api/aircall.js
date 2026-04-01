export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.searchParams.get("path") || "";
  const auth = context.request.headers.get("x-aircall-auth") || "";

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-aircall-auth",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (context.request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors });
  }

  const response = await fetch("https://api.aircall.io/v1/" + path, {
    headers: { "Authorization": "Basic " + auth }
  });

  const data = await response.text();
  return new Response(data, { status: response.status, headers: cors });
}
