import { useMemo, useState } from 'react';
import type { StockMovement, StockProduct } from './types';

const COLOR_CSS_MAP: Record<string, string> = {
  Noir: '#222', Bleu: '#2563eb', Gris: '#a3a3a3', Rouge: '#e11d48', Beige: '#f5e9d7', Blanc: '#fff', Bordeaux: '#7c2235', Océan: '#38bdf8',
};
function normalizeColor(value: string): string {
  const key = value.trim().toUpperCase();
  const map: Record<string, string> = {
    NOI: 'Noir', BLU: 'Bleu', GRI: 'Gris', ROU: 'Rouge', BEIG: 'Beige', BLA: 'Blanc', BLANC: 'Blanc', BORD: 'Bordeaux', OCE: 'Océan',
  };
  return map[key] || value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
function getColorCss(color: string): string {
  const key = normalizeColor(color);
  return COLOR_CSS_MAP[key] || '#222';
}
const ACTION_LABELS: Record<string, string> = { sale: 'Sortie', entry: 'Entrée', adjustment: 'Correction' };
function formatDate(date: string, mode: string) {
  const d = new Date(date);
  if (mode === 'jour') return d.toLocaleDateString('fr-FR');
  if (mode === 'mois') return d.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
  if (mode === 'année') return d.getFullYear();
  const week = Math.ceil((d.getDate() - d.getDay() + 1) / 7);
  return `Semaine ${week} ${d.getFullYear()}`;
}
export default function JournalPage({ products, movements }: { products: StockProduct[]; movements: StockMovement[] }) {
  const [mode, setMode] = useState<'jour'|'semaine'|'mois'|'année'>('jour');
  const [filter, setFilter] = useState({
    size: '', color: '', action: '', model: '', date: ''
  });
  const allSizes = Array.from(new Set(products.flatMap(p => p.variants.map(v => v.size))));
  const allColors = Array.from(new Set(products.flatMap(p => p.variants.map(v => normalizeColor(v.color)))));
  const allModels = Array.from(new Set(products.map(p => p.name)));
  const filtered = useMemo(() => {
    return movements.filter(m => {
      const prod = products.find(p => p.id === m.productId);
      const variant = prod?.variants.find(v => v.id === m.variantId);
      if (filter.size && variant?.size !== filter.size) return false;
      if (filter.color && normalizeColor(variant?.color || '') !== filter.color) return false;
      if (filter.action && ACTION_LABELS[m.action] !== filter.action) return false;
      if (filter.model && prod?.name !== filter.model) return false;
      if (filter.date && !m.createdAt.startsWith(filter.date)) return false;
      return true;
    });
  }, [movements, products, filter]);
  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    for (const m of filtered) {
      const key = formatDate(m.createdAt, mode);
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    return map;
  }, [filtered, mode]);
  return (
    <div className="journal-page">
      <div className="journal-toolbar">
        <label>Regrouper par : </label>
        <select value={mode} onChange={e => setMode(e.target.value as any)}>
          <option value="jour">Jour</option>
          <option value="semaine">Semaine</option>
          <option value="mois">Mois</option>
          <option value="année">Année</option>
        </select>
        <label>Taille :
          <select value={filter.size} onChange={e => setFilter(f => ({ ...f, size: e.target.value }))}>
            <option value="">Toutes</option>
            {allSizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Couleur :
          <select value={filter.color} onChange={e => setFilter(f => ({ ...f, color: e.target.value }))}>
            <option value="">Toutes</option>
            {allColors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Type :
          <select value={filter.action} onChange={e => setFilter(f => ({ ...f, action: e.target.value }))}>
            <option value="">Tous</option>
            {Object.values(ACTION_LABELS).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>Modèle :
          <select value={filter.model} onChange={e => setFilter(f => ({ ...f, model: e.target.value }))}>
            <option value="">Tous</option>
            {allModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>Date :
          <input type="date" value={filter.date} onChange={e => setFilter(f => ({ ...f, date: e.target.value }))} />
        </label>
      </div>
      <div className="journal-list">
        {Object.entries(grouped).map(([key, entries]) => (
          <div key={key} className="journal-group">
            <h3>{key}</h3>
            <div className="journal-row journal-header">
              <span>Type</span>
              <span>Modèle</span>
              <span>Taille</span>
              <span>Couleur</span>
              <span>Quantité</span>
              <span>Note</span>
              <span>Date</span>
            </div>
            {entries.map((m) => {
              const prod = products.find(p => p.id === m.productId);
              const variant = prod?.variants.find(v => v.id === m.variantId);
              return (
                <div key={m.id} className="journal-row">
                  <span>{ACTION_LABELS[m.action]}</span>
                  <span>{prod?.name}</span>
                  <span>{variant?.size}</span>
                  <span style={{ color: getColorCss(variant?.color || '') }}>
                    {normalizeColor(variant?.color || '')}
                  </span>
                  <span>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
                  <span>{m.note}</span>
                  <span>{new Date(m.createdAt).toLocaleString('fr-FR')}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
