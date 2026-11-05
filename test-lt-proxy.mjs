// 移除這行：import dotenv from 'dotenv';
// 移除這行：import path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

async function testLtProxy() {
  console.log('🚀 開始測試 Supabase lt-proxy 串接...\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ 錯誤：找不到環境變數。請確認執行指令有加上 --env-file=.env.local');
    return;
  }

  const endpoint = `${SUPABASE_URL}/functions/v1/lt-proxy`;
  console.log(`📡 發送請求至: ${endpoint}`);
  console.log(`📦 測試資料: "He go school."\n`);

  try {
    const startTime = Date.now();
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'He go school.',
        language: 'en-US'
      })
    });

    const timeTaken = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ 請求失敗 (HTTP ${response.status}) - 耗時 ${timeTaken}ms`);
      console.error('錯誤詳情:', JSON.stringify(data, null, 2));
      return;
    }

    console.log(`✅ 請求成功！耗時: ${timeTaken}ms\n`);
    console.log('🔍 LanguageTool 回傳結果:');
    
    if (data.matches && data.matches.length > 0) {
      data.matches.forEach((match, index) => {
        console.log(`\n--- 錯誤 ${index + 1} ---`);
        console.log(`📝 訊息: ${match.message}`);
        console.log(`🏷️ 規則 ID: ${match.rule?.id}`);
        console.log(`🔄 建議替換: ${match.replacements?.map(r => r.value).join(', ') || '無'}`);
        console.log(`📍 位置: 偏移量 ${match.offset}, 長度 ${match.length}`);
      });
    } else {
      console.log('沒有發現任何錯誤 (或者 Response 結構不同):', JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.error('❌ 網路請求異常:', error.message);
    console.error('請檢查 Render 服務是否正在休眠 (冷啟動需要 30-60 秒)，或者 Supabase Secrets 是否設定正確。');
  }
}

testLtProxy();