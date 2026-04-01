exports.handler = async function(event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-aircall-auth",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  const path = (event.queryStringParameters || {}).path || "";
  const auth = event.headers["x-aircall-auth"] || "";

  if (!auth) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing auth" }) };
  }

  try {
    const response = await fetch("https://api.aircall.io/v1/" + path, {
      headers: { "Authorization": "Basic " + auth }
    });
    const data = await response.json();
    return { statusCode: response.status, headers: cors, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
