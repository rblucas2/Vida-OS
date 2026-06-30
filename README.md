# Vida OS — Life OS · Finanças · Nutrição

Três apps pessoais minimalistas que funcionam como **app no telemóvel** (PWA instalável) e no **PC** (browser). Tema automático **claro/escuro** (segue o sistema), **offline**, dados **privados no dispositivo** e **sincronização gratuita** opcional entre dispositivos.

Tudo é HTML/CSS/JS puro — **sem build, sem dependências, sem servidor próprio**.

## Estrutura

```
index.html              Lançador (escolhe a app)
shared/                 Código partilhado (design, dados, sync, regras)
  base.css  store.js  sync.js  ui.js  domain.js  app.js
lifeos/                 App 1 — Dashboard pessoal (Life OS)
finance/                App 2 — Finanças pessoais
nutrition/              App 3 — Nutrição e macros
sw.js                   Service worker (offline + instalável)
icons/                  Ícones das apps
```

As três apps partilham a mesma origem, por isso o **Life OS lê automaticamente** os dados de Nutrição (kcal/proteína em falta) e Finanças (dinheiro livre), e a Nutrição ajusta os alvos quando há treino (hábito "Ginásio" do Life OS).

## Como pôr online (grátis) — GitHub Pages

1. Cria um repositório em https://github.com/new (ex.: `vida-os`).
2. No terminal, dentro desta pasta:
   ```bash
   git remote add origin https://github.com/<o-teu-utilizador>/vida-os.git
   git branch -M main
   git push -u origin main
   ```
3. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → main / (root) → Save**.
4. Em ~1 min fica em `https://<o-teu-utilizador>.github.io/vida-os/`.

> Alternativa ainda mais simples: arrasta a pasta para https://app.netlify.com/drop.

## Instalar no telemóvel / PC

Abre o link e:
- **Android/Chrome:** menu ⋮ → "Adicionar ao ecrã principal" / "Instalar app".
- **iPhone/Safari:** botão Partilhar → "Adicionar ao ecrã principal".
- **PC/Chrome/Edge:** ícone de instalar na barra de endereço.

Cada app instala-se com o seu próprio ícone.

## Sincronização telemóvel ↔ PC (grátis, opcional)

Por defeito cada dispositivo guarda os seus dados. Para os teres iguais em todo o lado, sem custos:

1. Cria conta grátis em https://supabase.com (sem cartão) e cria um projeto.
2. **SQL Editor** → cola e corre:
   ```sql
   create table if not exists app_state (
     app text not null,
     sync_code text not null,
     data jsonb not null,
     updated_at timestamptz not null default now(),
     primary key (app, sync_code)
   );
   alter table app_state enable row level security;
   create policy "acesso por codigo" on app_state
     for all using (true) with check (true);
   ```
3. **Project Settings → API**: copia o *Project URL* e a chave *anon public*.
4. Em qualquer app → **Definições** (engrenagem) → cola URL, chave e um *código de sincronização* à tua escolha.
5. Usa o **mesmo código** no telemóvel e no PC. Pronto — sincroniza sozinho.

> Sem sincronização configurada, há sempre **Exportar/Importar** cópia (.json) nas Definições.

## Notas técnicas

- **Nutrição:** Mifflin-St Jeor (TMB/GETD), scanner via câmara (html5-qrcode + Open Food Facts), Macro Solver, refeições pré-guardadas, ciclismo de nutrientes em dias de treino.
- **Finanças:** importação CSV do banco com mapeamento de colunas e categorização automática, orçamentos com alertas, dinheiro livre, dashboard (donut, top despesas, essenciais vs. estilo de vida), net worth com histórico.
- **Life OS:** Top 3, time-blocking, brain dump, hábitos com streaks, pilares com objetivos, revisão semanal e widgets de integração.
