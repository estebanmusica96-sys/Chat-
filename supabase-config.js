// Reemplaza estos dos valores con los de tu proyecto en Supabase:
// Settings → API → Project URL / anon public key
const SUPABASE_URL = 'https://tbkjcopdysqnyzkomdpo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xj2wmpQmEj-yG19eW4f7mg_2MI3DvW1';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
