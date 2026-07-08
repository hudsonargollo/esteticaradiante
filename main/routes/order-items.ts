import { Router, Request, Response } from 'express';
import { getDatabase, now, parseItemJson, withTxn } from '../db';

const router = Router();

router.patch('/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'in-service', 'served'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Valid status required: ${validStatuses.join(', ')}` });
    }

    const db = getDatabase();
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.id) as any;
    if (!item) return res.status(404).json({ error: 'Order item not found' });

    db.prepare('UPDATE order_items SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), req.params.id);

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(item.order_id) as any;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(item.order_id).map(parseItemJson);

    res.json({ order: { ...order, items } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:orderId/items/:itemId/cancel', (req: Request, res: Response) => {
  try {
    const { orderId, itemId } = req.params;
    const userRole = req.headers['x-user-role'] as string;
    if (!userRole || !['owner', 'manager'].includes(userRole.toLowerCase())) {
      return res.status(403).json({ error: 'Only owner or manager can cancel items' });
    }

    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const item = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(itemId, orderId) as any;
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const { updatedOrder, items } = withTxn(() => {
      db.prepare("UPDATE order_items SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now(), itemId);
      const activeItems = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'").all(orderId) as any[];
      let subtotal = 0; let totalTax = 0;
      for (const i of activeItems) { subtotal += i.subtotal || 0; totalTax += i.tax_amount || 0; }
      const preRoundTotal = subtotal + totalTax;
      const roundOff = Math.round(preRoundTotal) - preRoundTotal;
      const total = Math.round(preRoundTotal) + roundOff;
      db.prepare(`UPDATE orders SET subtotal = ?, tax_amount = ?, total = ?, round_off = ?, updated_at = ? WHERE id = ?`).run(subtotal, totalTax, total, roundOff, now(), orderId);
      return { updatedOrder: db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId).map(parseItemJson) };
    });

    res.json({ order: { ...updatedOrder, items } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:orderId/items/:itemId/restore', (req: Request, res: Response) => {
  try {
    const { orderId, itemId } = req.params;
    const userRole = req.headers['x-user-role'] as string;
    if (!userRole || !['owner', 'manager'].includes(userRole.toLowerCase())) {
      return res.status(403).json({ error: 'Only owner or manager can restore items' });
    }

    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const item = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(itemId, orderId) as any;
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const { updatedOrder, items } = withTxn(() => {
      db.prepare("UPDATE order_items SET status = 'pending', updated_at = ? WHERE id = ?").run(now(), itemId);
      const activeItems = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'").all(orderId) as any[];
      let subtotal = 0; let totalTax = 0;
      for (const i of activeItems) { subtotal += i.subtotal || 0; totalTax += i.tax_amount || 0; }
      const preRoundTotal = subtotal + totalTax;
      const roundOff = Math.round(preRoundTotal) - preRoundTotal;
      const total = Math.round(preRoundTotal) + roundOff;
      db.prepare(`UPDATE orders SET subtotal = ?, tax_amount = ?, total = ?, round_off = ?, updated_at = ? WHERE id = ?`).run(subtotal, totalTax, total, roundOff, now(), orderId);
      return { updatedOrder: db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId).map(parseItemJson) };
    });

    res.json({ order: { ...updatedOrder, items } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const orderItemRoutes = router;
