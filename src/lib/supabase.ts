import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** false, если .env не заполнен: приложение покажет экран настройки вместо белой страницы. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseKey && !supabaseUrl.includes('YOUR_PROJECT_ID') && !supabaseKey.includes('YOUR_'),
)

export const supabase = createClient(
  isSupabaseConfigured ? (supabaseUrl as string) : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? (supabaseKey as string) : 'placeholder-key',
)
