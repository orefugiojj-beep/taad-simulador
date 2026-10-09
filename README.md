# Simulador TAAD — Prova de Conhecimentos (ISSM, IP-RAM)

App web offline (PWA), para a Ana treinar para a **Prova de Conhecimentos** do concurso
*Aviso n.º 368/2026* — Técnico Auxiliar de Apoio Domiciliário, ISSM, IP-RAM.

Funciona inteiramente no telemóvel/computador, sem internet depois da primeira visita, e
fica protegida por um PIN — sem o PIN não é possível ver perguntas, respostas, nem sequer
os modos de treino.

---

## 1. O que está aqui dentro

Esta pasta é o site completo, pronto a publicar tal como está — não precisas de instalar
nada nem de "compilar" nada.

| Ficheiro | Função |
|---|---|
| `index.html`, `styles.css`, `app.js` | A aplicação em si |
| `questions.enc.js` | O banco de perguntas, **cifrado** (AES-256-GCM). Ilegível sem o PIN. |
| `manifest.json`, `sw.js`, `icons/` | Tornam a app instalável e 100% offline (PWA) |
| `README.md` | Este ficheiro |

**PIN de acesso: `2016`**

---

## 2. Publicar no GitHub Pages (passo a passo)

Não precisas de usar a linha de comandos — tudo isto pode ser feito pelo site do GitHub.

