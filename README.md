# 🏥 My Clinica CRM - Ecossistema Unificado

Bem-vindo à documentação do **My Clinica**, um CRM especializado para clínicas odontológicas, projetado para ser multi-tenant, escalável e totalmente integrado com Google Calendar e n8n.

## 🏗️ Arquitetura do Sistema

O ecossistema é composto por três pilares principais:

1.  **Frontend (Vanilla JS/HTML/CSS):** Interface rápida, responsiva e premium. Utiliza FullCalendar para a agenda e se comunica diretamente com o Supabase e n8n.
2.  **Backend (Supabase):** Gerenciamento de banco de dados (PostgreSQL), Autenticação de usuários, Row Level Security (RLS) para isolamento de dados entre clínicas e Storage.
3.  **Automação (n8n):** O "cérebro" do sistema. Gerencia notificações via WhatsApp, sincronização de leads, configurações centralizadas e atua como proxy para operações avançadas do Google Calendar.

---

## 📅 Integração Google Calendar

A agenda do site é o coração da operação. Ela funciona de duas formas complementares:

### 1. Visualização em Tempo Real (Site Frontend)
- **Tecnologia:** FullCalendar + Google Calendar Plugin.
- **Segurança:** Utiliza uma `GOOGLE_API_KEY` (configurada no `config.js`) para ler calendários que estão marcados como **públicos**.
- **Funcionalidade:** Exibe os horários de todas as dentistas em uma única visão, com cores personalizadas para cada profissional definidas no banco de dados.

### 2. Edição e Criação (n8n Proxy)
- **Objetivo:** Permitir criar e editar agendamentos diretamente pelo site sem sair do CRM.
- **Fluxo:** O site envia uma requisição para um **Webhook no n8n**. O n8n, usando credenciais OAuth2 (privadas e seguras), realiza a escrita no Google Calendar e retorna a confirmação para o site.

---

## 🤖 Workflows n8n (Automações)

O n8n gerencia diversos processos críticos:

-   **CONFIG - CLÍNICA UNIFICADA:** Workflow centralizador que distribui tokens de API, números de WhatsApp e regras de negócio para todos os outros fluxos, facilitando a manutenção.
-   **Encaminhamento de Leads:** Recebe leads de formulários/landing pages, cadastra no Supabase e notifica a equipe via WhatsApp.
-   **Notificações de Agendamento:** Envia lembretes automáticos para pacientes e dentistas.

---

## ⚙️ Configuração (config.js)

O arquivo `config.js` no frontend centraliza as chaves de conexão:

```javascript
const CONFIG = {
    // Supabase
    SUPABASE_URL: '...',
    SUPABASE_ANON_KEY: '...',
    
    // Google Integration
    GOOGLE_API_KEY: 'AIzaSyD...', // Chave de API para leitura do calendário
    
    // n8n Endpoints
    N8N_WEBHOOK_URL: '...', // URL base para disparar automações
};
```

---

## 🚀 Como fazer o Deploy

O projeto está configurado para deploy automático via **EasyPanel** e **GitHub**.

1.  Faça suas alterações localmente.
2.  Commit e Push para o branch principal:
    ```bash
    git add .
    git commit -m "feat: descrição da melhoria"
    git push origin main
    ```
3.  O EasyPanel detectará o push e atualizará o site em `myclinica.dimitresouza.com`.

---

## 🛠️ Próximos Passos

- [ ] Configurar Google API Key no `config.js`.



---
**Desenvolvido por Antigravity AI para Clínicas Unificadas.**
