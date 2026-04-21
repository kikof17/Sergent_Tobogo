import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'
import './App.css'
import { loadStockBundle, repoConfig, saveStockBundle } from './lib/github'
import { applyStockMovement, formatActionLabel } from './lib/stock'
import type {
  MovementsData,
  RepoFile,
  StockAction,
  StockData,
  StockMovement,
  StockProduct,
} from './types'
import JournalPage from './JournalPage'

type LoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'error'

type MovementDraft = {
  action: StockAction
  quantity: number
  note: string
}

const emptyProducts: RepoFile<StockData> = {
  sha: '',
  data: {
    updatedAt: '',
    source: '',
    products: [],
  },
}

const emptyMovements: RepoFile<MovementsData> = {
  sha: '',
  data: {
    updatedAt: '',
    movements: [],
  },
}

function formatDate(value: string) {
  if (!value) {
    return 'Jamais'
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function findVariant(products: StockProduct[], productId: string, variantId: string) {
  const product = products.find((entry) => entry.id === productId)
  const variant = product?.variants.find((entry) => entry.id === variantId)
  return { product, variant }
}

function pickDefaultVariantId(product: StockProduct | null) {
  return product?.variants[0]?.id ?? ''
}

// Table de correspondance pour les couleurs
const COLOR_MAP: Record<string, string> = {
  NOI: 'Noir',
  BLU: 'Bleu',
  GRI: 'Gris',
  ROU: 'Rouge',
  BEIG: 'Beige',
  BLA: 'Blanc',
  BLANC: 'Blanc',
  BORD: 'Bordeaux',
  OCE: 'Océan',
}

// Table de correspondance pour les couleurs CSS
const COLOR_CSS_MAP: Record<string, string> = {
  Noir: '#222',
  Bleu: '#2563eb',
  Gris: '#a3a3a3',
  Rouge: '#e11d48',
  Beige: '#f5e9d7',
  Blanc: '#fff',
  Bordeaux: '#7c2235',
  Océan: '#38bdf8',
}

function normalizeColor(value: string): string {
  const key = value.trim().toUpperCase()
  return COLOR_MAP[key] || value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function getColorSwatch(color: string): string {
  const key = normalizeColor(color)
  return COLOR_CSS_MAP[key] || '#eee'
}

// Correction de la signature :
function groupVariantsBySize(variants: { size: string }[]) {
  const map: Record<string, typeof variants> = {};
  for (const variant of variants) {
    if (!map[variant.size]) map[variant.size] = [];
    map[variant.size].push(variant);
  }
  return map;
}

function App() {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [token, setToken] = useState('')
  const [search, setSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [productsFile, setProductsFile] = useState<RepoFile<StockData>>(emptyProducts)
  const [movementsFile, setMovementsFile] = useState<RepoFile<MovementsData>>(emptyMovements)
  const [draft, setDraft] = useState<MovementDraft>({
    action: 'sale',
    quantity: 1,
    note: '',
  })
  const [hasPendingChanges, setHasPendingChanges] = useState(false)
  const [showJournal, setShowJournal] = useState(false)

  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    let active = true

    async function bootstrap() {
      setLoadState('loading')
      setErrorMessage('')

      try {
        const bundle = await loadStockBundle()

        if (!active) {
          return
        }

        setProductsFile(bundle.productsFile)
        setMovementsFile(bundle.movementsFile)
        setSelectedProductId(bundle.productsFile.data.products[0]?.id ?? '')
        setSelectedVariantId(pickDefaultVariantId(bundle.productsFile.data.products[0] ?? null))
        setLoadState('ready')
      } catch (error) {
        if (!active) {
          return
        }

        setLoadState('error')
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Le chargement initial du stock a echoue.',
        )
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [])

  const filteredProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()

    if (!query) {
      return productsFile.data.products
    }

    return productsFile.data.products.filter((product) => {
      const haystack = [product.name, product.category, product.collection ?? '']
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [deferredSearch, productsFile.data.products])

  const selectedProduct =
    productsFile.data.products.find((product) => product.id === selectedProductId) ??
    filteredProducts[0] ??
    null

  const selectedVariant =
    selectedProduct?.variants.find((variant) => variant.id === selectedVariantId) ??
    selectedProduct?.variants[0] ??
    null

  const metrics = useMemo(() => {
    const products = productsFile.data.products
    const variants = products.flatMap((product) => product.variants)

    return {
      productCount: products.length,
      variantCount: variants.length,
      totalUnits: variants.reduce((sum, variant) => sum + variant.quantity, 0),
      lowStockCount: variants.filter((variant) => variant.quantity <= variant.threshold).length,
    }
  }, [productsFile.data.products])

  const movementRows = useMemo(() => {
    return movementsFile.data.movements.slice(0, 8).map((movement) => {
      const match = findVariant(productsFile.data.products, movement.productId, movement.variantId)

      return {
        ...movement,
        label:
          match.product && match.variant
            ? `${match.product.name} · ${match.variant.size} · ${match.variant.color}`
            : movement.variantId,
      }
    })
  }, [movementsFile.data.movements, productsFile.data.products])

  async function refreshData() {
    setLoadState('loading')
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const bundle = await loadStockBundle(token || undefined)
      setProductsFile(bundle.productsFile)
      setMovementsFile(bundle.movementsFile)
      setSelectedProductId(bundle.productsFile.data.products[0]?.id ?? '')
      setSelectedVariantId(pickDefaultVariantId(bundle.productsFile.data.products[0] ?? null))
      setHasPendingChanges(false)
      setLoadState('ready')
    } catch (error) {
      setLoadState('error')
      setErrorMessage(error instanceof Error ? error.message : 'Rechargement impossible.')
    }
  }

  function handleMovementSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedProduct || !selectedVariant) {
      setErrorMessage('Selectionne une variante avant d ajouter un mouvement.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')

    try {
      const nextState = applyStockMovement({
        products: productsFile.data,
        movements: movementsFile.data,
        productId: selectedProduct.id,
        variantId: selectedVariant.id,
        action: draft.action,
        quantity: Number(draft.quantity),
        note: draft.note,
      })

      startTransition(() => {
        setProductsFile((current) => ({ ...current, data: nextState.products }))
        setMovementsFile((current) => ({ ...current, data: nextState.movements }))
        setHasPendingChanges(true)
        setDraft({ action: 'sale', quantity: 1, note: '' })
        setSuccessMessage('Mouvement applique localement. Sauvegarde GitHub requise.')
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Mouvement impossible.')
    }
  }

  async function handleSave() {
    if (!token.trim()) {
      setErrorMessage('Un token GitHub avec droit de commit est requis pour sauvegarder.')
      return
    }

    setLoadState('saving')
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const saved = await saveStockBundle({
        productsFile,
        movementsFile,
        token: token.trim(),
      })

      setProductsFile(saved.productsFile)
      setMovementsFile(saved.movementsFile)
      setHasPendingChanges(false)
      setLoadState('ready')
      setSuccessMessage('Stocks sauvegardes dans le repository.')
    } catch (error) {
      setLoadState('error')
      setErrorMessage(error instanceof Error ? error.message : 'Sauvegarde impossible.')
    }
  }

  function handleSelectProduct(product: StockProduct) {
    setSelectedProductId(product.id)
    setSelectedVariantId(pickDefaultVariantId(product))
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Sergent Tobogo · Gestion de stock</p>
          <h1>Stock textile branche sur le repo, sans cache navigateur.</h1>
          <p className="hero-text">
            L application lit et ecrit des fichiers JSON versionnes dans GitHub.
            Chaque mouvement reste tracable, exploitable en local et publiable sur
            GitHub Pages.
          </p>

          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={handleSave}>
              Sauvegarder sur GitHub
            </button>
            <button className="secondary-action" type="button" onClick={() => void refreshData()}>
              Recharger le repo
            </button>
            <button className="secondary-action" type="button" onClick={() => setShowJournal((v) => !v)}>
              {showJournal ? 'Retour' : 'Journal'}
            </button>
          </div>
        </div>

        <aside className="hero-card">
          <p className="card-kicker">Configuration repo</p>
          <h2>
            {repoConfig.owner}/{repoConfig.repo}
          </h2>
          <ol>
            <li>Branche cible : {repoConfig.branch}</li>
            <li>Produits : {repoConfig.paths.products}</li>
            <li>Mouvements : {repoConfig.paths.movements}</li>
          </ol>
        </aside>
      </section>
      {showJournal ? (
        <JournalPage products={productsFile.data.products} movements={movementsFile.data.movements} />
      ) : (
        <>
          <section className="toolbar-panel">
            <label className="field token-field">
              <span>Token GitHub de session</span>
              <input
                type="password"
                value={token}
                placeholder="Fine-grained PAT avec Contents: Read and write"
                onChange={(event) => setToken(event.target.value)}
              />
            </label>

            <label className="field search-field">
              <span>Recherche produit</span>
              <input
                type="search"
                value={search}
                placeholder="Creator, femme, sweat..."
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </section>

          <section className="metrics-grid" aria-label="Indicateurs de synthese">
            <article className="metric-card">
              <p>Familles suivies</p>
              <strong>{metrics.productCount}</strong>
              <span>Derniere synchro : {formatDate(productsFile.data.updatedAt)}</span>
            </article>
            <article className="metric-card">
              <p>Variantes</p>
              <strong>{metrics.variantCount}</strong>
              <span>Tailles, couleurs et lignes issues du XLS</span>
            </article>
            <article className="metric-card">
              <p>Unites en stock</p>
              <strong>{metrics.totalUnits}</strong>
              <span>{metrics.lowStockCount} variantes en seuil bas</span>
            </article>
          </section>

          <section className="feedback-strip" aria-live="polite">
            <span className={`status-pill status-${loadState}`}>Etat : {loadState}</span>
            <span className="feedback-text">
              {errorMessage || successMessage || 'Pret pour un premier mouvement de stock.'}
            </span>
            <span className={`status-pill ${hasPendingChanges ? 'status-warning' : 'status-ok'}`}>
              {hasPendingChanges ? 'Modifications non sauvegardees' : 'Repo synchronise'}
            </span>
          </section>

          <section className="workspace-grid">
            <section className="inventory-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Catalogue</p>
                  <h2>Produits importes du classeur</h2>
                </div>
                <span className="pill">Source : {productsFile.data.source || 'en attente'}</span>
              </div>

              <div className="product-grid">
                <aside className="product-list">
                  {filteredProducts.map((product) => {
                    const total = product.variants.reduce((sum, variant) => sum + variant.quantity, 0)
                    const isActive = product.id === selectedProduct?.id

                    return (
                      <button
                        className={`product-card ${isActive ? 'is-active' : ''}`}
                        key={product.id}
                        type="button"
                        onClick={() => handleSelectProduct(product)}
                      >
                        <div>
                          <p className="eyebrow">{product.category}</p>
                          <h3>{product.name}</h3>
                        </div>
                        <strong>{total}</strong>
                      </button>
                    )
                  })}
                </aside>

                <section className="detail-panel">
                  {selectedProduct ? (
                    <>
                      <div className="detail-header">
                        <div>
                          <p className="eyebrow">{selectedProduct.category}</p>
                          <h2>{selectedProduct.name}</h2>
                          <p>
                            {selectedProduct.variants.length} variantes · feuille {selectedProduct.sourceSheet}
                          </p>
                        </div>
                      </div>

                      <div className="variant-table">
                        <div className="variant-head">
                          <span>Variante</span>
                          <span>Detail</span>
                          <span>Stock</span>
                        </div>
                        {Object.entries(groupVariantsBySize(selectedProduct.variants)).map(([size, variants]) => (
                          <div key={size} style={{
                            margin: '12px 0',
                            padding: '10px 14px',
                            borderRadius: 16,
                            background: '#f5f5f5',
                            border: '1px solid #e0e0e0',
                          }}>
                            <div style={{fontWeight: 600, marginBottom: 6, color: '#1e6f5c'}}>{size}</div>
                            {variants.map((variant: any) => {
                              const low = variant.quantity <= variant.threshold
                              return (
                                <button
                                  className={`variant-row ${selectedVariant?.id === variant.id ? 'is-active' : ''}`}
                                  key={variant.id}
                                  type="button"
                                  onClick={() => setSelectedVariantId(variant.id)}
                                >
                                  <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
                                    <span style={{
                                      display: 'inline-block',
                                      width: 18,
                                      height: 18,
                                      borderRadius: '50%',
                                      border: '1px solid #bbb',
                                      background: getColorSwatch(variant.color),
                                      marginRight: 6,
                                      boxShadow: '0 1px 2px #0001',
                                    }} />
                                    {normalizeColor(variant.color)}
                                  </span>
                                  <span>{variant.detail || variant.lineLabel || 'Standard'}</span>
                                  <strong className={low ? 'stock-low' : ''}>{variant.quantity}</strong>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>Aucun produit ne correspond a la recherche.</p>
                  )}
                </section>
              </div>
            </section>

            <aside className="side-stack">
              <section className="status-card">
                <p className="eyebrow">Mouvement</p>
                <h2>Appliquer une variation</h2>
                <form className="movement-form" onSubmit={handleMovementSubmit}>
                  <label className="field">
                    <span>Variante cible</span>
                    <select
                      value={selectedVariant?.id ?? ''}
                      onChange={(event) => setSelectedVariantId(event.target.value)}
                      disabled={!selectedProduct}
                    >
                      {selectedProduct?.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.size} · {normalizeColor(variant.color)} · {variant.detail || 'standard'}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Type</span>
                    <select
                      value={draft.action}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          action: event.target.value as StockAction,
                        }))
                      }
                    >
                      <option value="sale">Sortie</option>
                      <option value="entry">Entree</option>
                      <option value="adjustment">Correction</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Quantite</span>
                    <input
                      type="number"
                      value={draft.quantity}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          quantity: Number(event.target.value),
                        }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Note</span>
                    <textarea
                      rows={3}
                      value={draft.note}
                      placeholder="Vente boutique, inventaire atelier, commande..."
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <button className="primary-action" type="submit">
                    Appliquer le mouvement
                  </button>
                </form>
              </section>

              <section className="activity-card">
                <p className="eyebrow">Journal</p>
                <h2>Derniers mouvements</h2>
                <div className="activity-list">
                  {movementRows.map((entry: StockMovement & { label: string }) => (
                    <article className="activity-row" key={entry.id}>
                      <div>
                        <h3>{entry.label}</h3>
                        <p>
                          {formatActionLabel(entry.action)}
                          {entry.note ? ` · ${entry.note}` : ''}
                        </p>
                      </div>
                      <div className="activity-meta">
                        <strong>{entry.quantity > 0 ? `+${entry.quantity}` : entry.quantity}</strong>
                        <span>{formatDate(entry.createdAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        </>
      )}
    </main>
  )
}

export default App
