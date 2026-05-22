function required(key: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

export const env = {
  SUPABASE_URL: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  API_URL: required('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL),
};
