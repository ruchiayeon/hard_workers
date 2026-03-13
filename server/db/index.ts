import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import os from 'os'

let db: Database.Database

export function getDb(): Database.Database {
  if (db) return db

  const dataDir = path.join(os.homedir(), '.crew-builder')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const dbPath = path.join(dataDir, 'crew-builder.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  migrate(db)
  return db
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      portrait_file TEXT NOT NULL DEFAULT 'default.png',
      system_prompt TEXT NOT NULL DEFAULT '',
      llm_config TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      leader_id TEXT NOT NULL,
      member_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `)

  // Add workspace column to teams
  try {
    db.exec(`ALTER TABLE teams ADD COLUMN workspace TEXT`)
  } catch { /* column already exists */ }

  // Add default_mode and relations columns to teams
  try {
    db.exec(`ALTER TABLE teams ADD COLUMN default_mode TEXT NOT NULL DEFAULT 'solo'`)
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE teams ADD COLUMN relations TEXT NOT NULL DEFAULT '[]'`)
  } catch { /* column already exists */ }

  // Migrate claude-cookie → claude-oauth
  db.exec(`
    UPDATE agents SET llm_config = REPLACE(llm_config, '"claude-cookie"', '"claude-oauth"')
    WHERE llm_config LIKE '%claude-cookie%';
  `)
}