1. Entra em [github.com](https://github.com) com a tua conta e clica em **New repository**
   (botão verde, ou `+` no canto superior direito → *New repository*).
2. Dá um nome ao repositório — por exemplo `taad-simulador` — deixa-o **Public** (o GitHub
   Pages gratuito exige que o repositório seja público) e clica em **Create repository**.
3. Na página do repositório recém-criado, clica em **uploading an existing file**.
4. Arrasta **todos os ficheiros e a pasta `icons/` desta pasta** (`index.html`,
   `styles.css`, `app.js`, `questions.enc.js`, `manifest.json`, `sw.js`, `icons/`,
   `README.md`) para a zona de upload. Importante: têm de ficar na **raiz** do
   repositório, não dentro de mais nenhuma subpasta.
5. Em baixo, escreve uma mensagem como "primeira versão" e clica em **Commit changes**.
6. Vai a **Settings** (nas abas do topo do repositório) → **Pages** (no menu lateral
   esquerdo).
7. Em "Build and deployment" → "Branch", escolhe `main` e a pasta `/ (root)`, depois
   **Save**.
8. Espera 1-2 minutos. A mesma página mostra o link onde a app fica disponível, algo como:
   `https://<o-teu-utilizador>.github.io/taad-simulador/`

A partir desse link, a app pode ser aberta em qualquer telemóvel ou computador. Para a
instalar como aplicação (ícone no ecrã principal, a abrir em ecrã inteiro, sem barra do
browser):

- **Android (Chrome):** abre o link → menu (⋮) → "Adicionar ao ecrã principal" / "Instalar app".
- **iPhone (Safari):** abre o link → ícone de partilha → "Adicionar ao ecrã principal".

Depois desta primeira visita com internet, a app funciona sem rede nenhuma (o service
worker guarda tudo em cache no aparelho).

---

## 3. Sobre o PIN e a cifra

O banco de perguntas nunca existe em texto simples dentro dos ficheiros publicados — está
cifrado com AES-256-GCM, e a chave de decifragem deriva do PIN (via PBKDF2, 100 000
iterações) só no momento em que alguém o introduz, dentro do próprio telemóvel. Por isso é
seguro publicar este repositório como **público** no GitHub: mesmo alguém que veja o código
fonte não consegue ler as perguntas nem as respostas sem saber o PIN.

Se quiseres mudar o PIN de `2016` para outro, não chega editar um ficheiro aqui — como o
PIN faz parte do cálculo da própria chave de cifra, é preciso **regenerar** o ficheiro
`questions.enc.js`. Os ficheiros para isso (`questions.json` em texto simples e
`build_encrypt.py`) seguem à parte, **não dentro desta pasta publicável** — exatamente para
nunca correres o risco de os publicar sem querer. Para mudar o PIN:

1. Abre `build_encrypt.py` e muda a linha `PIN = "2016"` para o novo PIN.
2. Corre `python3 build_encrypt.py` (precisa da biblioteca `cryptography`:
   `pip install cryptography`).
3. Isto gera um novo `questions.enc.js` — substitui o ficheiro antigo por este, tanto nesta
   pasta como no repositório do GitHub (novo commit).

O mesmo processo serve para **adicionar mais perguntas** no futuro: edita `questions.json`
(mantendo a mesma estrutura dos campos — `id`, `diploma`, `article`, `page`, `question`,
`options`, `correctIndex`, `explanation`), corre `build_encrypt.py` de novo, e substitui
`questions.enc.js`. Depois de publicares a nova versão no GitHub, sobe também o número da
versão em `sw.js` (a constante `CACHE_NAME`, por exemplo para `"simulador-taad-v2"`) — isso
garante que um telemóvel que já tenha a app instalada vai buscar as perguntas novas em vez
de continuar a usar as antigas guardadas em cache.

---

## 4. O que a app cobre — e com que rigor

O banco tem **95 perguntas de escolha múltipla** (4 opções cada, só uma correta — exatamente
o formato da prova real), distribuídas pelos **6 diplomas de consulta** indicados no Aviso
n.º 368/2026 e confirmados na ata do júri:

| Diploma | N.º de perguntas |
|---|---|
| DLR n.º 21/2024/M (carreira de TAAD) | 18 |
| Portaria n.º 38/2013 (condições de instalação e funcionamento do SAD) | 16 |
| Código do Trabalho (Lei n.º 7/2009, consolidada) | 16 |
| LTFP — Lei Geral do Trabalho em Funções Públicas (Lei n.º 35/2014, consolidada) | 16 |
| Orgânica do ISSM, IP-RAM (DLR n.º 34/2012/M, consolidada) | 13 |
| Estatutos do ISSM, IP-RAM (Portaria n.º 17/2017) | 16 |

Cada pergunta foi escrita a partir do texto legal lido diretamente nos 6 diplomas oficiais
(não de resumos ou de memória), e cada uma indica o artigo exato de onde vem a resposta.
Foi tudo verificado uma segunda vez, frase a frase, contra o texto da lei.

**O que isto garante:**
- As perguntas testam factos que estão mesmo nos diplomas indicados no aviso.
- O formato (4 opções, 1 correta, sem perguntas "parcialmente certas") e as regras de
  pontuação no resultado (0 a 20 valores, aprovação a partir de 9,50) seguem exatamente o
  que a ata do júri define para a Prova de Conhecimentos.

**O que isto NÃO garante — para não criar falsas expetativas:**
- O júri não publicou nem a distribuição de perguntas por diploma nem a lista de artigos
  que vai usar na prova real — essa escolha fica ao critério do júri no dia. Esta app não
  "adivinha" as 25 perguntas da prova; treina a capacidade de responder a perguntas sobre
  os mesmos diplomas, no mesmo formato.
- Os números de página indicados na revisão final (ver abaixo) referem-se à versão em PDF
  de cada diploma usada para construir esta app — se a cópia impressa ou o PDF da Ana tiver
  uma paginação diferente, a página pode não bater certo. O **artigo** indicado é que é
  sempre exato, e é a referência mais fiável para localizar o trecho.

---

## 5. Como funciona, por dentro

- **PIN (`2016`)** — sem ele, nenhum ecrã para além do PIN é sequer visível.
- **5 modos:** Real (25 perguntas, 2h) e Treino (20/15/10/5 perguntas, com o tempo
  proporcional: 96/72/48/24 min).
- **Resultados só no fim** — nunca se sabe se uma resposta está certa durante o teste.
- **Navegação livre** — dá para avançar, recuar e mudar qualquer resposta a qualquer altura
  antes de terminar, sem perder as outras respostas já dadas.
- **Revisão final** — depois de terminar, cada pergunta mostra a resposta dada, a resposta
  certa (quando errada), a explicação, e o diploma + artigo + página onde se encontra —
  para treinar a pesquisa nos documentos de consulta, tal como vai ser preciso fazer na
  prova real.
- **Tudo em português de Portugal** (pt-PT), incluindo a interface e o texto de todas as
  perguntas.

---

## 6. Testado

A app foi testada de ponta a ponta (PIN, os 5 modos, navegação, revisão, modo escuro, e
funcionamento 100% offline depois da primeira visita) com testes automatizados — tudo a
passar antes desta entrega.
