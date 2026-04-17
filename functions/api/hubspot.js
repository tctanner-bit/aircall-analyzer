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
    const text = await r.text();
    if (!r.ok) throw new Error("HubSpot " + r.status + ": " + path + " — " + text.substring(0, 300));
    try { return JSON.parse(text); } catch(e) { return { _raw: text }; }
  }

  try {

    // DEBUG endpoint
    if (action === "debug") {
      const results = {};

      try {
        const d = await hs("/conversations/v3/conversations/threads?limit=5");
        results.conversations_threads = { count: (d.results||[]).length, sample: d.results && d.results[0] };
      } catch(e) { results.conversations_threads = { error: e.message }; }

      try {
        const d = await hs("/crm/v3/extensions/calling/transcripts?limit=5");
        results.calling_transcripts = { count: (d.results||[]).length, sample: d.results && d.results[0] };
      } catch(e) { results.calling_transcripts = { error: e.message }; }

      try {
        const d = await hs("/crm/v3/extensions/calling/transcripts/search", {
          method: "POST",
          body: { limit: 5 }
        });
        results.calling_transcripts_search = { count: (d.results||[]).length, sample: d.results && d.results[0] };
      } catch(e) { results.calling_transcripts_search = { error: e.message }; }

      try {
        const d = await hs("/crm/v3/owners?limit=5");
        results.owners = { count: (d.results||[]).length, sample: d.results && d.results[0] };
      } catch(e) { results.owners = { error: e.message }; }

      return new Response(JSON.stringify(results, null, 2), { headers: cors });
    }

    // CALLS: fetch via calling transcripts API
    if (action === "calls") {
      const after = new Date(Date.now() - days * 86400000).toISOString();

      // Search calling transcripts
      const data = await hs("/crm/v3/extensions/calling/transcripts/search", {
        method: "POST",
        body: {
          limit: 100,
          after: after
        }
      });

      const results = data.results || [];

      // Get owners
      const owners = {};
      try {
        const ownerData = await hs("/crm/v3/owners?limit=100");
        (ownerData.results || []).forEach(function(o) {
          owners[o.id] = (o.firstName + " " + o.lastName).trim();
        });
      } catch(e) {}

      const calls = results.map(function(t) {
        const transcript = (t.segments || []).map(function(s) {
          return (s.speakerType || s.speaker || "Speaker") + ": " + s.text;
        }).join("\n");

        return {
          id: String(t.engagementId || t.id),
          title: t.title || "HubSpot Call",
          direction: (t.direction || "outbound").toLowerCase(),
          duration_ms: t.durationMilliseconds || 0,
          timestamp: t.createdAt || t.updatedAt || new Date().toISOString(),
          summary: transcript,
          agent_name: owners[t.ownerId] || t.ownerId || "Unknown",
          has_transcript: transcript.length > 0,
          source: "hubspot"
        };
      });

      return new Response(JSON.stringify({ calls, total: calls.length }), { headers: cors });
    }

    // TRANSCRIPT: fetch single transcript
    if (action === "transcript" && callId) {
      let transcript = "";
      try {
        const data = await hs("/crm/v3/extensions/calling/" + callId + "/transcript");
        if (data.segments && data.segments.length) {
          transcript = data.segments.map(function(s) {
            return (s.speakerType || s.speaker || "Speaker") + ": " + s.text;
          }).join("\n");
        }
      } catch(e) { console.log("Transcript fetch error:", e.message); }
      return new Response(JSON.stringify({ transcript, call_id: callId }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
