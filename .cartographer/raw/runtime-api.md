# Runtime API Contracts

- **INVOKE_FN** `/functions/v1/teacher-action` (src/composables/useClassroomSync.ts)
- **EDGE_FN** `/functions/v1/deepgram-tts` (supabase/functions/deepgram-tts/index.ts)
- **EDGE_FN** `/functions/v1/edge-stt` (supabase/functions/edge-stt/index.ts)
- **FETCH** `https://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true` (supabase/functions/edge-stt/index.ts)
- **EDGE_FN** `/functions/v1/lt-proxy` (supabase/functions/lt-proxy/index.ts)
- **EDGE_FN** `/functions/v1/teacher-action` (supabase/functions/teacher-action/index.ts)
