// deno-lint-ignore-file no-import-prefix

import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const diagnosticCodes = [
  "M:VERB", "M:AUX", "M:DET", "M:PREP", "M:CONJ", "R:VERB:TENSE", "R:VERB:FORM",
  "R:VERB:SVA", "R:VERB:MOOD", "R:PREP", "R:DET", "R:NOUN:NUM", "R:CONJ", "U:CONJ",
  "R:RELATIVE", "U:PRON", "U:VERB", "U:RELATIVE",
  "O:WRONG_ORDER", "O:INVERSION", "UNKNOWN_ERROR",
]
const sstCategories = ["Omission", "Addition", "Misformation", "Misordering"]

interface Diagnosis {
  code: string;
  sst: string;
  index: number;
  message: string;
  hint: string;
}

const isDiagnosis = (value: unknown): value is Diagnosis => {
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

interface GeminiGenerationConfig {
  temperature: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

interface GeminiPayload {
  contents: { parts: { text: string }[] }[];
  generationConfig: GeminiGenerationConfig;
}

const requestGemini = async (prompt: string, responseSchema?: Record<string, unknown>) => {
  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) throw new Error("❌ 錯誤：GEMINI_API_KEY 尚未在 Supabase Secrets 中設定。")

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
  
  const payload: GeminiPayload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
    }
  };

  if (responseSchema) {
    payload.generationConfig.responseMimeType = "application/json";
    payload.generationConfig.responseSchema = responseSchema;
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 呼叫 Gemini API (第 ${attempt} 次嘗試)...`);
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // 處理 503 (過載) 或 429 (請求過多) 的自動重試
      if (response.status === 503 || response.status === 429) {
        // 👈 刪除了未使用的 detail 變數
        console.warn(`⚠️ Gemini 伺服器忙碌中 (${response.status})，等待重試...`);
        if (attempt === maxRetries) {
          throw new Error(`Gemini API 失敗 (${response.status}): 伺服器忙碌中，請稍後再試。`);
        }
        // 指數退避：第 1 次等 1 秒，第 2 次等 2 秒
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        continue;
      }

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini API 失敗 (${response.status}): ${detail.slice(0, 300)}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (typeof text !== "string") {
        console.error("💥 Gemini 回傳格式異常:", JSON.stringify(result));
        throw new Error("Gemini 沒有回傳有效的 JSON 內容。");
      }
      
      try {
        return JSON.parse(text);
      } catch (_e) {
        console.error("💥 無法解析 Gemini 回傳的 JSON:", text);
        throw new Error("Gemini 回傳的字串不是合法的 JSON 格式。");
      }

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // 如果錯誤不是 503 或 429，直接中斷重試
      if (!lastError.message.includes('503') && !lastError.message.includes('429')) {
        break;
      }
    }
  }

  throw lastError || new Error("未知的 Gemini API 錯誤");
}

const chunkSchema = {
  type: "object",
  properties: {
    chunks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          can_morph: { type: "boolean" },
          morph_options: { type: "array", items: { type: "string" } },
          draggable: { type: "boolean" },
        },
        required: ["text", "can_morph", "morph_options", "draggable"],
      },
    },
  },
  required: ["chunks"],
}

const diagnosisSchema = {
  type: "object",
  properties: {
    code: { type: "string", enum: diagnosticCodes },
    sst: { type: "string", enum: sstCategories },
    index: { type: "integer" },
    message: { type: "string" },
    hint: { type: "string" },
  },
  required: ["code", "sst", "index", "message", "hint"],
}

const matrixSchema = {
  type: "object",
  properties: {
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          answer: { type: "string" },
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

interface MatrixEntry {
  answer: string;
  diagnosis: Record<string, unknown>;
}

Deno.serve(async (req) => {
  console.log("📥 請求已抵達 Edge Function");

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const body = await req.json()
    console.log("📦 收到的 Body action:", body.action);
    
    const { action } = body

    if (action === "decompose") {
      const { sentence, ui_mode, correct_answer } = body
      console.log(`🔍 拆解句子: "${sentence}", 模式: ${ui_mode}, 答案長度: ${correct_answer?.length}`);
      
      if (typeof sentence !== "string" || !sentence.trim() || !Array.isArray(correct_answer)) {
        throw new Error("參數錯誤：請提供 sentence (字串)、ui_mode (字串) 與 correct_answer (陣列)。")
      }

      const prompt = `將下列英文句子拆成可操作字塊。只可保留原句詞彙與標點；時態、動名詞、單複數等可能變形的詞要設定 can_morph=true，並提供包含原形和常用變化的 morph_options。每個字塊必須是單字或原本的連續片語。UI 模式：${ui_mode}。正確答案 token：${JSON.stringify(correct_answer)}。句子：${sentence}`;

      const result = await requestGemini(prompt, chunkSchema);
      
      if (!Array.isArray(result.chunks) || result.chunks.length === 0) {
        throw new Error("Gemini 回傳的字塊清單無效或為空。")
      }
      return new Response(JSON.stringify({ chunks: result.chunks }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      })
    }

    if (action === "prepare_question") {
      const { question } = body
      if (!question?.id || !Array.isArray(question.correctAnswer) || !question.correctAnswer.length) {
        throw new Error("題目缺少 ID 或正確答案。")
      }

      const prompt = `為英文文法題產生 5 個自然、常見但錯誤的學生答案，並依照 ERRANT 編輯操作和 SST 分類診斷。錯誤碼只能是 M/R/U/O 加詞性/子類，並使用允許代碼。不要產生與正確答案相同的答案。題目：${JSON.stringify(question)}。回傳每筆答案、診斷碼、SST、錯誤索引、繁體中文 message 與 hint。`;

      const result = await requestGemini(prompt, matrixSchema);

      if (!Array.isArray(result.errors)) throw new Error("AI 回傳的錯誤矩陣無效。")
      const correct = normalizeAnswer(question.correctAnswer.join(" "))
      
      const entries = (result.errors as MatrixEntry[])
        .filter((entry) =>
          typeof entry.answer === "string"
          && normalizeAnswer(entry.answer) !== correct
          && isDiagnosis(entry.diagnosis)
        )
        .slice(0, 5)
        .map((entry) => ({
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
      return new Response(JSON.stringify({ cached: entries.length }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      })
    }

    if (action === "diagnose") {
      const { student_answer, correct_answer, question, log_id } = body
      if (!Array.isArray(student_answer)
        || !student_answer.every((token) => typeof token === "string")
        || !Array.isArray(correct_answer)
        || !correct_answer.every((token) => typeof token === "string")
        || !question
        || typeof question.id !== "string"
      ) {
        throw new Error("診斷資料不完整。")
      }
      if (log_id !== undefined && (!Number.isInteger(log_id) || log_id <= 0)) {
        throw new Error("待批改紀錄 ID 無效。")
      }

      const serviceUrl = Deno.env.get("SUPABASE_URL")
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      if (log_id !== undefined && (!serviceUrl || !serviceKey)) {
        throw new Error("無法更新待批改紀錄：Supabase service role 設定缺失。")
      }

      const admin = log_id === undefined
        ? null
        : createClient(serviceUrl!, serviceKey!)

      try {
        const answerNormalized = normalizeAnswer(student_answer.join(" "))
        let diagnosis: unknown
        if (admin) {
          const { data: cached, error: cacheError } = await admin
            .from("diagnosis_cache")
            .select("diagnosis")
            .eq("question_id", question.id)
            .eq("answer_normalized", answerNormalized)
            .maybeSingle()
          if (cacheError) throw cacheError
          diagnosis = cached?.diagnosis
        }

        if (!isDiagnosis(diagnosis)) {
          const prompt = `比較學生答案和正確答案，診斷最主要的一個錯誤。ERRANT code 必須使用 M/R/U/O 加詞性或子類；SST 只能是 Omission、Addition、Misformation、Misordering。index 是學生答案中錯誤 token 的 0-based 索引；若為遺漏，指出相鄰位置；若無法判定使用 UNKNOWN_ERROR。message 與 hint 使用繁體中文。題目：${JSON.stringify(question)}。學生答案：${JSON.stringify(student_answer)}。正確答案：${JSON.stringify(correct_answer)}。`;
          diagnosis = await requestGemini(prompt, diagnosisSchema)
        }

        if (!isDiagnosis(diagnosis)) {
          throw new Error("Gemini 回傳不符合診斷標籤規範。")
        }

        if (admin && log_id !== undefined) {
          const { data: updated, error: updateError } = await admin
            .from("learning_logs")
            .update({
              error_code: diagnosis.code,
              sst: diagnosis.sst,
              diagnosis,
              status: "SUCCESS",
            })
            .eq("id", log_id)
            .eq("status", "PENDING")
            .select("id")
            .maybeSingle()
          if (updateError) throw updateError
          if (!updated) throw new Error("待批改紀錄不存在或已完成。")
        }

        return new Response(JSON.stringify({ diagnosis }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      } catch (error) {
        if (admin && log_id !== undefined) {
          const { error: updateError } = await admin
            .from("learning_logs")
            .update({ status: "FAILED" })
            .eq("id", log_id)
            .eq("status", "PENDING")
          if (updateError) {
            console.error("更新 AI 批改失敗狀態時發生錯誤:", updateError)
          }
        }
        throw error
      }
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("💥 Edge Function 崩潰:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})