const SUPABASE_URL = "https://opqzijxtwjyitdvhcbxj.supabase.co";
const SUPABASE_KEY = "sb_publishable_btArcE3k7Dmuwcrkt6PgiQ_SHgt2xPh";

export async function onRequest(context) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-supabase-path, x-supabase-method, x-supabase-body",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Content-Type": "application/json"
  };

  if (context.request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors });
  }

  try {
    const path = context.request.headers.get("x-supabase-path") || "";
    const method = context.request.headers.get("x-supabase-method") || "GET";
    const body = context.request.headers.get("x-supabase-body") || null;

    const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
      method: method,
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": method === "POST" ? "return=representation" : ""
      },
      body: body || undefined
    });

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
