import { Router, Request, Response } from 'express';
import { getDatabase, generateOrderNumber, now, parseItemJson, withTxn } from '../db';
import { calculateItemTax } from '../services/tax';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params: any[] = [];

    if (req.query.status) { query += ' AND status = ?'; params.push(req.query.status); }
    if (req.query.today && req.query.today !== '0' && req.query.today !== 'false') {
      query += " AND date(created_at) = date('now')";
    }
    if (req.query.customer_id) { query += ' AND customer_id = ?'; params.push(req.query.customer_id); }
    if (req.query.stylist_id) { query += ' AND stylist_id = ?'; params.push(req.query.stylist_id); }

    query += ' ORDER BY created_at DESC';
    if (req.query.per_page) query += ` LIMIT ${parseInt(req.query.per_page as string)}`;

    const orders = db.prepare(query).all(...params);
    const ordersWithRelations = orders.map((order: any) => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id).map(parseItemJson);
      const customer = order.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id) : null;
      const stylist = order.stylist_id ? db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(order.stylist_id) : null;
      const bill = db.prepare('SELECT * FROM bills WHERE order_id = ?').get(order.id) as any;
      return { ...order, items, customer, stylist, bill };
    });

    res.json({ orders: ordersWithRelations });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id).map(parseItemJson);
    const customer = (order as any).customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get((order as any).customer_id) : null;
    const stylist = (order as any).stylist_id ? db.prepare('SELECT id, name, role FROM users WHERE id = ?').get((order as any).stylist_id) : null;
    const bill = db.prepare('SELECT * FROM bills WHERE order_id = ?').get(req.params.id);

    res.json({ order: { ...order, items, customer, stylist, bill } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { customer_id, user_id, stylist_id, special_instructions, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

    const db = getDatabase();
    const orderNumber = generateOrderNumber();

    const settings: Record<string, string> = {};
    db.prepare('SELECT key, value FROM settings').all().forEach((row: any) => { settings[row.key] = row.value; });
    const tenantInfo = { country: settings.country || 'IN', business_type: 'salon', state_code: settings.state_code || '' };

    const { order, orderItems } = withTxn(() => {
      const orderResult = db.prepare(`
        INSERT INTO orders (order_number, customer_id, user_id, stylist_id, special_instructions, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(orderNumber, customer_id || null, user_id || null, stylist_id || null, special_instructions || null, now(), now());

      const orderId = orderResult.lastInsertRowid;
      let subtotal = 0; let totalTax = 0;

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price, quantity,
          subtotal, tax_amount, tax_breakdown, tax_type, discount_amount, total, variant_selection,
          modifier_selection, addons, special_instructions, performed_by_user_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `);

      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any;
        if (!product) throw new Error(`Product ${item.product_id} not found`);
        if (product.track_inventory && product.stock_quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        const unitPrice = parseFloat(product.price);
        const quantity = item.quantity;
        const itemDiscount = item.discount_amount || 0;
        let itemSubtotal = unitPrice * quantity;
        if (item.addons) for (const addon of item.addons) itemSubtotal += (addon.price || 0) * quantity;
        itemSubtotal = Math.max(0, itemSubtotal - itemDiscount);

        const customer = customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id) as any : null;
        const taxResult = calculateItemTax(tenantInfo, product, itemSubtotal, customer);
        totalTax += taxResult.tax_amount;
        const itemTotal = itemSubtotal + taxResult.tax_amount;
        subtotal += itemSubtotal;

        insertItem.run(
          orderId, product.id, product.name, product.sku, unitPrice, quantity,
          itemSubtotal, taxResult.tax_amount, JSON.stringify(taxResult.tax_breakdown),
          product.tax_type, itemDiscount, itemTotal,
          JSON.stringify(item.variant_selection || null),
          JSON.stringify(item.modifier_selection || null),
          JSON.stringify(item.addons || null),
          item.special_instructions || null,
          item.performed_by_user_id || stylist_id || null,
          now(), now()
        );

        if (product.track_inventory) {
          db.prepare('UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?').run(quantity, now(), product.id);
        }
      }

      const preRoundTotal = subtotal + totalTax;
      const roundOff = Math.round(preRoundTotal) - preRoundTotal;
      const total = Math.round(preRoundTotal) + roundOff;

      db.prepare(`UPDATE orders SET subtotal = ?, tax_amount = ?, total = ?, round_off = ?, updated_at = ? WHERE id = ?`)
        .run(subtotal, totalTax, total, roundOff, now(), orderId);

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
      const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId).map(parseItemJson);
      return { order, orderItems };
    });

    res.status(201).json({ order: Object.assign({}, order, { items: orderItems }) });
  } catch (error: any) {
    console.error('[Orders] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/items', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot add items to a completed or cancelled order' });
    }

    const { items, stylist_id } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

    const settings: Record<string, string> = {};
    db.prepare('SELECT key, value FROM settings').all().forEach((row: any) => { settings[row.key] = row.value; });
    const tenantInfo = { country: settings.country || 'IN', business_type: 'salon', state_code: settings.state_code || '' };
    const customer = order.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id) as any : null;

    const { updatedOrder, updatedItems } = withTxn(() => {
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price, quantity,
          subtotal, tax_amount, tax_breakdown, tax_type, discount_amount, total, variant_selection,
          modifier_selection, addons, special_instructions, performed_by_user_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `);

      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any;
        if (!product) throw new Error(`Product ${item.product_id} not found`);
        if (product.track_inventory && product.stock_quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        const unitPrice = parseFloat(product.price);
        const quantity = item.quantity;
        const itemDiscount = item.discount_amount || 0;
        let itemSubtotal = unitPrice * quantity;
        if (item.addons) for (const addon of item.addons) itemSubtotal += (addon.price || 0) * quantity;
        itemSubtotal = Math.max(0, itemSubtotal - itemDiscount);

        const taxResult = calculateItemTax(tenantInfo, product, itemSubtotal, customer);
        const itemTotal = itemSubtotal + taxResult.tax_amount;

        insertItem.run(
          req.params.id, product.id, product.name, product.sku, unitPrice, quantity,
          itemSubtotal, taxResult.tax_amount, JSON.stringify(taxResult.tax_breakdown),
          product.tax_type, itemDiscount, itemTotal,
          JSON.stringify(item.variant_selection || null),
          JSON.stringify(item.modifier_selection || null),
          JSON.stringify(item.addons || null),
          item.special_instructions || null,
          item.performed_by_user_id || stylist_id || null,
          now(), now()
        );

        if (product.track_inventory) {
          db.prepare('UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?').run(quantity, now(), product.id);
        }
      }

      const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id) as any[];
      let subtotal = 0; let totalTax = 0;
      for (const item of orderItems) { subtotal += item.subtotal; totalTax += item.tax_amount; }
      const preRoundTotal = subtotal + totalTax;
      const roundOff = Math.round(preRoundTotal) - preRoundTotal;
      const total = Math.round(preRoundTotal) + roundOff;

      db.prepare(`UPDATE orders SET subtotal = ?, tax_amount = ?, total = ?, round_off = ?, updated_at = ? WHERE id = ?`)
        .run(subtotal, totalTax, total, roundOff, now(), req.params.id);

      const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as any;
      const updatedItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id).map(parseItemJson);
      return { updatedOrder, updatedItems };
    });

    res.json({ order: Object.assign({}, updatedOrder, { items: updatedItems }) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/status', (req: Request, res: Response) => {
  try {
    const { status, reason } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const validStatuses = ['in-service', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Use: ${validStatuses.join(', ')}` });
    }

    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const nowStr = now();

    const { updatedOrder, orderItems } = withTxn(() => {
      switch (status) {
        case 'in-service':
          db.prepare('UPDATE orders SET status = ?, in_service_at = ?, updated_at = ? WHERE id = ?').run(status, nowStr, nowStr, req.params.id);
          break;
        case 'completed':
          db.prepare('UPDATE orders SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(status, nowStr, nowStr, req.params.id);
          db.prepare(`UPDATE order_items SET status = 'done', updated_at = ? WHERE order_id = ? AND status IN ('pending', 'in-service')`).run(nowStr, req.params.id);
          break;
        case 'cancelled': {
          const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id) as any[];
          for (const item of items) {
            const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any;
            if (product && product.track_inventory) {
              db.prepare('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?').run(item.quantity, nowStr, product.id);
            }
          }
          db.prepare('UPDATE orders SET status = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?').run(status, nowStr, reason, nowStr, req.params.id);
          break;
        }
      }

      const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as any;
      const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id).map(parseItemJson);
      return { updatedOrder, orderItems };
    });

    res.json({ order: Object.assign({}, updatedOrder, { items: orderItems }) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const orderRoutes = router;
