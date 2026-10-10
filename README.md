# Simulador TAAD — Prova de Conhecimentos (ISSM, IP-RAM) · versão 2

App web offline (PWA) para treinar a **Prova de Conhecimentos** do concurso *Aviso n.º 368/2026*
(Técnico Auxiliar de Apoio Domiciliário, ISSM, IP-RAM). Funciona no telemóvel sem internet depois
da primeira abertura e está protegida por um PIN: sem ele não se vê nenhuma pergunta nem nenhum modo.

O objetivo não é decorar a legislação, é **treinar a encontrar a resposta nos documentos impressos**
que se podem consultar na prova. Por isso, no fim de cada teste, cada pergunta diz em que legislação,
em que artigo e em que página impressa está a resposta.

---

## 1. O que tem

| Modo | Perguntas | Tempo | Cronómetro | Palpite da legislação |
|---|---|---|---|---|
| **Real** | 25 | 2 h no máximo | decrescente | não |
| **Treino 20 / 15 / 10 / 5** | 20 / 15 / 10 / 5 | 1 h 36 min / 1 h 12 min / 48 min / 24 min (4 min 48 s por pergunta) | decrescente | sim |
| **Livre** | sem limite | sem limite | **crescente** | sim |

Em todos os modos:

- o resultado só aparece **no fim**; durante o teste não se vê qual é a legislação nem se a resposta está certa;
- pode-se **voltar atrás** e mudar uma resposta sem perder as outras (a paleta de números no topo leva a qualquer pergunta);
- no fim há a **correção completa**: a resposta dada, a resposta certa, uma explicação curta com o texto do artigo, e a indicação **«legislação · artigo · pág. N»**;
- nota na escala 0–20 (errada ou em branco vale 0; aprovação a partir de 9,50), como na prova real.

O **Real** e os **Treinos** sorteiam as perguntas de forma equilibrada pelas 6 legislações (no Real,
4 a 5 de cada). Não há perguntas repetidas dentro do mesmo teste.

### O palpite da legislação (Treinos e Livre)

Antes de ver as opções de uma pergunta, escolhe-se em que das 6 legislações (alíneas a) a f) do Aviso)
se acha que está a resposta. A app diz logo se foi certo ou errado e **onde está mesmo** a resposta;
a escolha fica fechada (não há «Não sei»). O palpite **nunca conta para a nota**; só há uma
estatística à parte no fim («certo em X/Y»).

O palpite só é pedido nas perguntas que **não** dizem de que legislação são (159 das 330). Quando o
enunciado nomeia a legislação (por exemplo «Segundo o Código do Trabalho…») ou o mesmo tema aparece em
mais do que um texto, não faz sentido adivinhar e a pergunta aparece logo com as opções. No Real nunca
há palpite, como na prova.

### O modo Livre

Para treinar ao seu ritmo, sem fixar o número de perguntas:

- as perguntas vão aparecendo uma a uma (cada uma de uma legislação sorteada com a mesma probabilidade, sem repetir);
- **«Seguinte»**, na última pergunta, traz uma pergunta nova; **«Terminar»** (sempre visível) acaba o teste, depois de uma confirmação;
- o cronómetro **conta para cima** desde o início e **não pára** (nem com o ecrã bloqueado), tal como não pára na prova;
- no fim aparecem **só as perguntas respondidas**, com a correção e a indicação de onde está cada resposta; as que ficaram sem resposta não entram na correção (a app avisa quantas foram);
- mostra o **tempo total usado** e diz se está **dentro do tempo esperado**: a prova real dá 120 minutos para 25 perguntas, ou seja, **4 min 48 s por pergunta**. O tempo esperado é *número de perguntas respondidas × 4 min 48 s*; o tempo gasto nas perguntas sem resposta conta no total;
- a pontuação é *certas ÷ respondidas*, também em equivalente 0–20. Como só conta o que foi respondido, **não é comparável com uma prova de 25 perguntas**: serve para ver como se está a sair, não para prever a nota.

---

## 2. O que está nesta pasta

Esta pasta é o site completo, pronto a publicar como está. Não é preciso instalar nem «compilar» nada.

| Ficheiro | Função |
|---|---|
| `index.html`, `styles.css`, `app.js` | A aplicação |
| `questions.enc.js` | O banco de **330 perguntas, cifrado** (AES-256-GCM, chave derivada do PIN). Ilegível sem o PIN. |
| `manifest.json`, `sw.js`, `icons/` | Tornam a app instalável e 100 % offline |
| `README.md` | Este ficheiro |

> **Não publiques** o ficheiro `questions.json` nem o `build_encrypt.py` (vão à parte, no outro zip):
> o `questions.json` tem as perguntas e as respostas certas em texto simples.

---

## 3. Publicar no GitHub Pages

Pode fazer-se tudo pelo site do GitHub, sem linha de comandos.

