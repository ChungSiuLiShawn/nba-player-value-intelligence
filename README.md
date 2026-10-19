# NBA Player Value Intelligence

A website that tracks the market value of 169 NBA players and updates itself every day.

## What it does

- **Player Value Index (PVI, 0-100)** — one number per player, built from three tracks: news sentiment momentum (35%), on-court performance (Game Score + True Shooting %), and physical profile (height, wingspan, vertical, strength)
- **News sentiment engine** — reads NBA news every hour from ESPN, CBS Sports and Shams Charania, plus Chinese sources (Hupu, Zhibo8) twice a day; each story is classified as bullish or bearish
- **Cross-language dedup** — if the same story is reported in English and Chinese, it only counts once
- **7-day AI forecast** — predicts where each player's index is heading, with a rise probability and reasons
- **Real data** — real season stats from ESPN, real player headshots, auto-corrected team assignments
- **Dashboards** — radar charts, index history with event markers, leaderboards, and per-player reports

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS · Recharts |
| Backend | Hono · tRPC · Drizzle ORM |
| Database | MySQL |
| Pipelines | node-cron · rss-parser · text embeddings (for dedup) |
| Deploy | Docker (single container: frontend + API + scheduled jobs) |

## Getting started

```bash
# Install dependencies
npm install

# Set your database connection
# DATABASE_URL=mysql://user:pass@host:3306/dbname

# Run database migrations
npm run db:generate
npm run db:migrate

# Development mode
npm run dev

# Production build + start
npm run build
npm start          # http://localhost:3000
```

## Docker

```bash
docker build -t nba-value-intel .
docker run -p 3000:3000 -e DATABASE_URL="mysql://..." nba-value-intel
```

## Auto-update schedule

Once the server is running, everything updates on its own. If the server restarts, it automatically catches up on anything it missed.

| Job | When | What |
|---|---|---|
| English news | Every hour | ESPN / CBS Sports / Shams |
| Chinese news | 07:20 & 19:20 daily | Hupu / Zhibo8 |
| Season stats | 07:30 daily | Latest per-game stats from ESPN |
| Sentiment + index | 08:00 daily | Recalculate sentiment, move the index, save forecasts |
| Anchor check | 09:00 Sundays | Correlation of PVI vs NBA 2K ratings |

Source health is shown live on the Pipeline page. If one source breaks, the others keep working.

## Project layout

```
├── api/                  # Backend
│   ├── collectors/       # News collectors + classifier + event clustering
│   ├── engine/m0.ts      # Index evolution + forecast + backtest
│   ├── queries/          # Database queries
│   └── router.ts         # tRPC routes
├── db/
│   ├── schema.ts         # Table definitions
│   ├── migrations/       # SQL migrations
│   └── scripts/          # One-off sync/fix scripts
├── src/                  # Frontend
│   ├── pages/            # Home / Stats / Rankings / PlayerDetail / Admin
│   ├── components/       # Avatar / NewsCard / RankCard etc.
│   └── lib/              # API hooks + types
└── Dockerfile
```

## How the numbers work

- **Game Score (Hollinger)** — `PTS + 0.4FGM − 0.7FGA − 0.4(FTA−FTM) + 0.7OREB + 0.3DREB + STL + 0.7AST + 0.7BLK − 0.4PF − TOV`, converted to a league percentile
- **TS%** — taken directly from ESPN
- **Sentiment weight** — source tier (top sources ×1.0, mainstream ×0.6) × trust (rumors ×0.4) × time decay (half-life 2 days); the same event from multiple sources counts once
- **Physical score** — height and weight are real measurements; wingspan, vertical and strength are estimated from position-based norms

## Compliance

- Low-frequency, read-only collection with a polite user agent; no anti-bot bypassing
- The index is for research and reference only — not investment advice
