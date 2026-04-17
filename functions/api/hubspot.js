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
    if (!r.ok) throw new Error("HubSpot " + r.status + ": " + path);
    return r.json();
  }
 
  try {
    // ACTION: fetch list of calls
    if (action === "calls") {
      const after = new Date(Date.now() - days * 86400000).toISOString();
      const properties = [
        "hs_call_title","hs_call_direction","hs_call_duration",
        "hs_call_status","hs_call_disposition","hs_call_summary",
        "hs_call_body","hs_call_source","hs_timestamp",
        "hs_call_has_transcript","hubspot_owner_id","hs_activity_type"
      ];
 
      const data = await hs("/crm/v3/objects/calls/search", {
        method: "POST",
        body: {
          filterGroups: [{
            filters: [{
              propertyName: "hs_timestamp",
              operator: "GTE",
              value: String(new Date(Date.now() - days * 86400000).getTime())
            }]
          }],
          properties: properties,
          sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
          limit: 100
        }
      });
 
      // Get owner names
      const ownerIds = [...new Set((data.results || [])
        .map(c => c.properties.hubspot_owner_id)
        .filter(Boolean))];
 
      const owners = {};
      if (ownerIds.length) {
        try {
          const ownerData = await hs("/crm/v3/owners?limit=100");
          (ownerData.results || []).forEach(o => {
            owners[o.id] = o.firstName + " " + o.lastName;
          });
        } catch(e) {}
      }
 
      const calls = (data.results || []).map(c => {
        const p = c.properties;
        const ownerId = p.hubspot_owner_id;
        return {
          id: c.id,
          title: p.hs_call_title || "HubSpot Call",
          direction: (p.hs_call_direction || "").toLowerCase().includes("inbound") ? "inbound" : "outbound",
          duration_ms: parseInt(p.hs_call_duration || 0),
          status: p.hs_call_status || "",
          summary: p.hs_call_summary || "",
          notes: p.hs_call_body || "",
          timestamp: p.hs_timestamp || "",
          has_transcript: p.hs_call_has_transcript === "true",
          agent_name: owners[ownerId] || ownerId || "Unknown",
          source: p.hs_call_source || "hubspot"
        };
      });
 
      return new Response(JSON.stringify({ calls }), { headers: cors });
    }
 
    // ACTION: fetch transcript for a specific call
    if (action === "transcript" && callId) {
      let transcript = "";
 
      // Method 1: hs_call_transcript property
      try {
        const data = await hs("/crm/v3/objects/calls/" + callId + "?properties=hs_call_transcript,hs_call_summary,hs_call_body");
        const p = data.properties || {};
        if (p.hs_call_transcript) {
          transcript = p.hs_call_transcript;
        } else if (p.hs_call_summary) {
          transcript = p.hs_call_summary;
        } else if (p.hs_call_body) {
          transcript = p.hs_call_body;
        }
      } catch(e) {}
 
      // Method 2: Calling extensions transcript endpoint
      if (!transcript) {
        try {
          const data = await hs("/crm/v3/extensions/calling/" + callId + "/transcript");
          if (data.segments && data.segments.length) {
            transcript = data.segments.map(s =>
              (s.speakerType || s.speaker || "Speaker") + ": " + s.text
            ).join("\n");
          }
        } catch(e) {}
      }
 
      // Method 3: Engagements v1
      if (!transcript) {
        try {
          const data = await hs("/engagements/v1/engagements/" + callId);
          const meta = (data.engagement || {}).metadata || data.metadata || {};
          transcript = meta.transcript || meta.transcriptContent || "";
        } catch(e) {}
      }
 
      return new Response(JSON.stringify({ transcript, call_id: callId }), { headers: cors });
    }
 
    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
 
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
