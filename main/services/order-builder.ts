import { getDatabase, generateOrderNumber, now, parseItemJson, withTxn } from '../db';
import { calculateItemTax } from './tax';

/**
 * Turns an appointment's service list into a regular POS ticket (order).
 * Prices are taken from the appointment snapshot so later catalog edits
 * never change what the client was quoted.
 */
export function createOrderFromAppointment(appointment: any): any {
  const db = getDatabase();
  const items = db.prepare('SELECT * FROM appointment_items WHERE appointment_id = ? ORDER BY id').all(appointment.id) as any[];
  if (items.length === 0) throw new Error('Agendamento sem serviços');

  const settings: Record<string, string> = {};
  db.prepare('SELECT key, value FROM settings').all().forEach((row: any) => { settings[row.key] = row.value; });
  const tenantInfo = {
    country: settings.country || 'BR',
    business_type: 'salon',
    state_code: settings.state_code || '',
  };
  const customer = appointment.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(appointment.customer_id) as any
    : null;

  const orderNumber = generateOrderNumber();

  return withTxn(() => {
    const orderResult = db.prepare(`
      INSERT INTO orders (order_number, customer_id, user_id, stylist_id, special_instructions, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      orderNumber,
      appointment.customer_id || null,
      null,
      appointment.stylist_id || null,
      `Agendamento ${appointment.appointment_number}`,
      now(),
      now()
    );

    const orderId = Number(orderResult.lastInsertRowid);
    let subtotal = 0;
    let totalTax = 0;

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price, quantity,
        subtotal, tax_amount, tax_breakdown, tax_type, discount_amount, total, special_instructions,
        performed_by_user_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0, ?, ?, ?, 'pending', ?, ?)
    `);

    for (const item of items) {
      const product = item.product_id
        ? db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any
        : null;
      const unitPrice = Number(item.price) || 0;
      const taxResult = calculateItemTax(
        tenantInfo,
        product || { tax_type: 'none', tax_rate: 0, price: unitPrice },
        unitPrice,
        customer
      );
      subtotal += unitPrice;
      totalTax += taxResult.tax_amount;
      const itemTotal = unitPrice + taxResult.tax_amount;

      insertItem.run(
        orderId,
        item.product_id || null,
        item.product_name,
        product?.sku || null,
        unitPrice,
        unitPrice,
        taxResult.tax_amount,
        JSON.stringify(taxResult.tax_breakdown),
        product?.tax_type || 'none',
        itemTotal,
        appointment.appointment_number,
        appointment.stylist_id || null,
        now(),
        now()
      );
    }

    const preRoundTotal = subtotal + totalTax;
    const roundOff = Math.round(preRoundTotal) - preRoundTotal;
    const total = Math.round(preRoundTotal) + roundOff;

    db.prepare(`UPDATE orders SET subtotal = ?, tax_amount = ?, total = ?, round_off = ?, updated_at = ? WHERE id = ?`)
      .run(subtotal, totalTax, total, roundOff, now(), orderId);

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId).map(parseItemJson);
    return { ...order, items: orderItems };
  });
}
