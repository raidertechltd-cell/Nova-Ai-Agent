import { MemoryRecord } from '../types'
import { computeEmbedding } from '../utils/embeddings'
import { Client } from 'pg'

export interface MemoryProvider {
  save(record: MemoryRecord): Promise<void>
  query(text: string, topK?: number): Promise<MemoryRecord[]>
}

// Simple in-memory provider (useful for local testing)
export class InMemoryProvider implements MemoryProvider {
  private store: MemoryRecord[] = []

  async save(record: MemoryRecord) {
    if (!record.embedding) {
      try {
        record.embedding = await computeEmbedding(record.text)
      } catch {
        // fallback: leave undefined
      }
    }
    this.store.push(record)
  }

  async query(text: string, topK = 5) {
    // naive text-match ordering; replace with real embedding search
    return this.store
      .filter((r) => r.text.includes(text) || JSON.stringify(r.metadata || {}).includes(text))
      .slice(0, topK)
  }
}

// Postgres-backed vector store implementation (requires pg + pgvector)
export class PostgresVectorProvider implements MemoryProvider {
  private client: Client

  constructor(private connectionString: string, private table = 'memory') {
    this.client = new Client({ connectionString })
    this.client.connect().catch((e: any) => {
      console.warn('PostgresVectorProvider connection failed:', e.message)
    })
  }

  async save(record: MemoryRecord) {
    // compute embedding if missing
    if (!record.embedding) {
      record.embedding = await computeEmbedding(record.text)
    }

    // Upsert into a table with columns: id TEXT PRIMARY KEY, text TEXT, embedding VECTOR, metadata JSONB, created_at TIMESTAMP
    const sql = `INSERT INTO ${this.table} (id, text, embedding, metadata, created_at) VALUES ($1,$2,$3,$4,$5)`
    try {
      await this.client.query(sql, [record.id, record.text, record.embedding, record.metadata || {}, record.createdAt])
    } catch (e: any) {
      // In a production implementation, handle conflicts and retries.
      console.error('PostgresVectorProvider.save error', e.message)
      throw e
    }
  }

  async query(text: string, topK = 5) {
    // Compute embedding for the query and run a vector similarity search.
    const embedding = await computeEmbedding(text)
    // This SQL assumes pgvector installed and `embedding` column of type vector
    const sql = `SELECT id, text, metadata, created_at FROM ${this.table} ORDER BY embedding <-> $1 LIMIT $2`
    try {
      const res = await this.client.query(sql, [embedding, topK])
      return res.rows.map((r: any) => ({ id: r.id, text: r.text, metadata: r.metadata, createdAt: r.created_at }))
    } catch (e: any) {
      console.error('PostgresVectorProvider.query error', e.message)
      throw e
    }
  }
}
