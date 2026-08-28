<!-- supabase/README.md -->
# Banco da captura rápida

## Instalar

1. Criar um projeto em [supabase.com](https://supabase.com) (plano grátis).
2. Abrir **SQL Editor**, colar `schema.sql` inteiro e executar.
3. Em **Settings > API**, copiar a **Project URL** e a chave **anon public**.
4. No Cortex, aba **Nuvem** das configurações, colar as duas.
5. Em **Database > Cron**, agendar `select limpar_antigos();` uma vez por dia.

## Por que a chave anon pode ser pública

Ela não dá acesso a nada sozinha. As tabelas estão com RLS ligado e sem
policy: nem leitura nem escrita direta são permitidas a ninguém. Todo acesso
passa pelas funções, que exigem o id do vault — e esse id nasce offline no
Cortex e nunca é publicado.

Quem tiver a chave e não tiver o id não lê nem escreve nada.
