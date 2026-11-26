import { createClient } from '@supabase/supabase-js'

// The anon key is safe to ship in the browser: Row Level Security on the
// project means it can only ever touch the signed-in user's own data.
export const supabase = createClient(
  'https://uijyoxkppndiyboguhzm.supabase.co',
  'sb_publishable_ntTZHgBcoK8a5_EQwVepIQ_60e9yDPg',
)
