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
 
    // DEBUG: try multiple endpoints and return raw results
    if (action === "debug") {
      const results = {};
 
      // Try 1: engagements paged
      try {
        const d = await hs("/engagements/v1/engagements/paged?type=CALL&limit=5");
        results.engagements_paged = { total: d.total, count: (d.results||[]).length, sample: d.results && d.results[0] };
      } catch(e) { results.engagements_paged = { error: e.message }; }
 
      // Try 2: engagements recent
      try {
        const d = await hs("/engagements/v1/engagements/recent/modified?count=5");
        results.engagements_recent = { count: (d.results||[]).length, sample: d.results && d.results[0] };
      } catch(e) { results.engagements_recent = { error: e.message }; }
 
      // Try 3: conversations threads
      try {
        const d = await hs("/conversations/v3/conversations/threads?limit=5");
        results.conversations_threads = { count: (d.results||[]).length };
      } catch(e) { results.conversations_threads = { error: e.message }; }
 
      // Try 4: calling transcript list
      try {
        const d = await hs("/crm/v3/extensions/calling/transcripts?limit=5");
        results.calling_transcripts = { count: (d.results||[]).length, sample: d.results && d.results[0] };
      } catch(e) { results.calling_transcripts = { error: e.message }; }
 
      // Try 5: check token scopes
      try {
        const d = await hs("/oauth/v1/access-tokens/" + token);
        results.token_scopes = d.scopes || d;
      } catch(e) { results.token_scopes = { error: e.message }; }
 
      return new Response(JSON.stringify(results, null, 2), { headers: cors });
    }
 
    // CALLS action
    if (action === "calls") {
      const after = Date.now() - days * 86400000;
      const data = await hs("/engagements/v1/engagements/paged?type=CALL&limit=100");
      const all = data.results || [];
      const filtered = all.filter(function(e) {
        return e.engagement && e.engagement.createdAt >= after;
      });
 
      const owners = {};
      try {
        const ownerData = await hs("/crm/v3/owners?limit=100");
        (ownerData.results || []).forEach(function(o) {
          owners[o.id] = (o.firstName + " " + o.lastName).trim();
        });
      } catch(e) {}
 
      const calls = filtered.map(function(e) {
        const eng = e.engagement || {};
        const meta = e.metadata || {};
        const ownerId = String(eng.ownerId || "");
        const transcript = meta.body || meta.transcript || meta.transcriptContent || "";
        const direction = (meta.direction || "").toLowerCase().includes("inbound") ? "inbound" : "outbound";
        return {
          id: String(eng.id),
          title: meta.title || "HubSpot Call",
          direction: direction,
          duration_ms: meta.durationMilliseconds || 0,
          timestamp: new Date(eng.createdAt || eng.lastUpdated).toISOString(),
          summary: transcript,
          agent_name: owners[ownerId] || ownerId || "Unknown",
          has_transcript: transcript.length > 0,
          source: "hubspot"
        };
      });
 
      return new Response(JSON.stringify({ calls, total: data.total, filtered: calls.length }), { headers: cors });
    }
 
    // TRANSCRIPT action
    if (action === "transcript" && callId) {
      let transcript = "";
      try {
        const data = await hs("/crm/v3/extensions/calling/" + callId + "/transcript");
        if (data.segments && data.segments.length) {
          transcript = data.segments.map(function(s) {
            return (s.speakerType || s.speaker || "Speaker") + ": " + s.text;
          }).join("\n");
        }
      } catch(e) {}
      if (!transcript) {
        try {
          const data = await hs("/engagements/v1/engagements/" + callId);
          const meta = (data.engagement || {}).metadata || data.metadata || {};
          transcript = meta.body || meta.transcript || meta.transcriptContent || "";
        } catch(e) {}
      }
      return new Response(JSON.stringify({ transcript, call_id: callId }), { headers: cors });
    }
 
    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
 
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