1. No [github.com](https://github.com): **New repository**, um nome (por exemplo `taad-simulador`), **Public** (o GitHub Pages gratuito exige repositório público), **Create repository**.
2. **uploading an existing file** e arrasta **o conteúdo desta pasta** (`index.html`, `styles.css`, `app.js`, `questions.enc.js`, `manifest.json`, `sw.js`, `icons/`, `README.md`). Têm de ficar na **raiz** do repositório, não dentro de outra pasta.
3. **Commit changes**.
4. **Settings → Pages → Build and deployment → Branch**: `main` e `/ (root)` → **Save**.
5. Passado um ou dois minutos, a mesma página mostra o endereço, algo como `https://<utilizador>.github.io/taad-simulador/`.

### Instalar no telemóvel

Abrir o endereço **com internet**, introduzir o PIN uma vez e instalar:

- **Android (Chrome):** menu ⋮ → «Instalar app» / «Adicionar ao ecrã principal».
- **iPhone (Safari):** botão de partilha → «Adicionar ao ecrã principal».

A partir daí abre pelo ícone, sem barra do navegador, **e funciona sem rede**. Convém experimentar uma vez com o telemóvel em modo de avião, para ter a certeza.

### Atualizar uma instalação anterior

Quem já tem uma versão anterior instalada recebe esta automaticamente: abrir a app **com internet**, fechá-la por completo e abri-la outra vez. Se aparecer a mensagem «banco de perguntas desatualizado», repetir uma vez.

Sempre que mudares algum ficheiro (sobretudo `questions.enc.js`), **aumenta o número em `CACHE_NAME`**, no início de `sw.js` (de `simulador-taad-v2` para `simulador-taad-v3`, etc.). Sem isso, os telemóveis continuam a usar a cópia antiga guardada.

---

## 4. Sobre o PIN

O banco de perguntas está cifrado: quem abrir o endereço ou o repositório não vê perguntas nem respostas sem o PIN. **Mas um PIN de 4 algarismos não é um cofre**: alguém com conhecimentos técnicos e o ficheiro `questions.enc.js` pode experimentar as 10 000 combinações. Serve para que outras pessoas não vejam o conteúdo por acaso, não para o proteger de quem o queira mesmo abrir. **Não escrevas o PIN em nenhum ficheiro do repositório.**

Mudar o PIN ou acrescentar perguntas exige gerar de novo o `questions.enc.js` com o `build_encrypt.py` (no zip de manutenção, que **não** se publica), publicar o ficheiro novo e aumentar o `CACHE_NAME`.

---

## 5. As perguntas: o que garantem e o que não garantem

O banco tem **330 perguntas de escolha múltipla** (4 opções, uma só certa), escritas **a partir do texto impresso** dos 6 documentos de consulta:

| Alínea | Legislação | Perguntas | Versão do texto |
|---|---|---|---|
| a) | DLR n.º 21/2024/M (carreira de TAAD) | 43 | Diário da República, 23-12-2024 |
| b) | Portaria n.º 38/2013 (serviço de apoio domiciliário) | 39 | DR, 30-01-2013 (págs. 605 a 608) |
| c) | Código do Trabalho (Lei n.º 7/2009) | 104 | consolidada à data de 27-03-2025 |
| d) | LTFP (Lei n.º 35/2014) | 31 | consolidada à data de 10-01-2024 |
| e) | Orgânica do ISSM, IP-RAM (DLR n.º 34/2012/M) | 48 | consolidada à data de 29-07-2024 |
| f) | Estatutos do ISSM, IP-RAM (Portaria n.º 17/2017) | 65 | Jornal Oficial, 23-01-2017 |

(O DLR n.º 11/2018/M, que adapta a LTFP à Região, também é de consulta na alínea d); ainda não tem perguntas.)

**Como foram verificadas.** Cada pergunta guarda a(s) frase(s) do artigo que provam a resposta, e:

1. uma verificação automática confirma que essa frase **existe, letra a letra, no documento**, e que o artigo, o número e a alínea indicados são os desse texto; a **página** é a página impressa onde essa frase está;
2. outra verificação automática confirma que as citações «entre aspas» das explicações e os números dos enunciados existem no artigo indicado;
3. cada pergunta foi relida, uma a uma, contra o texto: uma só opção defensável, opções erradas que não sejam também verdadeiras, e legislação indicada de acordo com o tema.

**O que isto não garante** (para não criar falsas ideias):

- É um banco de treino escrito por IA e conferido com ferramentas, **não é a prova nem uma amostra dela**. O júri não publicou que artigos vai usar nem quantas perguntas saem de cada legislação; o sorteio equilibrado é uma escolha desta app.
- As perguntas seguem **as versões que foram impressas** (tabela acima). Se existir uma versão mais recente de algum texto, a resposta oficial pode ser diferente. **Em caso de dúvida, manda o texto impresso.**
- Alguns temas têm regras diferentes conforme o texto (por exemplo, os dias de férias no Código do Trabalho, na LTFP e no DLR n.º 11/2018/M). Nas perguntas em que isso foi identificado, o enunciado diz segundo que texto se responde.
- O número de página é o **impresso na própria folha**, não a posição da folha na pilha. A secção «Como encontrar a página indicada», no fim de cada teste, diz onde está o número em cada documento. Se a impressão for de outra versão do texto, o **artigo** é a referência mais segura.
- O palpite só aparece em parte das perguntas (ver acima); por exemplo, quase todas as do DLR n.º 21/2024/M falam logo da carreira de TAAD e por isso não têm palpite.

Se encontrares uma pergunta cuja resposta não bata certo com o documento impresso, vale o documento: avisa para ser corrigida.

---

## 6. Compatibilidade

Funciona em navegadores atuais (Chrome, Edge, Safari, Firefox) em Android, iPhone e computador, em modo claro e escuro. Precisa de ligação à internet **só** na primeira abertura e quando houver uma versão nova. O progresso de um teste **não é guardado**: se a app for fechada a meio, o teste perde-se.
