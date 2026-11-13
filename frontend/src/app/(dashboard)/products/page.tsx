'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import type { Product, Category } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  name: '', category_id: '', price: '', kind: 'service', service_duration_minutes: '30',
  sku: '', stock_quantity: '', low_stock_threshold: '5', track_inventory: false,
  tax_type: 'none', tax_rate: '0',
};

export default function ServicesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    const [p, c] = await Promise.all([api.get('/products'), api.get('/categories')]);
    setProducts(p.data.products);
    setCategories(c.data.categories);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name, category_id: p.category_id || '', price: String(p.price), kind: p.kind,
      service_duration_minutes: String(p.service_duration_minutes || 30),
      sku: p.sku || '', stock_quantity: String(p.stock_quantity), low_stock_threshold: String(p.low_stock_threshold),
      track_inventory: p.track_inventory === 1, tax_type: p.tax_type, tax_rate: String(p.tax_rate),
    });
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isService = form.kind === 'service';
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      price: Number(form.price),
      kind: form.kind,
      service_duration_minutes: isService ? Number(form.service_duration_minutes) || 0 : 0,
      sku: !isService ? form.sku || null : null,
      track_inventory: !isService && form.track_inventory,
      stock_quantity: !isService ? Number(form.stock_quantity) || 0 : 0,
      low_stock_threshold: !isService ? Number(form.low_stock_threshold) || 5 : 5,
      tax_type: form.tax_type,
      tax_rate: Number(form.tax_rate) || 0,
    };
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, payload);
        toast.success('Salvo');
      } else {
        await api.post('/products', payload);
        toast.success('Criado');
      }
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Falha ao salvar');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este item?')) return;
    await api.delete(`/products/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Serviços</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--secondary)] text-left">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Categoria</th>
              <th className="p-3">Preço</th>
              <th className="p-3">Detalhes</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--secondary)]">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', p.kind === 'service' ? 'bg-pink-100 text-pink-800' : 'bg-green-100 text-green-800')}>
                    {p.kind === 'service' ? 'serviço' : 'produto'}
                  </span>
                </td>
                <td className="p-3">{p.category?.name || '—'}</td>
                <td className="p-3">{formatCurrency(p.price)}</td>
                <td className="p-3 text-[var(--muted-foreground)]">
                  {p.kind === 'service' ? `${p.service_duration_minutes} min` : (p.track_inventory === 1 ? `Estoque: ${p.stock_quantity}` : '—')}
                </td>
                <td className="p-3 text-right space-x-2">
                  <button className="text-sm underline" onClick={() => openEdit(p)}>Editar</button>
                  <button className="text-sm underline text-red-600" onClick={() => handleDelete(p.id)}>Excluir</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-[var(--muted-foreground)]">Nada por aqui ainda</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar item' : 'Adicionar serviço ou produto'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="service">Serviço (executado por uma profissional)</option>
              <option value="retail">Produto (vendido no balcão)</option>
            </Select>
          </div>
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Nenhuma</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Preço</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </div>
          </div>

          {form.kind === 'service' ? (
            <div>
              <Label>Duração (minutos)</Label>
              <Input type="number" value={form.service_duration_minutes} onChange={(e) => setForm({ ...form, service_duration_minutes: e.target.value })} required />
            </div>
          ) : (
            <>
              <div>
                <Label>SKU</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="track_inventory" checked={form.track_inventory} onChange={(e) => setForm({ ...form, track_inventory: e.target.checked })} />
                <Label htmlFor="track_inventory" className="!mb-0">Controlar estoque</Label>
              </div>
              {form.track_inventory && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantidade em estoque</Label>
                    <Input type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
                  </div>
                  <div>
                    <Label>Alerta de estoque baixo abaixo de</Label>
                    <Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de imposto</Label>
              <Select value={form.tax_type} onChange={(e) => setForm({ ...form, tax_type: e.target.value })}>
                <option value="none">Nenhum</option>
                <option value="inclusive">Incluso</option>
                <option value="exclusive">Excluso</option>
              </Select>
            </div>
            <div>
              <Label>Alíquota %</Label>
              <Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} disabled={form.tax_type === 'none'} />
            </div>
          </div>
          {form.kind === 'service' && (
            <p className="text-xs text-[var(--muted-foreground)]">Serviços são tributados pela alíquota fixa da loja, independentemente deste campo — veja Configurações → Impostos.</p>
          )}
          <Button type="submit" className="w-full">{editing ? 'Salvar alterações' : 'Criar'}</Button>
        </form>
      </Modal>
    </div>
  );
}