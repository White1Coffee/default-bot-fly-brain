#!/usr/bin/env node

const path = require('path')
const { mergeKnowledgeFolders } = require('../src/knowledge-merge')

const [left, right, output] = process.argv.slice(2)
if (!left || !right || !output) {
  console.error('Usage: node tools/merge-knowledge.js <knowledge-1> <knowledge-2> <output-directory>')
  process.exit(1)
}

try {
  const results = mergeKnowledgeFolders(left, right, output)
  console.log(`Merged ${results.length} knowledge files into ${path.resolve(output)}.`)
  for (const result of results) console.log(`- ${result.name}`)
} catch (err) {
  console.error(`Knowledge merge failed: ${err.message}`)
  process.exit(1)
}
