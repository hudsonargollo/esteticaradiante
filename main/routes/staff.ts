/**
 * /api/staff — salon staff management.
 * Roles: owner | manager | cashier | stylist
 */
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, now } from '../db';

const router = Router();
const VALID_ROLES = ['owner', 'manager', 'cashier', 'stylist'];

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    let query = 'SELECT id, name, email, role, pin, is_active, created_at, updated_at FROM users WHERE 1=1';
    const params: any[] = [];
    if (req.query.role) { query += ' AND role = ?'; params.push(req.query.role); }
    if (req.query.active === 'true') { query += ' AND is_active = 1'; }
    if (req.query.active === 'false') { query += ' AND is_active = 0'; }
    query += ' ORDER BY role, name';
    res.json({ staff: db.prepare(query).all(...params) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const member = db.prepare('SELECT id, name, email, role, pin, is_active, created_at, updated_at FROM users WHERE id = ?').get(req.params.id) as any;
    if (!member) return res.status(404).json({ error: 'Staff member not found' });

    const performance = db.prepare(`SELECT COUNT(*) as services_performed, COALESCE(SUM(total), 0) as total_sales FROM orders WHERE stylist_id = ? AND date(created_at) = date('now')`).get(req.params.id);
    res.json({ staff: { ...member, performance } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, email, password, role, pin } = req.body;
    if (!name || !password || !role) return res.status(400).json({ error: 'name, password, and role are required' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });

    const db = getDatabase();
    if (email && db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const id = uuidv4();
    db.prepare(`INSERT INTO users (id, name, email, password, role, pin, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(id, name, email || null, bcrypt.hashSync(password, 10), role, pin || null, now(), now());

    res.status(201).json({ staff: db.prepare('SELECT id, name, email, role, pin, is_active, created_at, updated_at FROM users WHERE id = ?').get(id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, email, password, role, pin, is_active } = req.body;
    const db = getDatabase();
    const member = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!member) return res.status(404).json({ error: 'Staff member not found' });
    if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    if (email && email !== member.email && db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.params.id)) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const hashedPassword = password ? bcrypt.hashSync(password, 10) : member.password;
    db.prepare(`UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), password = ?, role = COALESCE(?, role), pin = COALESCE(?, pin), is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?`)
      .run(name || null, email || null, hashedPassword, role || null, pin || null, is_active !== undefined ? (is_active ? 1 : 0) : null, now(), req.params.id);

    res.json({ staff: db.prepare('SELECT id, name, email, role, pin, is_active, created_at, updated_at FROM users WHERE id = ?').get(req.params.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const member = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!member) return res.status(404).json({ error: 'Staff member not found' });
    db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?').run(now(), req.params.id);
    res.json({ message: 'Staff member deactivated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const staffRoutes = router;
