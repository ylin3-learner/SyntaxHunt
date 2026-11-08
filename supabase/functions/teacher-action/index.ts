declare const Deno: any

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. 從 Authorization header 取得 JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '缺少 Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. 使用 ANON_KEY 初始化，這樣後續的查詢會受到 RLS 保護
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 3. 驗證使用者身份
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: '未授權：無效的 JWT' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const teacherId = user.id
    const { action, payload } = await req.json()

    // 4. 確保該老師在 classroom_state 有一行專屬資料，並生成 room_code
    let roomCode = ''
    const { data: existing } = await supabaseClient
      .from('classroom_state')
      .select('id, room_code')
      .eq('teacher_id', teacherId)
      .maybeSingle()

    if (!existing) {
      const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      const { data: inserted } = await supabaseClient.from('classroom_state').insert({
        teacher_id: teacherId,
        is_class_mode: false,
        target_count: 30,
        room_code: generatedCode,
      }).select('room_code').single()
      roomCode = inserted?.room_code || generatedCode
    } else {
      roomCode = existing.room_code
    }

    // 5. 根據 action 更新對應老師的資料 (使用 teacher_id 查詢，而不是 id)
    const now = new Date().toISOString()
    
    if (action === 'PUSH_QUESTION') {
      await supabaseClient.from('classroom_state').update({
        current_question_id: payload.questionId,
        timer_end_time: payload.timerEndTime,
        updated_at: now,
      }).eq('teacher_id', teacherId)
    }
    else if (action === 'UPDATE_SETTINGS') {
      await supabaseClient.from('classroom_state').update({
        is_class_mode: payload.isClassMode,
        target_count: payload.targetCount,
        updated_at: now,
      }).eq('teacher_id', teacherId)
    }
    else if (action === 'ADD_TIME') {
      await supabaseClient.from('classroom_state').update({
        timer_end_time: payload.newEndTime,
        updated_at: now,
      }).eq('teacher_id', teacherId)
    }

    return new Response(JSON.stringify({ success: true, roomCode }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Edge Function 錯誤:', error); // 在 Supabase Dashboard Logs 可以看到這行
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, // 改成 500
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})