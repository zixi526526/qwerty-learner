const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true })
}

function getDataRoot(env = process.env) {
  return path.resolve(env.QL_DATA_DIR || path.join(process.cwd(), '.data'))
}

function getDatabasePath(env = process.env) {
  return env.QL_DB_PATH ? path.resolve(env.QL_DB_PATH) : path.join(getDataRoot(env), 'qwerty-family.sqlite')
}

function getMigrationsPath() {
  return path.join(process.cwd(), 'server', 'migrations')
}

function openDatabase(env = process.env) {
  const databasePath = getDatabasePath(env)
  ensureDir(path.dirname(databasePath))
  const db = new Database(databasePath)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  runMigrations(db, getMigrationsPath())
  return db
}

function runMigrations(db, migrationsPath) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )`,
  )

  const files = fs
    .readdirSync(migrationsPath)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  const alreadyApplied = new Set(db.prepare('SELECT filename FROM schema_migrations').all().map((row) => row.filename))

  for (const file of files) {
    if (alreadyApplied.has(file)) continue

    const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf8')
    const now = new Date().toISOString()
    const transaction = db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)').run(file, now)
    })
    transaction()
  }
}

module.exports = {
  getDataRoot,
  getDatabasePath,
  openDatabase,
}
