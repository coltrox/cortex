# App web de captura rápida

O caderninho de bolso do Cortex. Registra o dia — suplemento tomado, refeição
do plano, treino, cardio, peso, medidas, gasto, anotação — e manda para o
Supabase. O Cortex, no computador, puxa de lá e escreve no vault.

Ele **só escreve**. Não lê histórico, não edita, não apaga. A única leitura é o
cardápio, que é o que o Cortex publica para as telas saberem o que existe.

## Publicar na Vercel

O `vercel.json` na raiz do repositório já diz o que fazer: `npm run web:build`,
saída em `dist-web`.

1. Em vercel.com, importe o repositório `coltrox/cortex`.
2. Em Settings > Environment Variables, crie as duas:
   - `VITE_SUPABASE_URL` — a URL do projeto no Supabase
   - `VITE_SUPABASE_CHAVE` — a chave **publicável** (Settings > API)
3. Publique.

As duas entram no pacote em **tempo de build**: mudar uma delas exige publicar
de novo, não basta salvar no painel.

A chave publicável é pública por natureza — ela vive dentro do JavaScript que
qualquer visitante baixa. Ela não dá acesso a nada sem o id do vault: as
tabelas estão com RLS ligado e sem policy nenhuma, e todo acesso passa por
funções que exigem o id. Medido contra o projeto real: com a chave na mão e sem
o id, ler `eventos` direto devolve lista vazia, e `listar_eventos` com um id
diferente devolve vazio também.

## Primeiro uso no celular

1. Abra o site. Ele cai direto em Ajustes, porque ainda não há id.
2. Cole o id do vault — está no Cortex, em Configurações, aba Nuvem.
3. Toque em Salvar. O cardápio é buscado na hora; se vier vazio, ou o id está
   errado, ou o Cortex ainda não publicou o cardápio.
4. No navegador, "Adicionar à tela de início". Ele abre sem barra de endereço.

## Rodar na sua máquina

Copie `web/.env.example` para `web/.env`, preencha as duas variáveis, e:

    npm run web:dev

O Vite mostra o endereço na rede local — dá para abrir no celular pelo IP, com
os dois na mesma rede.

## Como ele funciona sem sinal

Todo envio entra numa fila no `localStorage` antes de sair. A fila esvazia ao
abrir o app, quando a rede volta, e a cada 30 segundos. O cabeçalho da tela
Hoje diz quantos itens estão esperando.

Um item recusado por **erro de dado** sai da fila e vira aviso — senão um
evento que o banco nunca vai aceitar entope a fila para sempre e leva junto
todos os registros seguintes. Um item que falha por **rede** fica e tenta de
novo.

O cardápio também fica guardado no aparelho, e é por isso que o app abre com os
suplementos do dia mesmo no metrô.

## O que não tem, de propósito

Ler histórico. Editar ou apagar registro. Gráficos. Notificação. Mais de um
usuário. O celular é um caderninho de bolso, não um segundo Cortex.
