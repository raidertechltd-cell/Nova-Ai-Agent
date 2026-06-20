const crypto = require('crypto')

class TaskQueue {
  constructor(maxConcurrent = 5) {
    this.tasks = new Map()
    this.maxConcurrent = maxConcurrent
    this.running = 0
    this.pending = []
    this.listeners = new Map()
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event).push(fn)
  }

  emit(event, data) {
    for (const fn of this.listeners.get(event) || []) {
      try { fn(data) } catch (e) { console.error('[task-queue] listener error:', e.message) }
    }
  }

  enqueue(type, executor) {
    const id = crypto.randomBytes(4).toString('hex')
    const task = { id, type, status: 'pending', result: null, error: null, createdAt: Date.now(), completedAt: null }
    this.tasks.set(id, task)

    const run = async () => {
      task.status = 'running'
      this.running++
      try {
        task.result = await executor(task)
        task.status = 'done'
        task.completedAt = Date.now()
        this.emit('task:done', task)
      } catch (err) {
        task.error = err.message
        task.status = 'failed'
        task.completedAt = Date.now()
        this.emit('task:failed', task)
      }
      this.running--
      this.flush()
    }

    if (this.running < this.maxConcurrent) {
      run()
    } else {
      this.pending.push(run)
    }

    return id
  }

  flush() {
    while (this.pending.length > 0 && this.running < this.maxConcurrent) {
      const next = this.pending.shift()
      next()
    }
  }

  getStatus(id) {
    const t = this.tasks.get(id)
    if (!t) return null
    return { id: t.id, type: t.type, status: t.status, result: t.result, error: t.error, createdAt: t.createdAt, completedAt: t.completedAt }
  }

  listActive() {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'running' || t.status === 'pending')
      .map(t => ({ id: t.id, type: t.type, status: t.status }))
  }

  listRecent(limit = 20) {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(t => ({ id: t.id, type: t.type, status: t.status, createdAt: t.createdAt, completedAt: t.completedAt }))
  }

  cancel(id) {
    const t = this.tasks.get(id)
    if (!t || t.status === 'done' || t.status === 'failed') return false
    t.status = 'cancelled'
    t.completedAt = Date.now()
    return true
  }

  cancelAll() {
    for (const [id, t] of this.tasks) {
      if (t.status === 'running' || t.status === 'pending') {
        t.status = 'cancelled'
        t.completedAt = Date.now()
      }
    }
    this.pending = []
  }
}

module.exports = new TaskQueue()
