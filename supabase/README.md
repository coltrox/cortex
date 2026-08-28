<!-- supabase/README.md -->
# Banco da captura rápida

## Instalar

1. Criar um projeto em [supabase.com](https://supabase.com) (plano grátis).
2. Abrir **SQL Editor**, colar `schema.sql` inteiro e executar.
3. Em **Settings > API**, copiar a **Project URL** e a chave **anon public**.
4. No Cortex, aba **Nuvem** das configurações, colar as duas.
5. Em **Database > Cron**, agendar `select limpar_antigos();` uma vez por dia.
   Se a extensão `pg_cron` ainda não estiver habilitada no projeto, o painel
   vai pedir para habilitá-la antes de aceitar o agendamento — é esperado,
   não um erro.

## Por que a chave anon pode ser pública

Ela não dá acesso a nada sozinha. As tabelas estão com RLS ligado e sem
policy: nem leitura nem escrita direta são permitidas a ninguém. Todo acesso
passa pelas funções, que exigem o id do vault — e esse id nasce offline no
Cortex e nunca é publicado.

Quem tiver a chave e não tiver o id não lê nem escreve nada. Para conferir
isso depois de rodar `schema.sql`, no SQL Editor:

```sql
select has_function_privilege('anon', 'limpar_antigos()', 'EXECUTE');  -- esperado: false
```
