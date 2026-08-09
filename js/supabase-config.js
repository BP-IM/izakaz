const SUPABASE_URL = "https://iyhknauelauafmlddhgb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-2IMvfwHhxIx_vYk_PfUVg_tBz75IQR";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);