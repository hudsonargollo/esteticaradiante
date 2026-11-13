import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcryptjs';

export const SCHEMA_VERSION = 2;

let db: Database.Database;

// Electron's app.getPath('userData') when packaged; FLOSALON_DATA_DIR overrides
// for headless (web) deployments; project root fallback for dev.
function resolveDataDir(): string {
  if (process.env.FLOSALON_DATA_DIR) return process.env.FLOSALON_DATA_DIR;
  try {
    const electron: any = require('electron');
    const app = electron && typeof electron === 'object' ? electron.app : null;
    if (app && typeof app.getPath === 'function') {
      return app.isPackaged ? app.getPath('userData') : path.join(__dirname, '../');
    }
  } catch {
    // not running inside Electron
  }
  return path.join(__dirname, '../');
}

export function getDbPath(): string {
  return path.join(resolveDataDir(), 'flosaloon.db');
}

function getBackupDir(): string {
  return path.join(resolveDataDir(), 'backups');
}

function getAppVersion(): string {
  try {
    const electron: any = require('electron');
    const app = electron && typeof electron === 'object' ? electron.app : null;
    if (app && typeof app.getVersion === 'function') return app.getVersion();
  } catch {
    // headless
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function initDatabase(): void {
  const dbPath = getDbPath();
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log(`[DB] Opening database at: ${dbPath}`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = OFF');

  runMigrations();

  db.pragma('foreign_keys = ON');

  runStartupIntegrityCheck();
  autoRepairPaymentDetails();
}

export function withTxn<T>(fn: () => T): T {
  return db.transaction(fn)();
}

export function appendJsonArray(table: string, idColumn: string, idValue: any, column: string, value: any): void {
  const row = db.prepare(`SELECT ${column} AS v FROM ${table} WHERE ${idColumn} = ?`).get(idValue) as any;
  let arr: any[] = [];
  if (row && row.v) {
    try {
      const parsed = JSON.parse(row.v);
      arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      arr = [];
    }
  }
  arr.push(value);
  db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ?`).run(JSON.stringify(arr), idValue);
}

function runStartupIntegrityCheck(): void {
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    const bad = integrity.filter((r) => r.integrity_check !== 'ok');
    if (bad.length > 0) {
      console.error('[DB] ⚠ integrity_check issues:', bad.map((r) => r.integrity_check).join('; '));
    } else {
      console.log('[DB] integrity_check: ok');
    }

    const fkViolations = db.prepare('PRAGMA foreign_key_check').all() as any[];
    if (fkViolations.length > 0) {
      console.error(`[DB] ⚠ ${fkViolations.length} foreign-key violation(s):`, fkViolations.slice(0, 5));
    } else {
      console.log('[DB] foreign_key_check: clean');
    }
  } catch (err: any) {
    console.error('[DB] Startup integrity check failed:', err.message);
  }
}

function autoRepairPaymentDetails(): void {
  try {
    const rows = db.prepare(`SELECT id, payment_details, paid_amount FROM bills WHERE payment_details IS NOT NULL AND payment_details != ''`).all() as any[];
    const toFix: { id: number; value: string }[] = [];

    for (const row of rows) {
      try { JSON.parse(row.payment_details); continue; } catch {}

      const wrapped = '[' + String(row.payment_details).replace(/\}\s*,\s*\{/g, '},{') + ']';
      let parsed: any[];
      try { parsed = JSON.parse(wrapped); } catch { continue; }
      if (!Array.isArray(parsed)) continue;

      const deduped: any[] = [];
      for (const p of parsed) {
        const prev = deduped[deduped.length - 1];
        if (prev && prev.method === p.method && prev.amount === p.amount && prev.timestamp === p.timestamp) continue;
        deduped.push(p);
      }

      const dedupedSum = deduped.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const rawSum = parsed.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const chosen = Math.abs(dedupedSum - row.paid_amount) <= 0.02 ? deduped
                    : Math.abs(rawSum - row.paid_amount) <= 0.02 ? parsed : null;
      if (!chosen) continue;

      toFix.push({ id: row.id, value: JSON.stringify(chosen) });
    }

    if (toFix.length === 0) return;

    const stmt = db.prepare(`UPDATE bills SET payment_details = ?, updated_at = datetime('now') WHERE id = ?`);
    const tx = db.transaction((rows: { id: number; value: string }[]) => {
      for (const r of rows) stmt.run(r.value, r.id);
    });
    tx(toFix);
    console.log(`[DB] auto-repaired payment_details on ${toFix.length} bill(s)`);
  } catch (err: any) {
    console.error('[DB] autoRepairPaymentDetails failed:', err.message);
  }
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    console.log('[DB] Database closed');
  }
}

export async function createBackup(targetPath?: string): Promise<{ path: string; schemaVersion: number }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = targetPath || path.join(backupDir, `flosaloon-backup-${timestamp}.db`);

  await db.backup(backupPath);

  const backupDb = new Database(backupPath);
  backupDb.exec(`CREATE TABLE IF NOT EXISTS _flo_meta (key TEXT PRIMARY KEY, value TEXT)`);

  const currentVersion = getCurrentSchemaVersion();
  backupDb.prepare(`INSERT OR REPLACE INTO _flo_meta (key, value) VALUES (?, ?)`).run('schema_version', String(currentVersion));
  backupDb.prepare(`INSERT OR REPLACE INTO _flo_meta (key, value) VALUES (?, ?)`).run('backup_created_at', new Date().toISOString());
  backupDb.prepare(`INSERT OR REPLACE INTO _flo_meta (key, value) VALUES (?, ?)`).run('app_version', getAppVersion());
  backupDb.close();

  console.log(`[DB] Backup created: ${backupPath} (schema v${currentVersion})`);
  return { path: backupPath, schemaVersion: currentVersion };
}

function getColumns(dbInstance: Database.Database, tableName: string): string[] {
  try {
    const columns = dbInstance.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
    return columns.map(col => col.name);
  } catch {
    return [];
  }
}

function getTables(dbInstance: Database.Database): string[] {
  try {
    const tables = dbInstance.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
      AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_flo_meta'
    `).all() as { name: string }[];
    return tables.map(t => t.name);
  } catch {
    return [];
  }
}

export interface RestoreResult {
  success: boolean;
  mode: 'direct' | 'data_only' | 'full';
  backupSchemaVersion: number;
  currentSchemaVersion: number;
  tablesRestored: number;
  error?: string;
}

export function restoreBackup(backupPath: string, forceDirect: boolean = false): RestoreResult {
  const backupDb = new Database(backupPath, { readonly: true });
  const metaRow = backupDb.prepare(`SELECT value FROM _flo_meta WHERE key = 'schema_version'`).get() as { value: string } | undefined;
  const backupSchemaVersion = metaRow ? parseInt(metaRow.value, 10) : 0;
  backupDb.close();

  const currentDb = getDatabase();
  const currentVersion = getCurrentSchemaVersion();

  if (forceDirect || backupSchemaVersion === currentVersion) {
    closeDatabase();
    const dbPath = getDbPath();
    fs.copyFileSync(backupPath, dbPath);
    initDatabase();
    return { success: true, mode: 'direct', backupSchemaVersion, currentSchemaVersion: currentVersion, tablesRestored: getTables(currentDb).length };
  }

  return dataOnlyRestore(backupPath, backupSchemaVersion, currentVersion);
}

function dataOnlyRestore(backupPath: string, backupVersion: number, currentVersion: number): RestoreResult {
  const backupDb = new Database(backupPath, { readonly: true });
  const currentDb = getDatabase();

  const backupTables = getTables(backupDb);
  const currentTables = getTables(currentDb);
  const commonTables = backupTables.filter(t => currentTables.includes(t));
  let tablesRestored = 0;

  currentDb.exec('BEGIN IMMEDIATE');
  try {
    for (const tableName of commonTables) {
      const backupCols = getColumns(backupDb, tableName);
      const currentCols = getColumns(currentDb, tableName);
      const commonCols = backupCols.filter(c => currentCols.includes(c));
      if (commonCols.length === 0) continue;

      currentDb.exec(`DELETE FROM ${tableName}`);
      const colList = commonCols.join(', ');
      currentDb.exec(`ATTACH DATABASE '${backupPath}' AS backup; INSERT INTO ${tableName} (${colList}) SELECT ${colList} FROM backup.${tableName}`);
      tablesRestored++;
    }
    currentDb.exec('COMMIT');
    return { success: true, mode: 'data_only', backupSchemaVersion: backupVersion, currentSchemaVersion: currentVersion, tablesRestored };
  } catch (error: any) {
    currentDb.exec('ROLLBACK');
    return { success: false, mode: 'data_only', backupSchemaVersion: backupVersion, currentSchemaVersion: currentVersion, tablesRestored: 0, error: error.message };
  } finally {
    backupDb.close();
  }
}

export function getSchemaVersionFromBackup(backupPath: string): number {
  try {
    const backupDb = new Database(backupPath, { readonly: true });
    const metaRow = backupDb.prepare(`SELECT value FROM _flo_meta WHERE key = 'schema_version'`).get() as { value: string } | undefined;
    backupDb.close();
    return metaRow ? parseInt(metaRow.value, 10) : 0;
  } catch {
    return 0;
  }
}

function getCurrentSchemaVersion(): number {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as any;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

function runMigrations(): void {
  console.log('[DB] Running migrations...');

  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  const currentVersion = getCurrentSchemaVersion();
  console.log(`[DB] Schema version: ${currentVersion} → ${SCHEMA_VERSION}`);

  if (currentVersion === 0) {
    createSchema();
    seedData();
  } else if (currentVersion < 2) {
    migrateToV2();
  }

  console.log('[DB] Migrations complete');
}

function createSchema(): void {
  db.exec(`
    -- ── Master data ──────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      parent_id TEXT,
      slug TEXT,
      color TEXT,
      icon TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      cost REAL DEFAULT 0,
      sku TEXT,
      barcode TEXT,
      service_duration_minutes INTEGER DEFAULT 0,
      kind TEXT DEFAULT 'service' CHECK (kind IN ('service', 'retail')),
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      track_inventory INTEGER DEFAULT 0,
      stock_quantity REAL DEFAULT 0,
      low_stock_threshold REAL DEFAULT 5,
      tax_type TEXT DEFAULT 'none',
      tax_rate REAL DEFAULT 0,
      cb_percent REAL DEFAULT 0,
      tags TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS addon_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_required INTEGER DEFAULT 0,
      min_selection INTEGER DEFAULT 0,
      max_selection INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS addons (
      id TEXT PRIMARY KEY,
      addon_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (addon_group_id) REFERENCES addon_groups(id)
    );

    CREATE TABLE IF NOT EXISTS addon_group_product (
      product_id TEXT NOT NULL,
      addon_group_id TEXT NOT NULL,
      PRIMARY KEY (product_id, addon_group_id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      country_code TEXT DEFAULT '+91',
      address TEXT,
      loyalty_points INTEGER DEFAULT 0,
      notes TEXT,
      preferred_stylist_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Users ─────────────────────────────────────────────────────────────
    -- Roles: owner, manager, cashier, stylist

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier'
        CHECK (role IN ('owner', 'manager', 'cashier', 'stylist')),
      pin TEXT,
      category_ids TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Transactional ────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_id TEXT,
      user_id TEXT,
      stylist_id TEXT,
      special_instructions TEXT,
      status TEXT DEFAULT 'pending',
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      tax_breakdown TEXT,
      discount_amount REAL DEFAULT 0,
      discount_type TEXT,
      discount_value REAL,
      discount_reason TEXT,
      round_off REAL DEFAULT 0,
      total REAL DEFAULT 0,
      in_service_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      cancellation_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_sku TEXT,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      subtotal REAL NOT NULL,
      tax_amount REAL DEFAULT 0,
      tax_breakdown TEXT,
      tax_type TEXT,
      discount_amount REAL DEFAULT 0,
      total REAL NOT NULL,
      variant_selection TEXT,
      modifier_selection TEXT,
      addons TEXT,
      special_instructions TEXT,
      performed_by_user_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      order_id INTEGER NOT NULL,
      customer_id TEXT,
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      tax_breakdown TEXT,
      discount_amount REAL DEFAULT 0,
      discount_type TEXT,
      discount_value REAL,
      discount_reason TEXT,
      round_off REAL DEFAULT 0,
      total REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'unpaid',
      payment_details TEXT,
      paid_at TEXT,
      printed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS loyalty_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id TEXT NOT NULL,
      bill_id INTEGER,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Appointments (public booking + POS agenda) ───────────────────────

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      appointment_number TEXT UNIQUE NOT NULL,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      stylist_id TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      total_price REAL DEFAULT 0,
      status TEXT DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'confirmed', 'checked-in', 'completed', 'cancelled', 'no-show')),
      source TEXT DEFAULT 'online',
      notes TEXT,
      cancellation_reason TEXT,
      order_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS appointment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
    );

    -- ── Config ────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      connection_type TEXT NOT NULL CHECK (connection_type IN ('network', 'usb', 'webusb')),
      ip_address TEXT,
      port INTEGER DEFAULT 9100,
      usb_device_path TEXT,
      is_default INTEGER DEFAULT 0,
      paper_width TEXT DEFAULT '80mm',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Indexes ───────────────────────────────────────────────────────────

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active);
    CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_user       ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_bills_order       ON bills(order_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
    CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_appointment_items_appt ON appointment_items(appointment_id);
  `);
}

function seedData(): void {
  const insert = (key: string, value: string) =>
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);

  insert('schema_version',       String(SCHEMA_VERSION));
  insert('business_name',        'Estética Radiante');
  insert('business_tagline',     'Estética & Bem-estar');
  insert('business_type',        'salon');
  insert('country',              'BR');
  insert('currency',             'BRL');
  insert('currency_symbol',      'R$');
  insert('timezone',             'America/Sao_Paulo');
  insert('address',              '');
  insert('phone',                '+55 31 99587-2149');
  insert('whatsapp',             '5531995872149');
  insert('instagram',            'clinicaeliscarvalho');
  insert('email',                '');
  insert('tax_registered',       'false');
  insert('gstin',                '');
  insert('state_code',           '');
  insert('tax_scheme',           'regular');
  insert('loyalty_expiry_days',  '365');
  insert('cloud_server_url',     '');
  insert('cloud_connected',      'false');
  seedBookingSettings();

  const hashedPassword = bcrypt.hashSync('estetica123', 10);
  db.prepare(`INSERT OR IGNORE INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)`).run('user-1', 'Elis Carvalho', 'admin@estetica.com', hashedPassword, 'owner');

  const stylistPassword = bcrypt.hashSync('stylist123', 10);
  db.prepare(`INSERT OR IGNORE INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)`).run('user-2', 'Elis Carvalho', 'stylist@flosaloon.local', stylistPassword, 'stylist');

  db.prepare(`INSERT OR IGNORE INTO printers (id, name, connection_type, paper_width, is_default) VALUES (?, ?, ?, ?, ?)`).run('printer-1', 'Thermal Printer', 'usb', '80mm', 1);

  seedEsteticaRadianteCatalog();

  console.log('[DB] Seed data loaded');
}

function seedBookingSettings(): void {
  const insert = (key: string, value: string) =>
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);

  insert('loyalty_enabled',        'true');
  insert('loyalty_threshold',      '10');
  insert('loyalty_reward',         'Massagem relaxante grátis');
  insert('booking_enabled',        'true');
  insert('booking_open_time',      '09:00');
  insert('booking_close_time',     '19:00');
  insert('booking_slot_interval',  '30');
  insert('booking_open_days',      '1,2,3,4,5,6');
  insert('booking_advance_days',   '45');
  insert('booking_lead_minutes',   '120');
  insert('booking_stylist_name',   'Elis Carvalho');
  insert('booking_stylist_role',   'Esteticista');
  insert('booking_policies', JSON.stringify([
    'Atendimento no estúdio, com horário marcado.',
    'Chegue com 10 minutos de antecedência.',
    'Cancelamentos com até 24h de antecedência.',
    'Pagamento em Pix, dinheiro ou cartão.',
  ]));
}

