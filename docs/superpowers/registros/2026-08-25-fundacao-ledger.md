# SDD ledger — plan: docs/superpowers/plans/2026-08-24-cortex-fundacao.md
Task 1: implementado (commit 5b9ce99, DONE_WITH_CONCERNS: postinstall falha sem Python/VSBuildTools; better-sqlite3 usa prebuilds N-API — verificar dentro do Electron nas tasks 5 e 11)
Task 1: revisao limpa (spec OK, qualidade aprovada, 0 Critical/Important)
Task 1: minor (deferred): .gitignore ganhou "out/" fora da lista do brief — hygiene, sem acao
Task 1: minor (deferred): @vitejs/plugin-react fixado em ^5.2.0 por conflito real de peer-dep com electron-vite@5 sobre vite major — decisao justificada
Task 1: minor (deferred): postinstall (electron-builder install-app-deps) falha sem Python/VSBuildTools; better-sqlite3@13 usa prebuild N-API — VERIFICAR DENTRO DO ELECTRON nas tasks 5 e 11
Task 1: warn resolvido pelo controller: janela do Electron com titulo "Cortex" e npm test 1/1 confirmados visualmente pelo usuario na tela, nao apenas por Get-Process
Task 1: complete (commits b3438f2..5b9ce99, review clean)
Task 2: implementado (commit f806c8f, DONE, 4 testes novos, suite 5/5)
Task 3: implementado (commit 291b83e, DONE, suite 16 testes)
Task 2: revisao — spec OK, qualidade COM ACHADOS (2 Important)
Task 2:   Important 1: matter(raw) usa cache global ilimitado do gray-matter -> vazamento de memoria com watcher reindexando; fix matter(raw, {})
Task 2:   Important 2: nenhum teste exercita CRLF (padrao desta maquina); comportamento correto por inspecao mas sem rede de protecao
Task 2:   minor (deferred): relatorio do implementador declarou contagem de linhas errada (37/42 vs 31/48 reais)
Task 2: DECISAO DO CONTROLLER (conflito com texto do plano): o plano dizia matter(raw) verbatim. Como o plano e de autoria minha e aquela linha era transcricao, nao decisao sobre cache, a correcao governa. Plano e brief atualizados para matter(raw, {}).
Task 2: fix round 1/5 despachado (resumindo implementador original)
Task 4: implementado (commit 7a1cf8a, DONE, 8 testes vault, suite 24/24)
Task 2: fix round 1/5 (2 addressed, 0 open — cache do gray-matter e cobertura CRLF; commits f806c8f..f272702)
Task 2: complete (commits 4306c2b..f272702, review clean apos 1 round)
Task 3: revisao — spec OK, qualidade COM ACHADOS (1 Critical, 2 Important, 2 minor)
Task 3:   CRITICAL: extractTasks devolve 1 de 4 tarefas em arquivo CRLF. body.split('\n') deixa \r no fim; regex termina em (.*)$ e . nao casa \r. Falha silenciosa no SO alvo.
Task 3:   Important: faltam testes de regressao CRLF (todas as fixtures usam \n)
Task 3:   Important: auto-revisao do implementador declarou "Concerns: None" sem ter exercitado CRLF
Task 3:   minor (deferred): ordem de construcao do objeto WikiLink difere da ordem da interface — cosmetico
Task 3: DECISAO DO CONTROLLER (conflito com texto do plano): o plano dizia split('\n') verbatim nos dois arquivos. Plano de minha autoria, transcricao descuidada. A correcao governa; plano e brief corrigidos para split(/\r\n|\n/).
Task 3: fix round 1/5 despachado (resumindo implementador original)
INTERRUPCAO: limite de sessao derrubou a revisao da Task 4 e o implementador da Task 5 (que tinha escrito src/main/index/db.test.ts, nao commitado). Ambos re-despachados.
Task 3: fix round 1/5 (3 addressed pendente de re-review; commit ee268e7, 8 testes CRLF novos)
Task 5: implementado (commit 43fae18, DONE, suite 32/32)
Task 5: RISCO RESOLVIDO — better-sqlite3 carrega dentro do Electron real (app.whenReady) sem compilacao. Prebuild N-API confirmado: ELECTRON_MAIN_PROCESS_SQLITE_CHECK_OK, electron=43.4.1, exit 0. Fecha a ressalva aberta desde a Task 1 e valida a distribuicao do .exe.
Task 4: revisao — spec OK, qualidade COM ACHADOS (1 Critical, 2 Important, 2 minor)
Task 4:   CRITICAL: writeAtomic usa nome de temp unico por PROCESSO (nao por chamada). Duas escritas simultaneas no mesmo path compartilham o .tmp e produzem conteudo hibrido, ambas reportando sucesso. Reproduzido pelo revisor.
Task 4:   Important: rename que falha deixa .tmp orfao para sempre (sem try/catch). Reproduzido com EPERM.
Task 4:   Important: o teste "nao deixa arquivo temporario" usa listMarkdown, que filtra so .md — incapaz de ver um .tmp. Cobertura zero da propriedade que nomeia.
Task 4:   minor (deferred): toAbsolute('.') resolve para a raiz do vault em vez de lancar — nao e escape, so polimento
Task 4:   minor (deferred): sem defesa contra symlink/junction — toAbsolute e lexical, nunca chama realpath. Mudanca de arquitetura, fora do escopo do brief.
Task 4: DECISAO DO CONTROLLER (conflito com texto do plano): plano dizia `${abs}.${process.pid}.tmp` verbatim. Terceiro defeito de autoria minha achado por revisor. A correcao governa. NOTA: o bloco writeAtomic da secao Task 4 do PLANO segue desatualizado — o codigo commitado e a verdade; corrigir o plano na revisao final.
Task 4: fix round 1/5 despachado (resumindo implementador original)
Task 3: fix round 1/5 (3 addressed, 0 open; commits f272702..ee268e7)
Task 3: minor (deferred): ordem de insercao das chaves de WikiLink ainda difere de types.ts (line em 2a posicao) — sem impacto funcional
Task 3: minor (deferred): rotulo de contagem de testes no relatorio ficou desatualizado (5 vs 6 frontmatter); numeros reais conferidos contra o git pelo revisor
Task 3: nota do revisor (fora de escopo, nao corrigir): \r solitario (Mac classico) e \r final sem \n seguinte continuam nao tratados. Exigem arquivo malformado; CRLF bem formado sempre pareia. Aceito.
Task 3: complete (commits f806c8f..ee268e7, review clean apos 1 round)
Task 5: revisao — spec OK (codigo sem desvio do brief), qualidade COM ACHADOS (3 Important, 2 minor) — TODOS de nivel plano/spec, nenhum defeito de implementacao
Task 5:   Important A: checklist_state nao e reconstruivel dos .md — contradiz a constraint global "banco descartavel". Origem: spec 7.1.
Task 5:   Important B: ninguem le SCHEMA_VERSION de volta; spec 10 promete deteccao de db corrompido/versao antiga no boot e nenhuma task implementa
Task 5:   Important C: teste de idempotencia e vacuo — cada :memory: e um banco privado novo, passaria mesmo sem IF NOT EXISTS
Task 5:   minor (deferred): PRAGMA foreign_keys=ON inerte (nenhuma FK declarada) — escolha deliberada, links.dst aponta de proposito para notas inexistentes
Task 5:   minor (deferred): relatorio diz "9 indices" e lista 8; schema tem 8
Task 5: DECISAO DO CONTROLLER A: estado do checklist passa a viver no frontmatter da nota do projeto; checklist_state vira tabela DERIVADA como as outras. Preserva "banco descartavel" e o principio "tudo e uma nota". Aplicar na spec 7.1 e no plano Shell.
Task 5: DECISAO DO CONTROLLER B: deteccao de schema_version/corrupcao no boot passa a ser requisito da Task 10 (dona de Session.open). Eu declarei spec 10 coberta por este plano, entao entrego.
Task 5: fix round 1/5 despachado (so o achado C — os A e B sao meus, nao do implementador)
Task 4: fix round 1/5 implementado (commit 646bbaf, vault 10/10, suite 42/42)
Task 6: implementado (commit f870877, DONE_WITH_CONCERNS, 8 testes, suite 42/42)
Task 6:   concern declarada pelo implementador: nenhum teste exercita syncAll com multiplos arquivos; bug de pulo silencioso multi-arquivo nao seria pego
Task 4: fix round 1/5 (3 addressed, 0 open; commits 7a1cf8a..646bbaf)
Task 4: nota do re-revisor (registrada, nao corrigir): se o rename falhar E o rm do temp tambem falhar, o erro do rm mascara o do rename. Cenario de falha dupla; o chamador ainda recebe rejeicao. Nao e regressao — o caminho antes nao tinha cleanup nenhum.
Task 4: complete (commits 291b83e..646bbaf, review clean apos 1 round)
Task 5: fix round 1/5 implementado (commit f191532, teste de idempotencia agora reabre arquivo real populado + verifica WAL)
DECISAO A aplicada: spec 7.1 reescrita — estado do checklist vive no frontmatter da nota do projeto sob a chave `seguranca:`; checklist_state vira tabela derivada. Principio "banco descartavel" preservado.
DECISAO B aplicada: adendo do controller acrescentado ao task-10-brief.md — openOrRebuildIndex() em Session.open, com 3 testes obrigatorios (versao antiga, arquivo corrompido, e caso feliz preservado para impedir que a correcao vire rm incondicional).
Task 5: fix round 1/5 (1 addressed, 0 open; commits 43fae18..f191532)
Task 5: complete (commits ee268e7..f191532, review clean apos 1 round)
Task 6: revisao — spec OK (match exato do brief), qualidade COM ACHADOS (2 Important, 2 minor)
Task 6:   Important: notes_fts com cobertura ZERO — toda indexFile insere e todo clear() apaga, nenhum teste consulta. Tabela que sustenta a busca das tasks 8 e 9.
Task 6:   Important: teste de fields sem asserção de contagem — escreve 4 chaves, confere 3; `tipo` nunca verificado. Mesma classe do bug de CRLF.
Task 6:   minor (deferred): vault.stat() chamado duas vezes (syncAll e indexFile) — desperdicio trivial
Task 6:   minor (deferred): statements re-preparados a cada chamada em vez de cacheados na classe — overhead evitavel em vault grande
Task 6: lacuna do syncAll multi-arquivo julgada MINOR pelo revisor, com argumento aceito: os 3 defeitos anteriores tinham estado mutavel compartilhado entre chamadas; o laco do syncAll nao tem — known/onDisk fotografados antes, transacao por arquivo, sem catch-and-continue.
Task 6: fix round 1/5 implementado (commit e2c92a8, 13 testes no indexer, suite 52/52, indexer.ts intocado)
Task 6: fix round 1/5 (3 addressed, 0 open; commits f870877..e2c92a8)
Task 6: complete (commits 43fae18..e2c92a8, review clean apos 1 round)
Task 7: implementado (commits d113522 + 4dcceaf, DONE, suite 53/53)
Task 7:   implementador respondeu honestamente a pergunta do "so a primeira linha": os 5 testes do brief NAO pegariam, pois cada um tem so 1 link vivo. Escreveu um 6o teste em commit separado e verificou por INJECAO DE BUG.
Task 7: revisao — spec OK, qualidade APROVADA (0 Critical/Important, 2 minor)
Task 7:   6o teste e injecao de bug julgados GENUINOS: revisor derivou a saida de falha esperada de forma independente e ela bateu literalmente com a reportada
Task 7:   minor (deferred): sem teste do inverso — link ja resolvido cujo alvo e apagado depois. Codigo esta correto por construcao (recompute total), mas nao ha rede contra "otimizacao" futura
Task 7:   minor (deferred): desempate de nome ambiguo depende da ordem de scan do SELECT sem ORDER BY; rowid muda a cada reindex (DELETE+INSERT). Nao determinstico. Algoritmo do brief, nao culpa do implementador.
Task 7: complete (commits e2c92a8..4dcceaf, review clean sem rounds)
SINALIZADO ADIANTE PARA A TASK 9: removeFile NAO dispara resolveLinks. Watcher que apaga nota deixaria resolved_path obsoleto apontando para nota inexistente — falha silenciosa. Virou requisito no brief da Task 9.
Task 8: implementado (commit b23759d, DONE_WITH_CONCERNS, 10 testes, suite 63/63)
Task 8:   concern 1 declarada: testes de getBacklinks/getBrokenLinks so tem 1 linha viva — bug de truncar na primeira nao seria pego
Task 8:   concern 2 declarada: searchFullText lanca excecao crua do SQLite com sintaxe FTS5 (C++, aspa desbalanceada, foo:bar, AND/OR/NOT soltos). Verificado empiricamente.
Task 8: DECISAO DO CONTROLLER: a busca nao pode explodir por entrada do usuario. Implementar tentativa dupla em searchFullText — query crua primeiro; se o SQLite recusar a sintaxe, refazer tratando a entrada inteira como frase literal entre aspas (aspas internas duplicadas). Preserva operadores para quem sabe usar e nao quebra para quem nao sabe.
Task 8: revisao — spec OK, qualidade APROVADA (0 Critical/Important, 2 minor)
Task 8:   revisor confirmou as 2 concerns declaradas E achou uma 3a: searchFullText tambem sem cobertura de contagem. O teste "respeita o limite" usa LIMIT 1, que so prova que o LIMIT trunca — nao que a query devolva multiplas linhas antes.
Task 8:   revisor rebaixou a evidencia do FTS5: tabela formatada a mao de script "rodado e descartado", sem comando nem saida bruta. Plausivel tecnicamente, mas abaixo do padrao do proprio bloco RED/GREEN do mesmo relatorio.
Task 8:   revisor confirmou que NENHUMA outra funcao tem a exposicao do FTS5 — so o q do searchFullText cai num sub-parser
Task 8:   minor: ORDER BY title COLLATE NOCASE sem desempate em listNotes e getBacklinks
Task 8: rodada de ajustes despachada (decisao do controller sobre FTS5 + cobertura de contagem das 3 funcoes + desempate por path). NAO e fix loop de revisao — a revisao aprovou; e mudanca pedida por mim.
Task 9: implementado (commit 4c3f773, DONE, 5 testes incl. o do adendo, suite 68/68, estavel em 3 execucoes extras)
Task 9:   concern declarada: o catch do drenar() engole mais que ENOENT — absorve erros de transacao do banco e de logica. Indice pararia de atualizar em silencio com o app parecendo saudavel. Nao corrigido por instrucao minha de nao mexer sem ordem.
Task 9: revisao — spec OK no brief E no adendo, qualidade COM ACHADOS (3 Important, 1 minor)
Task 9:   Important 1: resolveLinks fora do try/catch. drenar() e chamado como void, ninguem captura -> rejeicao nao tratada no timer, pode derrubar o processo principal. Pior que o silencio.
Task 9:   Important 2: stop() nao espera o drenar() em voo. clearTimeout so resolve o timer pendente. Vira falha concreta na Task 10, onde Session.close fecha o db logo apos stop() resolver.
Task 9:   Important 3 (o catch largo): veredito IMPORTANT, nao Critical nem Minor. Nao e Critical porque exige falha genuina de banco e o caso comum (ENOENT) e benigno e correto. E Important porque quando dispara e indetectavel por construcao — sem log, sem erro, nenhum teste alcanca. Corrigir antes da Task 10.
Task 9:   minor: nem o caso ENOENT deixa sinal operacional
Task 9:   revisor validou o determinismo dos testes: 4 usam o helper de polling; o unico com sleep fixo (.png) passa pelo motivo certo, pois o filtro acontece em enfileirar() antes da fila. E a reordenacao de onChange para depois do resolveLinks foi julgada desvio correto e necessario, nao improviso.
Task 9: DECISAO DO CONTROLLER: catch distingue ENOENT (silencioso, corrida esperada) de todo o resto (vai para um novo callback onError, opcional com padrao console.error). Watcher NAO morre — as outras notas ainda precisam dele — mas o erro deixa de ser invisivel.
Task 9: fix round 1/5 despachado (3 Important + minor, com 3 testes obrigatorios)
Task 8: ajustes implementados (commit ce5751c, DONE, queries 16/16, suite 74/74, tsc limpo)
Task 8:   IMPLEMENTADOR CORRIGIU O CONTROLLER: meu guarda /fts5|syntax|malformed/i so casava 2 dos 4 casos exigidos, medido empiricamente. Trocou por err.code === 'SQLITE_ERROR'. Meu guarda vinha de mensagens supostas; o dele, de mensagens observadas.
Task 8:   todas as 6 funcoes agora tem teste sensivel a contagem
Task 8: re-revisao — TODOS os itens addressed, desvio julgado MELHORIA
Task 8:   raciocinio do revisor: db.prepare(sql) fica FORA do try, entao erro de schema estoura ali e nunca e mascarado. Em execucao: banco travado = SQLITE_BUSY/LOCKED, corrompido = SQLITE_CORRUPT, handle fechado = TypeError do better-sqlite3. Nenhum casa o guarda. SQLITE_ERROR neste statement so vem do parser de MATCH.
Task 8:   teste do OR legitimo julgado discriminante: fallback agressivo demais viraria a frase literal "limiting OR fantasma2", que nao existe em lugar nenhum -> 0 acertos -> teste falha
Task 8: complete (commits 4dcceaf..ce5751c, review clean, 1 rodada de ajustes do controller)
Task 9: fix round 1/5 (3 addressed, 0 open; commits 4c3f773..c0afad4)
Task 9:   revisor confirmou ordem correta do stop(): clearTimeout -> fecha chokidar -> aguarda drenando. Seguro chamar 2x ou antes do start().
Task 9:   revisor confirmou sobrevivencia do watcher empiricamente: teste escreve arquivo que falha, depois ok.md, e afirma que ok.md ainda foi indexado
Task 9:   minor (deferred): try/catch do resolveLinks PROTEGIDO MAS NAO TESTADO. Nenhum teste forca resolveLinks a lancar; testes 1 e 2 mockam indexFile e exercitam o catch do laco, nao o de fora. Ramo onError(err,'(resolveLinks)') alcancado por zero testes.
Task 9:   minor (deferred): agendar() atribui this.drenando = this.drenar().finally(...) sem catch imediato. drenar() esta todo guardado internamente, mas um throw fora dos guards com stop() nunca chamado ainda viraria rejeicao nao tratada. Janela menor que antes da correcao, nao e regressao.
Task 9: complete (commits b23759d..c0afad4, review clean apos 1 round)
Task 10: implementado (commits 4ba7651 + 3462ed3, DONE, suite 91/91, tsc limpo)
Task 10:   IMPLEMENTADOR ACHOU ERRO NO MEU ADENDO: openIndex da Task 5 faz upsert incondicional de schema_version a cada abertura. Meu esboco mandava abrir e DEPOIS ler a versao para comparar — daria igual sempre, inclusive em banco antigo. A deteccao que eu adicionei para pagar a divida da spec 10 nunca dispararia. Ele sonda a versao com conexao propria ANTES do openIndex.
Task 10:   respondeu a pergunta honesta do "rebuild a cada boot": a resposta era NAO falharia. Reforcou o teste em commit separado com marcador que so sobrevive no arquivo.
Task 10: revisao — spec OK nos 3 documentos (brief, adendo, correcao), qualidade COM ACHADO CRITICAL
Task 10:   CRITICAL: vault:open aceita raiz arbitraria do renderer. invoke('vault:open',{root:'C:\Users\vitima\Documents'}) contorna pickVault e o dialogo nativo; toda a confinacao do toAbsolute passa a medir contra uma raiz escolhida pelo atacante. Schema copiado literal do MEU brief — nao e desvio do implementador.
Task 10:   revisor confirmou que o guarda de exaustividade no switch fecha a classe "canal registrado sem case devolve undefined"
Task 10:   revisor confirmou a sondagem de versao: openIndex faz upsert incondicional; a conexao propria le ANTES e fecha no finally, entao versao antiga e observada como antiga. Teste passa pelo motivo certo.
Task 10:   revisor confirmou o mecanismo do teste 3 reforcado: o marcador vive em meta e NAO tem contrapartida em disco, entao so sobrevive se o arquivo index.db nunca foi apagado. syncAll reindexa os .md de qualquer jeito, e por isso a versao fraca (checando note:list) passaria mesmo com rebuild incondicional.
Task 10:   implementador achou tambem um EBUSY do Windows que o esboco do adendo teria batido (conexao de sondagem precisa fechar no finally antes de qualquer rm)
Task 10:   minor (deferred): onChange padrao descarta o argumento kind sem comentario
Task 10:   minor (deferred): divergencia teorica entre vault.read e getNote em note:read se o arquivo sumir no meio — vault.read lanca primeiro, benigno
Task 10: DECISAO DO CONTROLLER: vault:open sai da superficie IPC alcancavel pelo renderer. Escolher pasta e acao privilegiada: so o main decide, via vault:pick com dialogo nativo. Session.open vira API so do processo principal. Nenhuma funcionalidade se perde — o fluxo real ja era pickVault -> dialogo -> session.open.
Task 10: fix round 1/5 despachado (Critical + minor, com teste que prova que o canal nao existe mais)
Task 10: fix round 1/5 implementado (commit c173114, vault:open removido, 93/93, tsc limpo)
Task 11: implementado (commit 228a346) — relatorio ainda nao recebido
Task 11: DONE_WITH_CONCERNS (commit 228a346, suite 93/93)
Task 11:   PRINCIPIO CENTRAL PROVADO: 81 notas antes, 81 depois de apagar index.db + -wal + -shm e reabrir. O banco e mesmo descartavel.
Task 11:   3 de 7 checagens manuais verificadas ponta a ponta (editar+salvar persiste em disco, sem .tmp residual, rebuild do indice)
Task 11:   4 de 7 verificadas contra os caminhos de producao com dados reais mas NAO visualmente (escolher pasta+listar, clicar pra abrir, criar externo, apagar externo) — nenhuma ferramenta do ambiente observa janela nativa do Electron
Task 11:   vault real NUNCA tocado; trabalho todo contra a copia vault-teste (81 .md confirmados)
CONTROLLER: app aberto em janela CMD contra vault-teste para verificacao visual dos 4 pontos restantes com o usuario
Task 10: fix round 1/5 (1 Critical addressed, 0 open; commits 4ba7651..c173114)
Task 10:   revisor tracou o caminho: unico acesso a Session.open/construtor de Vault e o handler de vault:pick, que usa dialog.showOpenDialog (nativo, humano escolhe). pickVault() do preload tem ZERO parametros e canal fixo.
Task 10:   revisor confirmou o guarda de exaustividade ainda solido: com vault:open fora de IpcChannel e os 7 canais restantes com case, canal estreita para never no default. tsc limpo corrobora.
Task 10:   revisor confirmou o teste de ausencia de chave como LOAD-BEARING: assere sobre Object.keys(IPC_SCHEMAS), que e exatamente a fonte que registerIpc itera. Reintroduzir a chave falharia na linha da asercao.
Task 10: complete (commits c0afad4..c173114, review clean apos 1 round)
Task 11: revisao — spec OK, qualidade APROVADA (0 Critical/Important, 2 minor)
Task 11:   ISOLAMENTO DO RENDERER CONFIRMADO: grep em src/renderer por node:fs, require(, better-sqlite3, node:path, from 'electron', process. = ZERO ocorrencias. Unica ponte e window.vaultApi.
Task 11:   BURACO NAO REALOCADO: handler de vault:pick nao aceita payload nenhum. So filePaths[0] do dialogo nativo chega ao Vault.
Task 11:   flags de seguranca da janela confirmadas: contextIsolation true, nodeIntegration false, sandbox true, sem @electron/remote
Task 11:   relatorio de verificacao manual julgado PRECISO — revisor notou que ele ate se subestima: as checagens nao-visuais exercitam 100% da logica abaixo do clique, falta so o disparo do evento no DOM
Task 11:   minor (deferred): salvar() e abrir() descartam rejeicao via void — falha de escrita vira rejeicao nao tratada sem feedback ao usuario. Shape herdado do brief, escopo minimo deliberado. Levar para o plano Shell como toast/banner de erro.
Task 11:   minor (deferred): sem handler 'activate' no darwin — sessao fechada sem como reabrir sem relancar
Task 11: complete (commits 3462ed3..228a346, review clean sem rounds)
=== TODAS AS 11 TASKS COMPLETAS ===
=== REVISAO FINAL DE BRANCH (opus, 23 commits) ===
FINAL: veredito MERGE APOS 6 CORRECOES. Arquitetura solida; confirmou que nenhum caminho de mutacao escapa do resolveLinks, que a ordem de desligamento negociada entre tasks 9 e 10 esta correta, e o principio provado (81 -> apaga indice -> 81).
FINAL CT-1 (Important): caminho do zod confina ONDE, nunca O QUE. Aceita .vault/index.db (trunca SQLite vivo sob WAL), Anexos/*.pdf (destroi anexo), e Projetos\Nima.md (segunda linha em notes para o mesmo arquivo, permanentemente obsoleta, links param de resolver por nome)
FINAL CT-2 (Important): throw entre abrir o db e aberta=true vaza handle sem caminho de fechar. No Windows tranca index.db e a proxima abertura bate EBUSY.
FINAL CT-3 (levar para o Shell): note:write sem compare-and-swap. body_hash ja e calculado e gravado no indexer e lido por NINGUEM — e o token que falta.
FINAL OITAVO DEFEITO: mkdir(dir,{recursive:true}) recria a RAIZ do vault se ela sumiu. App mostra "0 notas" com editor funcional. Viola a spec 10 pelo nome ("nao cria vault vazio por cima"). Verificado empiricamente. Nasceu no codigo de referencia do brief da Task 10 — 6o defeito de autoria do plano.
FINAL triagem dos 21 minors: 4 antes do merge, 10 para o proximo plano, 8 aceitos permanentemente. Reclassificou a defesa contra symlink de "proximo plano" para "antes do merge" porque compoe com CT-1.
ONDA DE CORRECAO: commits d3bc6fa + f961350, 106/106, tsc limpo. Q1/Q2 respondidas com evidencia real; Q3 declarou o Fix 4 como verificado so por leitura de codigo.
ALERTA: implementador reportou teste INSTAVEL pre-existente de rename concorrente no Windows em vault.test.ts — justamente o que guarda o Critical da Task 4 (corrupcao em escrita concorrente).
RE-REVISAO DA ONDA: todos os 6 addressed. Veredito PRONTO com uma acao obrigatoria (endurecer o teste instavel).
RE-REVISAO achou 2 fora de escopo: (a) writeAtomic tem a MESMA forma do 8o defeito — mkdir recursivo recria a raiz se ela sumir com a sessao ja aberta (NONO defeito); (b) recarregar() do useVault sem guarda, mesma forma de falha silenciosa.
ENDURECIMENTO (commit 42f5b75, 107/107, tsc limpo, 5 execucoes do vault.test.ts todas verdes):
  1. teste de escrita concorrente com allSettled, tolerante a EPERM/EBUSY/EACCES transitorio do Windows, asercao de conteudo INTACTA. Traco confirmado: temp por PID ainda faria hibrido e falharia.
  2. NONO defeito fechado: writeAtomic confere a raiz antes do mkdir. VaultRootMissingError movido para src/main/vault/errors.ts para evitar import circular; session.ts re-exporta.
  3. recarregar() com try/catch preenchendo erro
=== BRANCH FUNDACAO COMPLETA: 11 tasks, 25 commits, 107 testes, tsc limpo ===
