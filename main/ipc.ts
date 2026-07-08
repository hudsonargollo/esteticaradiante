import { ipcMain, dialog, app } from 'electron';
import * as path from 'path';
import { getDatabase, createBackup, restoreBackup, now, getDbPath, SCHEMA_VERSION, getSchemaVersionFromBackup } from './db';
import { getLocalIP } from './server';

export function registerIpcHandlers(): void {
  ipcMain.handle('backup-database', async () => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const result = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('downloads'), `flosaloon-backup-${timestamp}.db`),
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      });

      if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

      const { path: backupPath, schemaVersion } = await createBackup(result.filePath);
      return { success: true, path: backupPath, schemaVersion, message: `Backup saved (Schema v${schemaVersion})` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('restore-backup', async () => {
    try {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
        properties: ['openFile'],
      });

      if (result.canceled || !result.filePaths.length) return { success: false, error: 'Cancelled' };

      const backupPath = result.filePaths[0];
      const backupVersion = getSchemaVersionFromBackup(backupPath);

      if (backupVersion === 0) {
        return { success: false, error: 'Invalid backup file: missing schema version metadata.' };
      }

      const versionMismatch = backupVersion !== SCHEMA_VERSION;
      if (versionMismatch) {
        const confirmResult = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Restore Anyway', 'Cancel'],
          defaultId: 1,
          title: 'Schema Version Mismatch',
          message: `Backup schema v${backupVersion}, current v${SCHEMA_VERSION}`,
          detail: 'Will import data only (common fields). Continue?',
        });
        if (confirmResult.response !== 0) return { success: false, error: 'Cancelled' };
      }

      const restoreResult = restoreBackup(backupPath, !versionMismatch);
      return {
        success: restoreResult.success,
        mode: restoreResult.mode,
        backupVersion,
        currentVersion: SCHEMA_VERSION,
        tablesRestored: restoreResult.tablesRestored,
        message: restoreResult.success ? `Restored ${restoreResult.tablesRestored} tables` : `Restore failed: ${restoreResult.error}`,
        error: restoreResult.error,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-settings', async () => {
    try {
      const db = getDatabase();
      const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
      const settings: Record<string, string> = {};
      rows.forEach((row) => { settings[row.key] = row.value; });
      return settings;
    } catch (error: any) {
      return { error: error.message };
    }
  });

  ipcMain.handle('set-setting', async (event, key: string, value: string) => {
    try {
      const db = getDatabase();
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, now());
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-app-info', async () => ({
    version: app.getVersion(),
    name: app.getName(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
  }));

  ipcMain.handle('get-printers', async () => {
    try {
      const db = getDatabase();
      return db.prepare('SELECT * FROM printers ORDER BY name').all();
    } catch (error: any) {
      return { error: error.message };
    }
  });

  ipcMain.handle('save-printer', async (event, printer: any) => {
    try {
      const db = getDatabase();
      if (printer.id) {
        db.prepare(`UPDATE printers SET name = ?, connection_type = ?, ip_address = ?, port = ?, usb_device_path = ?, is_default = ?, updated_at = ? WHERE id = ?`)
          .run(printer.name, printer.connection_type, printer.ip_address, printer.port || 9100, printer.usb_device_path, printer.is_default ? 1 : 0, now(), printer.id);
      } else {
        db.prepare(`INSERT INTO printers (name, connection_type, ip_address, port, usb_device_path, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(printer.name, printer.connection_type, printer.ip_address, printer.port || 9100, printer.usb_device_path, printer.is_default ? 1 : 0, now(), now());
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-daily-summary', async () => {
    try {
      const db = getDatabase();
      const today = new Date().toISOString().slice(0, 10);

      const bills = db.prepare(`SELECT COUNT(*) as bill_count, COALESCE(SUM(total), 0) as revenue FROM bills WHERE date(created_at) = date(?) AND payment_status = 'paid'`).get(today) as { bill_count: number; revenue: number };
      const pendingOrders = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'in-service')`).get() as { count: number };

      return { date: today, revenue: bills.revenue, bill_count: bills.bill_count, pending_orders: pendingOrders.count };
    } catch (error: any) {
      return { error: error.message };
    }
  });

  ipcMain.handle('get-users', async () => {
    try {
      const db = getDatabase();
      return db.prepare('SELECT id, name, email, role, is_active, created_at FROM users').all();
    } catch (error: any) {
      return { error: error.message };
    }
  });

  ipcMain.handle('create-user', async (event, userData: any) => {
    try {
      const bcrypt = require('bcryptjs');
      const db = getDatabase();
      const result = db.prepare(`INSERT INTO users (name, email, password, pin, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(userData.name, userData.email, bcrypt.hashSync(userData.password, 10), userData.pin || null, userData.role || 'cashier', now(), now());
      return { success: true, id: result.lastInsertRowid };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('update-user', async (event, id: number, userData: any) => {
    try {
      const db = getDatabase();
      const updates: string[] = [];
      const params: any[] = [];
      if (userData.name) { updates.push('name = ?'); params.push(userData.name); }
      if (userData.email) { updates.push('email = ?'); params.push(userData.email); }
      if (userData.pin !== undefined) { updates.push('pin = ?'); params.push(userData.pin); }
      if (userData.role) { updates.push('role = ?'); params.push(userData.role); }
      if (userData.is_active !== undefined) { updates.push('is_active = ?'); params.push(userData.is_active ? 1 : 0); }
      if (updates.length === 0) return { success: false, error: 'No updates provided' };
      updates.push('updated_at = ?'); params.push(now()); params.push(id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('delete-user', async (event, id: number) => {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Handlers registered');
}
