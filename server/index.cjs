const { buildApp } = require('./app.cjs')

async function start() {
  const app = buildApp({ logger: process.env.NODE_ENV !== 'test' })
  const port = Number(process.env.PORT || 4173)
  const host = process.env.HOST || '127.0.0.1'

  try {
    await app.listen({ port, host })
    console.log(`Qwerty Family server listening on http://${host}:${port}`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

if (require.main === module) {
  start()
}

module.exports = { start }
