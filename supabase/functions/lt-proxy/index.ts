const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const body = await req.json()
    if (typeof body.text !== "string" || !body.text.trim()) {
      return new Response(JSON.stringify({ error: "A non-empty text value is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const endpoint = Deno.env.get("LANGUAGETOOL_URL")
    if (!endpoint) {
      console.error("LANGUAGETOOL_URL is not configured.")
      return new Response(JSON.stringify({ error: "LanguageTool is not configured." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ text: body.text, language: "en-US" }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      console.error("LanguageTool upstream returned", response.status)
      return new Response(JSON.stringify({ error: "LanguageTool is temporarily unavailable." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const result = await response.json()
    if (!result || !Array.isArray(result.matches)) {
      throw new Error("LanguageTool response did not contain a matches array.")
    }

    return new Response(JSON.stringify({ matches: result.matches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("LanguageTool proxy failed:", error)
    return new Response(JSON.stringify({ error: "LanguageTool is temporarily unavailable." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
