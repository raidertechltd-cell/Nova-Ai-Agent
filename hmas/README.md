HMAS scaffold for Nova

This folder contains a TypeScript skeleton implementing a Hierarchical Multi-Agent System (HMAS) foundation.

See `src/` for the scaffolded modules: memory provider, supervisor and worker agents, LangGraph graph, and the autonomous loop.

How to run (after installing deps):

```bash
cd hmas
npm install
npm run dev
```

Environment variables:
- `OPENAI_API_KEY` — optional, used for embeddings and planner/evaluation LLM calls.
- `POSTGRES_URL` — optional, `PostgresVectorProvider` connection string (requires `pgvector` installed).

Notes:
- `PostgresVectorProvider` requires a `memory` table with a `vector` column and `pgvector` extension. The implementation is a skeleton and may need SQL adjustments for your Postgres setup.

