import supabase from './supabase';

// One shared FAQ set shown on every car's detail screen - admin-editable
// (Admin > Settings > Car Detail FAQs), distinct from a car's own legacy
// `faqs` jsonb column (no admin UI ever wrote to it, no longer read here).
export async function getCarDetailFaqs() {
  const { data, error } = await supabase
    .from('car_detail_faqs')
    .select('id, question, answer')
    .eq('is_published', true)
    .order('position');
  if (error) throw error;
  return (data ?? []).map((row) => ({ title: row.question, content: row.answer }));
}
