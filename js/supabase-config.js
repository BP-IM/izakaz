const SUPABASE_URL = "https://iyhknauelauafmlddhgb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-2IMvfwHhxIx_vYk_PfUVg_tBz75IQR";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// Some independently loaded page modules (for example, the delivery sheet)
// access the shared client through window. Keep one explicit public reference.
window.supabaseClient = supabaseClient;
