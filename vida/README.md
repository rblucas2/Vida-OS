# Vida

App pessoal (PWA) com a parte "espiritual" da Vida OS e a Tese: o teu dia, hábitos, objetivos, diário, agenda (Google Calendar) e tese. Privada, offline e sincronizada entre telemóvel e PC.

Online em `https://rblucas2.github.io/Vida-OS/vida/` — independente do resto da Vida OS (pasta própria, dados próprios com prefixo `vida:`). Pode ser movida para um repositório só dela copiando esta pasta.

## Separadores
- **Hoje** — saudação, check-in (humor/energia/destaque), Top 3 e tarefas, hábitos do dia, agenda do Google Calendar, próximos passos da tese e objetivos em foco.
- **Diário** — humor, energia, destaque, gratidão, texto livre com ditado por voz, gráfico de humor e pesquisa.
- **Hábitos** — diários ou X vezes/semana, sequências, % de cumprimento, últimos 7 dias e mapa de calor.
- **Objetivos** — pilares de vida com objetivos (prazo, meta numérica, +1 rápido).
- **Agenda** — semana do Google Calendar, criar/apagar eventos; tarefas podem ir para o calendário.
- **Tese** — Resumo (progresso real vs. ideal), Semana, Calendário, Quadro (kanban) e Trabalhos das cadeiras; importa eventos do Google Calendar.
- **Revisão** — revisão semanal com estatísticas automáticas da semana.
- Separadores reordenáveis/renomeáveis e separadores de notas próprios (ícone ao lado dos separadores).

## Dados
- Na primeira abertura importa sozinha o Espiritual (`vidaos:los`), a Tese (`vidaos:tese`) e a configuração do Google Calendar da Vida OS neste browser.
- Sincronização: Definições → login Supabase (o mesmo projeto e utilizador das Finanças). Tabela `user_state` com Row Level Security — o SQL está nas Definições.
