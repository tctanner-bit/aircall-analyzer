export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = decodeURIComponent(url.searchParams.get("path") || "");
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
 
  if (!auth) {
    return new Response(JSON.stringify({ error: "Missing auth header" }), { status: 400, headers: cors });
  }
 
  try {
    const aircallUrl = "https://api.aircall.io/v1/" + path;
    const response = await fetch(aircallUrl, {
      headers: {
        "Authorization": "Basic " + auth,
        "Content-Type": "application/json"
      }
    });
    const data = await response.text();
    return new Response(data, { status: response.status, headers: cors });
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
