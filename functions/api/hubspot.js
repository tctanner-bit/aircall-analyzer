const HUBSPOT_BASE = "https://api.hubapi.com";

export async function onRequest(context) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (context.request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors });
  }

  const token = context.env.HUBSPOT_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "HUBSPOT_TOKEN not configured" }), { status: 500, headers: cors });
  }

  const url = new URL(context.request.url);
  const action = url.searchParams.get("action") || "calls";
  const days = parseInt(url.searchParams.get("days") || "30");
  const callId = url.searchParams.get("call_id") || "";

  async function hs(path, options) {
    options = options || {};
    const r = await fetch(HUBSPOT_BASE + path, {
      method: options.method || "GET",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error("HubSpot " + r.status + ": " + path + " — " + err.substring(0, 200));
    }
    return r.json();
  }

  try {

    // ACTION: fetch calls via engagements API (works with conversations.read)
    if (action === "calls") {
      const after = Date.now() - days * 86400000;

      // Use engagements API to get call engagements
      const data = await hs("/engagements/v1/engagements/paged?type=CALL&limit=100");
      const engagements = (data.results || []).filter(function(e) {
        return e.engagement && e.engagement.createdAt >= after;
      });

      // Get owners
      const owners = {};
      try {
        const ownerData = await hs("/crm/v3/owners?limit=100");
        (ownerData.results || []).forEach(function(o) {
          owners[o.id] = (o.firstName + " " + o.lastName).trim();
        });
      } catch(e) {}

      const calls = engagements.map(function(e) {
        const eng = e.engagement || {};
        const meta = e.metadata || {};
        const assoc = e.associations || {};
        const ownerId = String(eng.ownerId || "");

        const transcript = meta.body || meta.transcript || meta.transcriptContent || "";
        const durationMs = meta.durationMilliseconds || 0;
        const direction = (meta.direction || "").toLowerCase().includes("inbound") ? "inbound" : "outbound";

        return {
          id: String(eng.id),
          title: meta.title || "HubSpot Call",
          direction: direction,
          duration_ms: durationMs,
          timestamp: new Date(eng.createdAt || eng.lastUpdated).toISOString(),
          summary: transcript,
          agent_name: owners[ownerId] || ownerId || "Unknown",
          has_transcript: transcript.length > 0,
          source: "hubspot"
        };
      });

      return new Response(JSON.stringify({ calls, total: calls.length }), { headers: cors });
    }

    // ACTION: fetch transcript for a specific call
    if (action === "transcript" && callId) {
      let transcript = "";

      // Method 1: Calling Extensions transcript endpoint
      try {
        const data = await hs("/crm/v3/extensions/calling/" + callId + "/transcript");
        if (data.segments && data.segments.length) {
          transcript = data.segments.map(function(s) {
            return (s.speakerType || s.speaker || "Speaker") + ": " + s.text;
          }).join("\n");
        }
      } catch(e) { console.log("Method 1 failed:", e.message); }

      // Method 2: Engagements v1 metadata
      if (!transcript) {
        try {
          const data = await hs("/engagements/v1/engagements/" + callId);
          const meta = (data.engagement || {}).metadata || data.metadata || {};
          transcript = meta.body || meta.transcript || meta.transcriptContent || "";
        } catch(e) { console.log("Method 2 failed:", e.message); }
      }

      return new Response(JSON.stringify({ transcript, call_id: callId }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), { status: 400, headers: cors });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
