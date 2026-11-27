-- RE:Aspect · 0006 · allow DeepSeek as an AI key provider
-- Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live when dev is promoted to main).
alter table public.ai_keys drop constraint if exists ai_keys_provider_check;
alter table public.ai_keys add constraint ai_keys_provider_check
  check (provider in ('openai', 'anthropic', 'google', 'deepseek', 'other'));
