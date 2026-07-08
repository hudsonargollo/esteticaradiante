import { Router, Request, Response } from 'express';
import { getDatabase } from '../db';

const router = Router();

router.get('/daily-stats', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = new Date().toISOString().slice(0, 10);

    const salesToday = db.prepare(`SELECT COALESCE(SUM(paid_amount), 0) as sales FROM bills WHERE date(created_at) = date(?)`).get(today) as { sales: number };
    const runningOrders = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'in-service')`).get() as { count: number };
    const pendingOrders = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'pending'`).get() as { count: number };

    res.json({ sales: salesToday.sales, runningOrders: runningOrders.count, pendingOrders: pendingOrders.count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const date = req.query.date as string || new Date().toISOString().slice(0, 10);

    const ordersToday = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE date(created_at) = date(?)`).get(date) as { count: number; total: number };
    const billsToday = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total, COALESCE(SUM(paid_amount), 0) as collected FROM bills WHERE date(created_at) = date(?)`).get(date) as { count: number; total: number; collected: number };
    const customersToday = db.prepare(`SELECT COUNT(*) as count FROM customers WHERE date(created_at) = date(?)`).get(date) as { count: number };
    const ordersByStatus = db.prepare(`SELECT status, COUNT(*) as count FROM orders WHERE date(created_at) = date(?) GROUP BY status`).all(date);
    const topPaymentMethods = db.prepare(`SELECT json_extract(payment_details, '$[0].method') as method, COUNT(*) as count, SUM(paid_amount) as total FROM bills WHERE payment_status = 'paid' AND date(paid_at) = date(?) GROUP BY method`).all(date);

    res.json({
      summary: {
        date,
        orders: { count: ordersToday.count, total: ordersToday.total },
        bills: { count: billsToday.count, total: billsToday.total, collected: billsToday.collected },
        customers: { new: customersToday.count },
        ordersByStatus,
        topPaymentMethods,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sales', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const startDate = req.query.start_date as string || new Date().toISOString().slice(0, 10);
    const endDate = req.query.end_date as string || new Date().toISOString().slice(0, 10);

    const dailySales = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total), 0) as sales
      FROM orders WHERE date(created_at) BETWEEN date(?) AND date(?) GROUP BY date(created_at) ORDER BY date
    `).all(startDate, endDate);

    const byPaymentMethod = db.prepare(`
      SELECT json_extract(payment_details, '$[0].method') as method, COUNT(*) as count, COALESCE(SUM(paid_amount), 0) as total
      FROM bills WHERE payment_status = 'paid' AND date(paid_at) BETWEEN date(?) AND date(?)
      GROUP BY method ORDER BY total DESC
    `).all(startDate, endDate);

    const totalRevenue = db.prepare(`SELECT COALESCE(SUM(paid_amount), 0) as total FROM bills WHERE payment_status = 'paid' AND date(paid_at) BETWEEN date(?) AND date(?)`).get(startDate, endDate) as { total: number };
    const totalOrders = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE date(created_at) BETWEEN date(?) AND date(?)`).get(startDate, endDate) as { count: number };
    const newCustomers = db.prepare(`SELECT COUNT(*) as count FROM customers WHERE date(created_at) BETWEEN date(?) AND date(?)`).get(startDate, endDate) as { count: number };

    res.json({ dailySales, byPaymentMethod, summary: { total_revenue: totalRevenue.total, total_orders: totalOrders.count, new_customers: newCustomers.count, start_date: startDate, end_date: endDate } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/staff-performance', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const date = req.query.date as string || new Date().toISOString().slice(0, 10);

    const performance = db.prepare(`
      SELECT u.id, u.name, u.role,
        COUNT(DISTINCT o.id) as services_performed,
        COALESCE(SUM(o.total), 0) as total_sales
      FROM users u
      LEFT JOIN orders o ON o.stylist_id = u.id AND date(o.created_at) = date(?)
      WHERE u.role = 'stylist' AND u.is_active = 1
      GROUP BY u.id, u.name, u.role
      ORDER BY total_sales DESC
    `).all(date);

    res.json({ performance, date });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/top-services', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const startDate = req.query.start_date as string || new Date().toISOString().slice(0, 10);
    const endDate = req.query.end_date as string || new Date().toISOString().slice(0, 10);

    const topServices = db.prepare(`
      SELECT oi.product_name, SUM(oi.quantity) as quantity, COALESCE(SUM(oi.total), 0) as revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE date(o.created_at) BETWEEN date(?) AND date(?) AND oi.status != 'cancelled'
      GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 20
    `).all(startDate, endDate);

    res.json({ topServices, start_date: startDate, end_date: endDate });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const reportRoutes = router;