function seedEsteticaRadianteCatalog(): void {
  const cats = [
    ['er-cat-destaques', 'Destaques',       '#C9A227', '✦', 1, 'Protocolos e combos especiais'],
    ['er-cat-corpo',     'Corpo & Redução', '#7C4D8C', '❋', 2, 'Tratamentos corporais e modelagem'],
    ['er-cat-facial',    'Facial & Pele',   '#C9A227', '✧', 3, 'Cuidados com a pele e rejuvenescimento'],
    ['er-cat-depilacao', 'Depilação',       '#B76E79', '❀', 4, 'Depilação a laser, cera e sobrancelhas'],
    ['er-cat-bemestar',  'Bem-estar',       '#8B6BAE', '✿', 5, 'Massagens e terapias relaxantes'],
  ];
  for (const [id, name, color, icon, sort, description] of cats) {
    db.prepare(`
      INSERT OR IGNORE INTO categories (id, name, description, color, icon, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, name, description, color, icon, sort);
  }

  const products: [string, string, string, string, number, number, number][] = [
    ['er-prod-01', 'er-cat-destaques', 'Lipo Enzimática · 7 sessões',
      'Protocolo corporal com enzimas para reduzir medidas e melhorar a textura da pele. Pacote de 7 sessões.',
      700, 60, 1],
    ['er-prod-02', 'er-cat-destaques', 'Combo 5 Massagens + 5 Carboxiterapia',
      'Cinco sessões de massagem modeladora combinadas com cinco sessões de carboxiterapia para potencializar os resultados.',
      400, 60, 2],
    ['er-prod-03', 'er-cat-destaques', 'Bambu Terapia · 10 sessões',
      'Massagem manual com bambus aquecidos, ideal para relaxar, ativar a circulação e modelar o corpo.',
      550, 60, 3],
    ['er-prod-04', 'er-cat-destaques', 'Combo 10 Pump Up + 10 Corrente Russa',
      'Dez sessões de Pump Up e dez de corrente russa para tonificar e definir a musculatura.',
      320, 50, 4],
    ['er-prod-05', 'er-cat-corpo', 'Carboxiterapia',
      'Aplicação de gás carbônico para melhorar a circulação, reduzir a flacidez e auxiliar no tratamento de celulite.',
      60, 40, 1],
    ['er-prod-06', 'er-cat-corpo', 'Massagem Redutora',
      'Massagem com manobras específicas para redução de medidas, modelagem e estímulo da circulação.',
      90, 60, 2],
    ['er-prod-07', 'er-cat-corpo', 'Massagem Modeladora',
      'Técnica intensa de modelagem corporal que ajuda a definir contornos e tonificar os tecidos.',
      90, 60, 3],
    ['er-prod-08', 'er-cat-corpo', 'Drenagem Pós-Operatório',
      'Drenagem linfática cuidadosa para reduzir edemas e acelerar a recuperação pós-cirúrgica.',
      100, 60, 4],
    ['er-prod-09', 'er-cat-corpo', 'Corrente Russa',
      'Eletroestimulação muscular para tonificação, fortalecimento e definição do corpo.',
      70, 40, 5],
    ['er-prod-10', 'er-cat-corpo', 'Pump Up',
      'Eletroestimulação de alta intensidade para hipertrofia e definição muscular.',
      70, 40, 6],
    ['er-prod-11', 'er-cat-corpo', 'Vibromanta',
      'Massagem com vibração e calor para relaxamento muscular, circulação e redução de tensões.',
      80, 50, 7],
    ['er-prod-12', 'er-cat-corpo', 'Radiofrequência Corporal',
      'Estímulo de colágeno com radiofrequência para firmeza, celulite e flacidez corporal.',
      160, 60, 8],
    ['er-prod-13', 'er-cat-corpo', 'Tratamento para Estrias e Flacidez',
      'Protocolo combinado para melhorar a aparência de estrias, textura e firmeza da pele.',
      180, 60, 9],
    ['er-prod-14', 'er-cat-facial', 'Limpeza de Pele',
      'Higienização profunda com extração, esfoliação e hidratação para uma pele renovada.',
      120, 60, 1],
    ['er-prod-15', 'er-cat-facial', 'Microagulhamento',
      'Indução de colágeno com microagulhas para melhorar textura, cicatrizes e firmeza da pele.',
      180, 60, 2],
    ['er-prod-16', 'er-cat-facial', 'Radiofrequência Facial',
      'Firmeza e rejuvenescimento facial com estímulo de colágeno e melhora do contorno.',
      140, 50, 3],
    ['er-prod-17', 'er-cat-depilacao', 'Depilação a Laser',
      'Sessão de depilação a laser com tecnologia segura para reduzir os pelos de forma duradoura.',
      100, 30, 1],
    ['er-prod-18', 'er-cat-depilacao', 'Depilação na Cera',
      'Depilação tradicional com cera, rápida e cuidadosa, para uma pele lisa por mais tempo.',
      40, 30, 2],
    ['er-prod-19', 'er-cat-depilacao', 'Design de Sobrancelhas',
      'Design personalizado que valoriza o formato do rosto e realça o olhar.',
      50, 30, 3],
    ['er-prod-20', 'er-cat-bemestar', 'Massagem Relaxante',
      'Massagem corporal suave para aliviar o estresse, relaxar a musculatura e renovar a energia.',
      120, 60, 1],
    ['er-prod-21', 'er-cat-bemestar', 'Ventosas',
      'Terapia com ventosas para melhorar a circulação, aliviar tensões e auxiliar na recuperação muscular.',
      90, 50, 2],
    ['er-prod-22', 'er-cat-bemestar', 'Pedras Quentes',
      'Massagem com pedras aquecidas que proporciona relaxamento profundo e alívio de tensões.',
      130, 60, 3],
  ];

  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO products
      (id, category_id, name, description, price, service_duration_minutes, kind, sort_order, is_active, tax_type, tax_rate)
    VALUES (?, ?, ?, ?, ?, ?, 'service', ?, 1, 'none', 0)
  `);
  for (const [id, catId, name, description, price, duration, sort] of products) {
    insertProduct.run(id, catId, name, description, price, duration, sort);
  }
}

function migrateToV2(): void {
  console.log('[DB] Migrating schema v1 → v2 (appointments)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      appointment_number TEXT UNIQUE NOT NULL,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      stylist_id TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      total_price REAL DEFAULT 0,
      status TEXT DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'confirmed', 'checked-in', 'completed', 'cancelled', 'no-show')),
      source TEXT DEFAULT 'online',
      notes TEXT,
      cancellation_reason TEXT,
      order_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
    CREATE TABLE IF NOT EXISTS appointment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
    CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_appointment_items_appt ON appointment_items(appointment_id);
  `);

  seedBookingSettings();

  const businessName = (db.prepare("SELECT value FROM settings WHERE key = 'business_name'").get() as any)?.value;
  if (!businessName || businessName === 'My Salon') {
    const update = (key: string, value: string) =>
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, now());
    update('business_name', 'Estética Radiante');
    update('business_tagline', 'Estética & Bem-estar');
    update('country', 'BR');
    update('currency', 'BRL');
    update('currency_symbol', 'R$');
    update('timezone', 'America/Sao_Paulo');
    update('phone', '+55 31 99587-2149');
    update('whatsapp', '5531995872149');
    update('instagram', 'clinicaeliscarvalho');
    seedEsteticaRadianteCatalog();
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('schema_version', ?, ?)").run(String(SCHEMA_VERSION), now());
}

export function generateOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = db.prepare(
    "SELECT COUNT(*) + 1 as next FROM orders WHERE date(created_at) = date('now')"
  ).get() as { next: number };
  return `TKT-${date}-${String(result.next).padStart(4, '0')}`;
}

export function generateBillNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = db.prepare(
    "SELECT COUNT(*) + 1 as next FROM bills WHERE date(created_at) = date('now')"
  ).get() as { next: number };
  return `INV-${date}-${String(result.next).padStart(4, '0')}`;
}

export function generateAppointmentNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = db.prepare(
    "SELECT COUNT(*) + 1 as next FROM appointments WHERE date(created_at) = date('now')"
  ).get() as { next: number };
  return `AGD-${date}-${String(result.next).padStart(4, '0')}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function parseItemJson(item: any): any {
  const tryParse = (val: any) => {
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch { return val; }
  };
  return {
    ...item,
    addons: tryParse(item.addons),
    variant_selection: tryParse(item.variant_selection),
    modifier_selection: tryParse(item.modifier_selection),
    tax_breakdown: tryParse(item.tax_breakdown),
  };
}
