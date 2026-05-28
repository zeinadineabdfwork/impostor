# 🎮 ImpostorDraw

Jogo multiplayer em tempo real de desenho e dedução social — inspirado no Gartic, com mecânica de impostor e matchmaking Battle Royal.

## Stack
- **Servidor**: Node.js + Express + Socket.io
- **Base de dados**: PostgreSQL via Supabase
- **Frontend**: HTML5 + CSS3 + Canvas API (Vanilla JS)
- **Hospedagem**: Render.com (servidor) + Supabase (DB)

## Estrutura
```
impostordraw/
├── server/          ← Node.js backend
│   ├── src/
│   │   ├── config/       ← DB + Supabase
│   │   ├── controllers/  ← Auth + User
│   │   ├── middlewares/  ← JWT + Upload + Errors
│   │   ├── routes/       ← HTTP routes
│   │   ├── sockets/      ← Socket.io handlers
│   │   └── utils/        ← Lógica de jogo + sanitize
│   ├── database/
│   │   └── schema.sql    ← Executar no Supabase
│   ├── .env.example
│   └── package.json
└── client/
    └── public/
        ├── index.html
        ├── css/main.css
        ├── js/
        │   ├── app.js           ← Roteador UI
        │   ├── auth.js          ← Sessão/API auth
        │   ├── canvas.js        ← Motor de desenho
        │   └── socket-client.js ← Barramento eventos
        └── assets/
            ├── avatars/         ← Avatares padrão + uploads
            └── sounds/          ← Efeitos sonoros
```

## Setup Rápido

### 1. Base de dados (Supabase)
1. Cria projecto em https://supabase.com
2. Vai a **SQL Editor** e executa `server/database/schema.sql`
3. Copia as credenciais para o `.env`

### 2. Servidor local
```bash
cd server
cp .env.example .env
# Preenche as variáveis no .env
npm install
npm run dev
```

### 3. Deploy no Render
1. Cria **Web Service** apontando para a pasta `server/`
2. Build command: `npm install`
3. Start command: `npm start`
4. Adiciona as variáveis de ambiente do `.env.example`

## Regras do Jogo
- 3–8 jogadores por sala
- Um jogador recebe um tema **diferente** (o impostor)
- Cada jogador tem **6 traços** para desenhar
- Após cada rodada → **votação** (25 segundos)
- Se o impostor for descoberto → inocentes ganham
- Se as 6 rodadas passarem sem descobrir → impostor ganha

## Variáveis de Ambiente
Ver `.env.example` para lista completa.
