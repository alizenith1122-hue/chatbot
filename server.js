const express = require("express");
const https = require("https");
const cors = require("cors");

const app = express();
app.use(cors()); // allows the browser to call this server without CORS errors
app.use(express.json());
app.use(express.static(__dirname)); // serves chatbot.html directly from this folder

// ---- Configure these ----
const CATALYST_PROJECT_ID = "1052000000230380";
const CATALYST_ORG = "770565564";
const MODEL = "crm-di-glm47b_30b_it";
const TOKEN_URL = "https://agent-770565564.development.catalystserverless.com/server/get_llm_token/";
// --------------------------

const CATALYST_PATH = `/quickml/v1/project/${CATALYST_PROJECT_ID}/glm/chat`;
const CATALYST_HOST = "api.catalyst.zoho.com";
 
// Fetches a fresh Bearer token from your token-generation endpoint
function getToken() {
  return new Promise((resolve, reject) => {
    https.get(TOKEN_URL, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          console.log("RAW TOKEN RESPONSE:", JSON.stringify(parsed, null, 2));
 
          // Try common field names — adjust once we see the real shape in the log above
          const token = parsed.token || parsed.access_token || parsed.oauthtoken || parsed.data;
 
          if (!token) {
            reject(new Error("Could not find token field in response: " + body));
          } else {
            resolve(token);
          }
        } catch (e) {
          reject(new Error("Failed to parse token response: " + body));
        }
      });
    }).on("error", (err) => reject(err));
  });
}
 
async function callCatalyst(payload) {
  const token = await getToken(); // fetch a fresh token every call
 
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
 
    const options = {
      hostname: CATALYST_HOST,
      path: CATALYST_PATH,
      method: "POST",
      timeout: 30000, // 30s timeout
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "Authorization": `Bearer ${token}`,
        "CATALYST-ORG": CATALYST_ORG,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    };
 
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error("Failed to parse Catalyst response: " + body));
        }
      });
    });
 
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request to Catalyst timed out"));
    });
 
    req.on("error", (err) => reject(err));
 
    req.write(data);
    req.end();
  });
}
 
// ---- Local mock tool (replace with real weather API if needed) ----
function get_weather(args) {
  const unit = args.unit || "celsius";
  const temp = unit === "fahrenheit" ? 68 : 20;
  return { location: args.location, temperature: temp, unit, condition: "Partly cloudy" };
}
 
const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather information for a specific location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "The city and country, e.g. Paris, France" },
          unit: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature unit" }
        },
        required: ["location"]
      }
    }
  }
];
 
app.post("/chat", async (req, res) => {
  try {
    const { history } = req.body; // full messages array sent from frontend
 
    let data = await callCatalyst({
      model: MODEL,
      messages: history,
      max_tokens: 500,
      temperature: 0.7,
      stream: false,
      chat_template_kwargs: { enable_thinking: true },
      tools,
      tool_choice: "auto"
    });
 
    console.log("RAW CATALYST RESPONSE:", JSON.stringify(data, null, 2));
 
    let updatedHistory = [...history];
 
    // Handle tool calls if the model requests one
    if (data.tool_calls && data.tool_calls.length > 0) {
      updatedHistory.push({ role: "assistant", content: data.response, tool_calls: data.tool_calls });
 
      for (const call of data.tool_calls) {
        const args = JSON.parse(call.function.arguments || "{}");
        let result;
 
        if (call.function.name === "get_weather") {
          result = get_weather(args);
        } else {
          result = { error: "Unknown tool: " + call.function.name };
        }
 
        updatedHistory.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result)
        });
      }
 
      data = await callCatalyst({
        model: MODEL,
        messages: updatedHistory,
        max_tokens: 500,
        temperature: 0.7,
        stream: false,
        chat_template_kwargs: { enable_thinking: true },
        tools,
        tool_choice: "auto"
      });
 
      console.log("RAW CATALYST RESPONSE (after tool call):", JSON.stringify(data, null, 2));
    }
 
    const reply = data.response || "Sorry, no response.";
    res.json({ reply });
 
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
 
app.listen(3000, () => console.log("Server running on http://localhost:3000"));
