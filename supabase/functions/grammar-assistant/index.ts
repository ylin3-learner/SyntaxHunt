import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const diagnosticCodes = [
  "M:VERB", "M:AUX", "M:DET", "M:PREP", "R:VERB:TENSE", "R:VERB:SVA", "R:PREP",
  "R:DET", "R:NOUN:NUM", "R:RELATIVE", "U:PRON", "U:VERB", "U:RELATIVE",
  "O:WRONG_ORDER", "O:INVERSION", "UNKNOWN_ERROR",
]
const sstCategories = ["Omission", "Addition", "Misformation", "Misordering"]
const isDiagnosis = (value: unknown) => {
  if (!value || typeof value !== "object") return false
  const diagnosis = value as Record<string, unknown>
  return typeof diagnosis.code === "string"
    && diagnosticCodes.includes(diagnosis.code)
    && typeof diagnosis.sst === "string"
    && sstCategories.includes(diagnosis.sst)
    && Number.isInteger(diagnosis.index)
    && typeof diagnosis.message === "string"
    && typeof diagnosis.hint === "string"
}

const requestGemini = async (prompt: string, responseSchema: Record<string, unknown>) => {
  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) throw new Error("GEMINI_API_KEY 尚未設定。")

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema },
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Gemini API 失敗 (${response.status}): ${detail.slice(0, 300)}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== "string") throw new Error("Gemini 沒有回傳 JSON 內容。")
  return JSON.parse(text)
}

const chunkSchema = {
  type: "OBJECT",
  properties: {
    chunks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          can_morph: { type: "BOOLEAN" },
          morph_options: { type: "ARRAY", items: { type: "STRING" } },
          draggable: { type: "BOOLEAN" },
        },
        required: ["text", "can_morph", "morph_options", "draggable"],
      },
    },
  },
  required: ["chunks"],
}

const diagnosisSchema = {
  type: "OBJECT",
  properties: {
    code: { type: "STRING", enum: diagnosticCodes },
    sst: { type: "STRING", enum: sstCategories },
    index: { type: "INTEGER" },
    message: { type: "STRING" },
    hint: { type: "STRING" },
  },
  required: ["code", "sst", "index", "message", "hint"],
}

const matrixSchema = {
  type: "OBJECT",
  properties: {
    errors: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          answer: { type: "STRING" },
          diagnosis: diagnosisSchema,
        },
        required: ["answer", "diagnosis"],
      },
    },
  },
  required: ["errors"],
}

const normalizeAnswer = (answer: string) =>
  answer.replace(/[\[\]]/g, "").trim().toLowerCase().replace(/[.,!?;:]+/g, "").replace(/\s+/g, " ")

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const body = await req.json()
    const { action } = body

    if (action === "decompose") {
      const { sentence, ui_mode, correct_answer } = body
      if (typeof sentence !== "string" || !sentence.trim() || !Array.isArray(correct_answer)) {
        throw new Error("請提供句子、模式與正確答案。")
      }

      const result = await requestGemini(
        `將下列英文句子拆成可操作字塊。只可保留原句詞彙與標點；時態、動名詞、單複數等可能變形的詞要設定 can_morph=true，並提供包含原形和常用變化的 morph_options。每個字塊必須是單字或原本的連續片語。UI 模式：${ui_mode}。正確答案 token：${JSON.stringify(correct_answer)}。句子：${sentence}`,
        chunkSchema,
      )
      if (!Array.isArray(result.chunks) || result.chunks.length === 0) {
        throw new Error("Gemini 回傳的字塊清單無效。")
      }
      return Response.json({ chunks: result.chunks }, { headers: corsHeaders })
    }

    if (action === "prepare_question") {
      const question = body.question
      if (!question?.id || !Array.isArray(question.correctAnswer) || !question.correctAnswer.length) {
        throw new Error("題目缺少 ID 或正確答案。")
      }

      const result = await requestGemini(
        `為英文文法題產生 5 個自然、常見但錯誤的學生答案，並依照 ERRANT 編輯操作和 SST 分類診斷。錯誤碼只能是 M/R/U/O 加詞性/子類，並使用允許代碼。不要產生與正確答案相同的答案。題目：${JSON.stringify(question)}。回傳每筆答案、診斷碼、SST、錯誤索引、繁體中文 message 與 hint。`,
        matrixSchema,
      )

      if (!Array.isArray(result.errors)) throw new Error("AI 回傳的錯誤矩陣無效。")
      const correct = normalizeAnswer(question.correctAnswer.join(" "))
      const entries = result.errors
        .filter((entry: { answer?: unknown }) =>
          typeof entry.answer === "string"
          && normalizeAnswer(entry.answer) !== correct
          && isDiagnosis((entry as { diagnosis?: unknown }).diagnosis)
        )
        .slice(0, 5)
        .map((entry: { answer: string; diagnosis: Record<string, unknown> }) => ({
          question_id: question.id,
          answer_normalized: normalizeAnswer(entry.answer),
          diagnosis: entry.diagnosis,
        }))

      if (entries.length === 0) throw new Error("AI 沒有提供可用的錯誤答案。")
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      )
      const { error } = await supabase
        .from("diagnosis_cache")
        .upsert(entries, { onConflict: "question_id,answer_normalized" })
      if (error) throw error
      return Response.json({ cached: entries.length }, { headers: corsHeaders })
    }

    if (action === "diagnose") {
      const { student_answer, correct_answer, question } = body
      if (!Array.isArray(student_answer) || !Array.isArray(correct_answer) || !question) {
        throw new Error("診斷資料不完整。")
      }
      const diagnosis = await requestGemini(
        `比較學生答案和正確答案，診斷最主要的一個錯誤。ERRANT code 必須使用 M/R/U/O 加詞性或子類；SST 只能是 Omission、Addition、Misformation、Misordering。index 是學生答案中錯誤 token 的 0-based 索引；若為遺漏，指出相鄰位置；若無法判定使用 UNKNOWN_ERROR。message 與 hint 使用繁體中文。題目：${JSON.stringify(question)}。學生答案：${JSON.stringify(student_answer)}。正確答案：${JSON.stringify(correct_answer)}。`,
        diagnosisSchema,
      )
      if (!isDiagnosis(diagnosis)) {
        throw new Error("Gemini 回傳不符合診斷標籤規範。")
      }
      return Response.json({ diagnosis }, { headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
