const express = require('express')
const router = express.Router()
const db = require('../db')

router.get('/', (req,res)=>{
  const rows = db.prepare('SELECT * FROM analytics ORDER BY id DESC LIMIT 200').all()
  res.json(rows)
})

router.post('/', (req,res)=>{
  const { key, value } = req.body
  const stmt = db.prepare('INSERT INTO analytics (ts,key,value) VALUES (datetime("now"),?,?)')
  const info = stmt.run(key,String(value))
  res.json({ok:true,id:info.lastInsertRowid})
})

module.exports = router
