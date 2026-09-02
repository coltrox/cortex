/**
 * O endereço e a chave publicável do banco, assados no build.
 *
 * Mora sozinho num arquivo porque quem precisa disso são dois: o cliente que
 * fala com as funções (`envio.ts`) e a campainha que ouve os toques
 * (`campainha.ts`). Se um deles guardasse a credencial, o outro teria que
 * importar dele — e os dois se importam entre si.
 *
 * Nada aqui é segredo: é a chave publicável, e ela sozinha não abre nada. As
 * tabelas estão com RLS sem policy nenhuma, e toda função exige o id do vault.
 */
export const CREDENCIAL = {
  url: import.meta.env.VITE_SUPABASE_URL ?? '',
  chave: import.meta.env.VITE_SUPABASE_CHAVE ?? ''
}

export function faltaCredencial(): boolean {
  return CREDENCIAL.url === '' || CREDENCIAL.chave === ''
}
