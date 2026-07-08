'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import type { Category, Product, CartLine, StaffMember } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Search, Plus, Minus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PosPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stylists, setStylists] = useState<StaffMember[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [checkingOut, setCheckingOut] = useState(false);

  const loadData = useCallback(async () => {
    const [catsRes, prodsRes, staffRes] = await Promise.all([
      api.get('/categories', { params: { active: 'true' } }),
      api.get('/products', { params: { active: 'true' } }),
      api.get('/staff', { params: { role: 'stylist', active: 'true' } }),
    ]);
    setCategories(catsRes.data.categories);
    setProducts(prodsRes.data.products);
    setStylists(staffRes.data.staff);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProducts = products.filter((p) => {
    if (activeCategory && p.category_id !== activeCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, quantity: 1, discount_amount: 0, stylist_id: product.kind === 'service' ? stylists[0]?.id : undefined }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev.map((l) => (l.product.id === productId ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0)
    );
  }

  function updateStylist(productId: string, stylistId: string) {
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, stylist_id: stylistId } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }

  const subtotal = cart.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  const discountAmount = (subtotal * discountPercent) / 100;
  const missingStylist = cart.some((l) => l.product.kind === 'service' && !l.stylist_id);

  async function checkout() {
    if (cart.length === 0) return;
    if (missingStylist) {
      toast.error('Assign a stylist to every service before checking out');
      return;
    }
    setCheckingOut(true);
    try {
      let customerId: string | undefined;
      if (customerPhone.trim()) {
        try {
          const { data } = await api.post('/customers', { name: customerName.trim() || 'Walk-in', phone: customerPhone.trim() });
          customerId = data.customer.id;
        } catch {
          const { data } = await api.get('/customers/search', { params: { q: customerPhone.trim() } });
          customerId = data.customers?.[0]?.id;
        }
      }

      const primaryStylist = cart.find((l) => l.stylist_id)?.stylist_id;

      const { data: orderRes } = await api.post('/orders', {
        customer_id: customerId,
        stylist_id: primaryStylist,
        items: cart.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          performed_by_user_id: l.stylist_id,
          discount_amount: discountPercent > 0 ? (l.product.price * l.quantity * discountPercent) / 100 : 0,
        })),
      });
      const orderId = orderRes.order.id;

      const { data: billRes } = await api.post('/bills/generate', { order_id: orderId });
      const billId = billRes.bill.id;

      await api.post(`/bills/${billId}/payment`, { method: paymentMethod });

      try {
        await api.post('/printers/print-bill', { billId });
      } catch {
        // printer may not be connected in dev — checkout still succeeds
      }

      toast.success(`Ticket complete — ${orderRes.order.order_number}`);
      setCart([]);
      setDiscountPercent(0);
      setCustomerName('');
      setCustomerPhone('');
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-3rem)]">
      {/* Service / product browser */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted-foreground)]" />
          <Input placeholder="Search services or products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn('px-3 py-1.5 rounded-full text-sm whitespace-nowrap', !activeCategory ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--secondary)]')}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={cn('px-3 py-1.5 rounded-full text-sm whitespace-nowrap', activeCategory === c.id ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--secondary)]')}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto pr-1">
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="text-left rounded-lg border border-[var(--border)] p-3 hover:border-[var(--primary)] transition-colors"
            >
              <div className="font-medium text-sm truncate">{p.name}</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {p.kind === 'service' ? `${p.service_duration_minutes} min` : 'Retail product'}
              </div>
              <div className="mt-1 font-semibold">{formatCurrency(p.price)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Ticket */}
      <div className="w-96 shrink-0 flex flex-col border-l border-[var(--border)] pl-6">
        <h2 className="font-semibold mb-3">Ticket</h2>
        <div className="flex-1 overflow-y-auto space-y-3">
          {cart.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">No items yet</p>}
          {cart.map((l) => (
            <div key={l.product.id} className="text-sm space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{l.product.name}</div>
                  <div className="text-[var(--muted-foreground)]">{formatCurrency(l.product.price)} × {l.quantity}</div>
                </div>
                <button onClick={() => updateQuantity(l.product.id, -1)} className="p-1 hover:bg-[var(--secondary)] rounded">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-5 text-center">{l.quantity}</span>
                <button onClick={() => updateQuantity(l.product.id, 1)} className="p-1 hover:bg-[var(--secondary)] rounded">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removeLine(l.product.id)} className="p-1 hover:bg-red-50 text-red-600 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {l.product.kind === 'service' && (
                <Select value={l.stylist_id || ''} onChange={(e) => updateStylist(l.product.id, e.target.value)} className="h-8 text-xs">
                  <option value="">Assign stylist...</option>
                  {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--border)] mt-3 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Client name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <Input placeholder="Phone number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--muted-foreground)] shrink-0">Discount %</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
              className="w-20"
            />
          </div>

          <div>
            <label className="text-sm text-[var(--muted-foreground)]">Payment method</label>
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="wallet">Loyalty wallet</option>
            </Select>
          </div>

          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-[var(--muted-foreground)]">
              <span>Discount</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-lg">
            <span>Total</span>
            <span>{formatCurrency(subtotal - discountAmount)}</span>
          </div>

          <Button className="w-full" size="lg" disabled={cart.length === 0 || checkingOut} onClick={checkout}>
            {checkingOut ? 'Processing...' : 'Checkout'}
          </Button>
        </div>
      </div>
    </div>
  );
}
