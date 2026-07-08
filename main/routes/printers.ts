import { Router, Request, Response } from 'express';
import { getDatabase, now } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { printViaNetwork, printViaUSB, buildTestPage, printReceipt, detectConnectedPrinters } from '../printers/thermal';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    res.json({ printers: db.prepare('SELECT * FROM printers ORDER BY is_default DESC, name').all() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/detect', async (_req: Request, res: Response) => {
  try {
    const printers = await detectConnectedPrinters();
    res.json({ printers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
    if (!printer) return res.status(404).json({ error: 'Printer not found' });
    res.json({ printer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, connection_type, ip_address, port, usb_device_path, paper_width, is_default } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!connection_type || !['network', 'usb', 'webusb'].includes(connection_type)) {
      return res.status(400).json({ error: 'connection_type must be network | usb | webusb' });
    }
    if (connection_type === 'network' && !ip_address) return res.status(400).json({ error: 'ip_address required for network printers' });

    const db = getDatabase();
    const id = uuidv4();
    const isFirst = (db.prepare('SELECT COUNT(*) as count FROM printers').get() as any).count === 0;
    if (is_default || isFirst) db.prepare('UPDATE printers SET is_default = 0').run();

    db.prepare(`INSERT INTO printers (id, name, connection_type, ip_address, port, usb_device_path, paper_width, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, connection_type, ip_address || null, port || 9100, usb_device_path || null, paper_width || '80mm', (is_default || isFirst) ? 1 : 0, now(), now());

    res.status(201).json({ printer: db.prepare('SELECT * FROM printers WHERE id = ?').get(id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Printer not found' });

    const { name, connection_type, ip_address, port, usb_device_path, paper_width, is_default } = req.body;
    if (is_default) db.prepare('UPDATE printers SET is_default = 0').run();

    db.prepare(`UPDATE printers SET name = COALESCE(?, name), connection_type = COALESCE(?, connection_type), ip_address = ?, port = COALESCE(?, port), usb_device_path = ?, paper_width = COALESCE(?, paper_width), is_default = COALESCE(?, is_default), updated_at = ? WHERE id = ?`)
      .run(name || null, connection_type || null, ip_address !== undefined ? (ip_address || null) : existing.ip_address, port || null, usb_device_path !== undefined ? (usb_device_path || null) : existing.usb_device_path, paper_width || null, is_default !== undefined ? (is_default ? 1 : 0) : null, now(), req.params.id);

    res.json({ printer: db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    if (!db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Printer not found' });
    db.prepare('DELETE FROM printers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Printer deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/set-default', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    if (!db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Printer not found' });
    db.prepare('UPDATE printers SET is_default = 0').run();
    db.prepare('UPDATE printers SET is_default = 1, updated_at = ? WHERE id = ?').run(now(), req.params.id);
    res.json({ message: 'Default printer set' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id) as any;
    if (!printer) return res.status(404).json({ error: 'Printer not found' });

    const testData = buildTestPage(printer.paper_width);
    let success = false;

    switch (printer.connection_type) {
      case 'network':
        if (!printer.ip_address) return res.status(400).json({ error: 'No IP address configured' });
        success = await printViaNetwork(printer.ip_address, printer.port || 9100, testData);
        break;
      case 'usb':
        success = await printViaUSB(testData, undefined);
        break;
      case 'webusb':
        return res.json({ success: true, webusb: true, bytes: Array.from(testData) });
    }

    if (success) res.json({ success: true });
    else res.status(502).json({ error: 'Printer did not respond' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/print-bill', async (req: Request, res: Response) => {
  try {
    const { billId, orderId, useUnicode = false } = req.body;
    if (!billId && !orderId) return res.status(400).json({ error: 'billId or orderId is required' });

    const db = getDatabase();
    const printer = db.prepare('SELECT * FROM printers WHERE is_default = 1').get();
    if (!printer) return res.status(400).json({ error: 'No default printer configured. Add a printer in Settings.' });

    let bill: any = billId
      ? db.prepare('SELECT * FROM bills WHERE id = ?').get(billId)
      : db.prepare('SELECT b.* FROM bills b WHERE b.order_id = ?').get(orderId);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const order: any = db.prepare('SELECT * FROM orders WHERE id = ?').get(bill.order_id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(bill.order_id);

    const businessName = db.prepare("SELECT value FROM settings WHERE key = 'business_name'").get() as any;
    const businessAddress = db.prepare("SELECT value FROM settings WHERE key = 'address'").get() as any;
    const businessPhone = db.prepare("SELECT value FROM settings WHERE key = 'phone'").get() as any;
    const gstin = db.prepare("SELECT value FROM settings WHERE key = 'gstin'").get() as any;
    const billTemplate = db.prepare("SELECT value FROM settings WHERE key = 'bill_template'").get() as any;

    const business = { name: businessName?.value || 'Salon', address: businessAddress?.value || '', phone: businessPhone?.value || '', gstin: gstin?.value || '' };
    const success = await printReceipt(order, bill, business, billTemplate?.value || 'compact', useUnicode);

    if (success) res.json({ success: true });
    else res.status(502).json({ error: 'Print failed. Check printer connection.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const printerRoutes = router;
