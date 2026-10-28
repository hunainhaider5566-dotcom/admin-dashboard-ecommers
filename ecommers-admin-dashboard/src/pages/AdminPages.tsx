import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Archive, ArrowLeft, BarChart3, Bell, Boxes, Check, CheckCheck, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, Edit2, Eye, EyeOff, FolderTree, Image as ImageIcon, Info, LayoutDashboard, LogOut, Menu, MessageSquare, Package, Plus, Printer, RefreshCw, Search, Settings, ShieldAlert, Store, Tag, Users, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { adjustInventory, decideMarketplaceCase, deleteAdminHero, deleteAdminPromotion, deleteProductVariant, getAdminOrderDetail, getAdminProductEditor, getAdminStoreSettings, getAdminSummary, getVendorDocumentSignedUrl, listAdminCategories, listAdminAccountSuspensions, listAdminCustomers, listAdminHeroes, listAdminInventory, listAdminNotifications, listAdminOrders, listAdminProducts, listAdminPromotions, listAdminSupportTickets, listAuditLogs, listMarketplaceCases, listSellerApplications, markAdminNotificationRead, markAllAdminNotificationsRead, moderateProduct, reviewSellerApplication, saveAdminHero, saveAdminPromotion, saveCategory, saveProduct, saveProductVariant, setAdminAccountSuspension, updateAdminStoreSettings, updateAdminSupportTicket, updateOrder, updateProductStatus, uploadAdditionalProductImage, uploadPublicMedia, type AdminCase, type AdminCategory, type AdminAccountSuspension, type AdminCustomer, type AdminHero, type AdminInventory, type AdminNotification, type AdminOrder, type AdminProduct, type AdminPromotion, type AdminSeller, type AdminStoreSettings, type AdminSummary, type AdminSupportInboxTicket, type AdminVariant } from '../services/admin/adminService'
import type { Database } from '../types/database'
import { getSupabase } from '../lib/supabase'
import '../admin.css'

const nav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/heroes', label: 'Heroes', icon: ImageIcon },
  { to: '/admin/promotions', label: 'Promotions', icon: Tag },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/manual-orders', label: 'Manual Orders', icon: Plus },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/sellers', label: 'Sellers', icon: Store },
  { to: '/admin/cases', label: 'Cases', icon: MessageSquare },
  { to: '/admin/tickets', label: 'Support tickets', icon: MessageSquare },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/settings', label: 'Store settings', icon: Settings },
  { to: '/admin/audit', label: 'Audit log', icon: ShieldAlert },
]

function Loading() { return <div className="admin-state"><RefreshCw className="spin" size={20} /><span>Loading live store data…</span></div> }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="admin-state admin-state--error"><CircleAlert size={20} /><span>{message}</span><button className="admin-button admin-button--outline" onClick={retry}>Try again</button></div> }
function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="admin-empty"><Tag size={24} /><strong>{title}</strong><p>{detail}</p>{action}</div> }
function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) { return <div className="admin-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div> }
function formatMoney(value: number | string) { return `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}` }
function formatDate(value: string) { return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value)) }
function statusClass(value: string) { return `admin-status admin-status--${value.replace('_', '-')}` }

function useAutoRefresh(refresh: (quiet?: boolean) => void, intervalMs = 20000) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    let lastRun = 0
    const run = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRun < 1500) return
      lastRun = Date.now()
      refreshRef.current(true)
    }
    const timer = window.setInterval(run, intervalMs)
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', run)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', run)
    }
  }, [intervalMs])
}

function Guard({ children }: { children: ReactNode }) {
  const { loading, user, isAdmin, configured, error } = useAuth()
  if (loading) return <div className="admin-screen"><Loading /></div>
  if (!configured || !user) return <div className="admin-screen admin-screen--center"><ShieldAlert size={34} /><h1>Administrator sign-in required</h1><p>Sign in with an authorized JTBazar administrator account to continue.</p><Link className="admin-button" to="/login">Go to sign in</Link></div>
  if (error || !isAdmin) return <div className="admin-screen admin-screen--center"><ShieldAlert size={34} /><h1>Access denied</h1><p>{error ?? 'This account does not have the administrator role.'}</p><Link className="admin-button" to="/">Return to storefront</Link></div>
  return <>{children}</>
}

export function AdminPage() {
  const location = useLocation()
  const path = location.pathname
  return <Guard><AdminShell><AdminContent path={path} /></AdminShell></Guard>
}

function AdminShell({ children }: { children: ReactNode }) {
  const { displayName, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const navigate = useNavigate()
  const unreadCount = notifications.filter((item) => !item.read_at).length
  const loadNotifications = () => { void listAdminNotifications().then((items) => { setNotifications(items); setNotificationError(null) }).catch((cause: unknown) => setNotificationError(cause instanceof Error ? cause.message : 'Notifications could not be loaded.')) }
  useEffect(() => {
    loadNotifications()
    const run = () => { if (document.visibilityState === 'visible') loadNotifications() }
    const timer = window.setInterval(run, 20000)
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', run)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', run); document.removeEventListener('visibilitychange', run) }
  }, [])
  async function logout() { await signOut(); navigate('/login') }
  async function openNotification(item: AdminNotification) {
    if (!item.read_at) {
      try { await markAdminNotificationRead(item.id); setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)) }
      catch (cause) { setNotificationError(cause instanceof Error ? cause.message : 'Notification could not be marked read.') }
    }
    setNotificationsOpen(false)
    const title = item.title.toLowerCase()
    navigate(title.includes('seller') ? '/admin/sellers' : title.includes('product') ? '/admin/products' : title.includes('case') ? '/admin/cases' : item.related_order_id ? '/admin/orders' : '/admin')
  }
  async function markAllRead() {
    try { await markAllAdminNotificationsRead(); const now = new Date().toISOString(); setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now }))) }
    catch (cause) { setNotificationError(cause instanceof Error ? cause.message : 'Notifications could not be updated.') }
  }
  return <div className="admin-app">
    <aside className={`admin-sidebar ${open ? 'is-open' : ''}`}>
      <div className="admin-brand"><span className="admin-brand-mark">M</span><span>JTBazar<small>ADMIN STUDIO</small></span></div>
      <nav className="admin-nav" aria-label="Admin navigation">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/admin'} onClick={() => setOpen(false)}><Icon size={17} /><span>{label}</span></NavLink>)}</nav>
      <div className="admin-sidebar-footer"><Link to="/"><ArrowLeft size={15} /> View storefront</Link><button onClick={() => void logout()}><LogOut size={15} /> Sign out</button></div>
    </aside>
    {open && <button className="admin-overlay" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <main className="admin-main"><header className="admin-topbar"><button className="admin-menu" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={20} /></button><div><span className="admin-kicker">JTBazar operations</span><h1>{location.pathname.startsWith('/admin/manual-orders/') ? 'Manual order detail' : location.pathname.startsWith('/admin/orders/') ? 'Order detail' : nav.find((item) => location.pathname === item.to)?.label ?? 'Admin studio'}</h1></div><div className="admin-topbar-actions"><div className="admin-notification-wrap"><button type="button" className="admin-notification-button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((value) => !value); loadNotifications() }}><Bell size={19} />{unreadCount > 0 && <span className="admin-notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>{notificationsOpen && <div className="admin-notification-popover" role="dialog" aria-label="Admin notifications"><div className="admin-notification-heading"><strong>Notifications</strong><button type="button" onClick={() => void markAllRead()} disabled={!unreadCount}><CheckCheck size={14} /> Mark all read</button></div>{notificationError && <p className="admin-notification-error">{notificationError}</p>}{notifications.length === 0 ? <p className="admin-notification-empty">No activity notifications yet.</p> : notifications.map((item) => <button type="button" key={item.id} className={`admin-notification-item${item.read_at ? '' : ' is-unread'}`} onClick={() => void openNotification(item)}><span><strong>{item.title}</strong><small>{item.body}</small><small>{formatDate(item.created_at)}</small></span>{!item.read_at && <i aria-label="Unread" />}</button>)}</div>}</div><div className="admin-user"><span>{displayName ?? 'Administrator'}</span><span className="admin-avatar">{(displayName ?? 'A').slice(0, 1).toUpperCase()}</span></div></div></header>{children}</main>
  </div>
}

function AdminContent({ path }: { path: string }) {
  if (path === '/admin') return <Overview />
  if (path === '/admin/heroes') return <Heroes />
  if (path === '/admin/promotions') return <Promotions />
  if (path === '/admin/products') return <Products />
  if (path === '/admin/categories') return <Categories />
  if (path === '/admin/orders') return <Orders />
  if (path === '/admin/manual-orders') return <ManualOrders />
  if (/^\/admin\/manual-orders\/[^/]+$/.test(path)) return <ManualOrderDetailPage orderId={path.split('/').pop()!} />
  if (/^\/admin\/orders\/[^/]+$/.test(path)) return <OrderDetailPage orderId={path.split('/').pop()!} />
  if (path === '/admin/inventory') return <Inventory />
  if (path === '/admin/sellers') return <Sellers />
  if (path === '/admin/cases') return <Cases />
  if (path === '/admin/tickets') return <SupportTickets />
  if (path === '/admin/customers') return <Customers />
  if (path === '/admin/settings') return <StoreSettings />
  return <Audit />
}

function Overview() {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = () => { setError(null); void Promise.all([getAdminSummary(), listAdminOrders('', 'all', 0, 6)]).then(([nextSummary, nextOrders]) => { setSummary(nextSummary); setOrders(nextOrders.items) }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'The overview could not be loaded.')) }
  useEffect(load, [])
  useAutoRefresh(load)
  if (error) return <ErrorState message={error} retry={load} />
  if (!summary) return <Loading />
  return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">A clear view of what needs attention</p><h2>Good morning, keep things moving.</h2></div><button className="admin-button admin-button--outline" onClick={() => load()}><RefreshCw size={15} /> Refresh</button></div><div className="admin-metrics"><Metric label="All products" value={summary.total_products} note={`${summary.published_products} published`} /><Metric label="Active categories" value={summary.active_categories} /><Metric label="Pending orders" value={summary.pending_orders} note={`${summary.open_orders} open orders`} /><Metric label="Paid revenue" value={formatMoney(summary.paid_delivered_value)} note="Delivered and paid" /></div><div className="admin-grid-2"><div className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Latest activity</p><h3>Recent orders</h3></div><Link to="/admin/orders">View all <ChevronRight size={14} /></Link></div>{orders.length === 0 ? <Empty title="No orders yet" detail="Real orders will appear here once buyers complete checkout." /> : <div className="admin-list">{orders.map((order) => <Link className="admin-list-row" to="/admin/orders" key={order.id}><span><strong>{order.order_number}</strong><small>{order.customer_name} · {formatDate(order.created_at)}</small></span><span><b>{formatMoney(order.total)}</b><em className={statusClass(order.order_status)}>{order.order_status}</em></span></Link>)}</div>}</div><div className="admin-panel admin-panel--tint"><div className="admin-panel-heading"><div><p className="admin-kicker">Operational note</p><h3>Live data only</h3></div><BarChart3 size={20} /></div><p className="admin-copy">This dashboard reads the connected JTBazar Supabase project. Empty tables are shown as empty; no sample products, orders, or revenue are created.</p><div className="admin-callout"><Check size={17} /> RLS and the admin role are enforced by the database.</div></div></div></section>
}

function Products() {
  const { push } = useToast()
  const [items, setItems] = useState<AdminProduct[]>([]); const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [editing, setEditing] = useState<AdminProduct | null | undefined>(undefined); const [detailsId, setDetailsId] = useState<string | null>(null)
  const load = (quiet = false) => { if (!quiet) setLoading(true); setError(null); void listAdminProducts(search).then(setItems).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Products could not be loaded.')).finally(() => { if (!quiet) setLoading(false) }) }
  useEffect(load, [search])
  useAutoRefresh(load)
  async function setPublication(item: AdminProduct) { const next = item.publication_status === 'published' ? 'draft' : 'published'; const label = next === 'published' ? 'publish' : 'unpublish'; if (!window.confirm(`Are you sure you want to ${label} “${item.name}”?`)) return; try { await updateProductStatus(item.id, next); push(`Product ${label}ed.`); load() } catch (cause) { push(cause instanceof Error ? cause.message : 'Publication update failed.', 'error') } }
  async function archive(id: string) { if (!window.confirm('Archive this product? It will no longer be published.')) return; try { await updateProductStatus(id, 'archived'); push('Product archived.'); load() } catch (cause) { push(cause instanceof Error ? cause.message : 'Product update failed.', 'error') } }
  async function moderate(item: AdminProduct, next: AdminProduct['moderation_status']) { const reason = next === 'rejected' || next === 'hidden' ? window.prompt('Record a moderation reason', item.moderation_reason ?? '') : undefined; if ((next === 'rejected' || next === 'hidden') && reason === null) return; try { await moderateProduct(item.id, next, reason ?? undefined); push(`Product marked ${next}.`); load() } catch (cause) { push(cause instanceof Error ? cause.message : 'Moderation update failed.', 'error') } }
  return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">Catalog management</p><h2>Products</h2></div><button className="admin-button" onClick={() => setEditing(null)}><Plus size={16} /> New product</button></div><div className="admin-toolbar"><label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, SKU or slug" /></label><button className="admin-button admin-button--outline" onClick={() => load()}><RefreshCw size={15} /> Refresh</button></div>{editing !== undefined && <ProductEditor key={editing?.id ?? 'new-product'} product={editing ?? undefined} onSaved={() => { setEditing(undefined); load() }} onCancel={() => setEditing(undefined)} />}{error ? <ErrorState message={error} retry={load} /> : loading ? <Loading /> : items.length === 0 ? <Empty title="No products found" detail="Create a product when your catalog is ready. The storefront will remain empty until products are published." action={<button className="admin-button" onClick={() => setEditing(null)}><Plus size={15} /> Create product</button>} /> : <div className="admin-table-wrap"><TableTools /><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Publication</th><th>Moderation</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className="admin-product-cell">{item.image_url ? <img src={item.image_url} alt="" /> : <span className="admin-thumb"><Package size={15} /></span>}<span><strong>{item.name}</strong><small>{item.sku ?? 'No SKU'} · {item.slug}</small></span></div></td><td>{item.category?.name ?? 'Unassigned'}</td><td>{formatMoney(item.price)}</td><td>{item.track_inventory ? item.inventory : 'Not tracked'}</td><td><em className={statusClass(item.publication_status)}>{item.publication_status}</em></td><td><em className={statusClass(item.moderation_status)}>{item.moderation_status}</em></td><td><div className="admin-action-row"><button className="admin-icon-button" title="View product details" aria-label={`View ${item.name} details`} onClick={() => setDetailsId(item.id)}><Info size={15} /></button><button type="button" className="admin-small-button" title="Edit product" onClick={() => setEditing(item)}><Edit2 size={14} /> Edit</button>{item.moderation_status === 'pending_review' && <><button className="admin-small-button" onClick={() => void moderate(item, 'approved')}>Approve</button><button className="admin-small-button admin-small-button--danger" onClick={() => void moderate(item, 'rejected')}>Reject</button></>}{item.moderation_status === 'approved' && <button className="admin-small-button admin-small-button--danger" onClick={() => void moderate(item, 'hidden')}>Hide</button>}{item.publication_status !== 'archived' && <button className="admin-icon-button" title={item.publication_status === 'published' ? 'Unpublish product' : 'Publish product'} onClick={() => void setPublication(item)}>{item.publication_status === 'published' ? <EyeOff size={15} /> : <Eye size={15} />}</button>}<button className="admin-icon-button" title="Archive product" onClick={() => void archive(item.id)}><Archive size={15} /></button></div></td></tr>)}</tbody></table></div>}{detailsId && <AdminProductDetails id={detailsId} onClose={() => setDetailsId(null)} onEdit={(id) => { const product = items.find((item) => item.id === id); setDetailsId(null); if (product) setEditing(product) }} />}</section>
}

function AdminProductDetails({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (id: string) => void }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getAdminProductEditor>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { let active = true; setLoading(true); setError(null); void getAdminProductEditor(id).then((result) => { if (active) setDetail(result) }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Product details could not be loaded.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [id, attempt])
  const product = detail?.product
  return <div className="admin-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-product-title"><div className="admin-panel-heading"><div><p className="admin-kicker">Catalog record</p><h3 id="admin-product-title">{product?.name ?? 'Product details'}</h3></div><button className="admin-icon-button" aria-label="Close product details" onClick={onClose}><X size={18} /></button></div>{loading ? <Loading /> : error ? <div className="admin-state admin-state--error" role="alert"><CircleAlert size={18} />{error}<button className="admin-button admin-button--outline" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div> : !detail ? <Empty title="Product not found" detail="This product may have been removed or is no longer available to this admin account." /> : <><div className="admin-detail-gallery">{detail.images.filter((image) => image.display_url).map((image) => <img key={image.id} src={image.display_url ?? ''} alt={image.alt_text || product?.name || 'Product image'} />)}{detail.images.every((image) => !image.display_url) && <span className="admin-thumb"><Package size={24} /></span>}</div><div className="admin-drawer-section"><h4>Product information</h4><strong>{product?.name}</strong><span>{product?.description || product?.short_description || 'No description provided.'}</span><span>SKU: {product?.sku || '—'} · Slug: {product?.slug}</span><span>Category: {detail.category?.name || 'Unassigned'}</span><span>Price: {formatMoney(product?.price ?? 0)} {product?.currency}</span><span>Stock: {product?.track_inventory ? detail.inventory.reduce((sum, row) => sum + Number(row.quantity), 0) : 'Inventory not tracked'}</span></div><div className="admin-drawer-section"><h4>Publication and moderation</h4><span>Publication: {product?.publication_status}</span><span>Moderation: {product?.moderation_status}</span><span>Stock verification: {product?.stock_verification_status}</span>{product?.moderation_reason && <span>Moderation reason: {product.moderation_reason}</span>}</div><div className="admin-drawer-section"><h4>Seller</h4>{detail.seller ? <><strong>{detail.seller.shop_name} · {detail.seller.status}</strong><a href={`/shops/${detail.seller.slug}`} target="_blank" rel="noreferrer">Open public shop</a></> : <span>No seller associated.</span>}</div><div className="admin-drawer-section"><h4>Admin financial information</h4><span>Supplier cost: {product?.supplier_cost == null ? '—' : formatMoney(product.supplier_cost)}</span><span>Fulfilment expense: {formatMoney(product?.fulfillment_expense ?? 0)}</span><span>Minimum profit: {formatMoney(product?.minimum_profit ?? 0)}</span></div><div className="admin-drawer-section"><h4>Variants and stock</h4>{detail.variants.length ? detail.variants.map((variant) => { const stock = detail.inventory.find((row) => row.variant_id === variant.id); return <div className="admin-list-row" key={variant.id}><span><strong>{variant.option_label}: {variant.option_value}</strong><small>{variant.sku || 'No SKU'} · {variant.is_active ? 'Active' : 'Inactive'}</small></span><span>{variant.price_override == null ? 'Base price' : formatMoney(variant.price_override)} · Stock {stock?.quantity ?? '—'}</span></div> }) : <span>No variants.</span>}</div><div className="admin-drawer-section"><span>Created: {formatDate(product?.created_at ?? '')}</span><span>Updated: {formatDate(product?.updated_at ?? '')}</span><button className="admin-button" onClick={() => onEdit(id)}><Edit2 size={15} /> Edit product</button></div></>}</aside></div>
}

function ProductEditor({ product, onSaved, onCancel }: { product?: AdminProduct; onSaved: () => void; onCancel: () => void }) {
  const { push } = useToast(); const [categories, setCategories] = useState<AdminCategory[]>([]); const [detail, setDetail] = useState<Awaited<ReturnType<typeof getAdminProductEditor>> | null>(null); const [detailError, setDetailError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const [images, setImages] = useState<File[]>([]); const [variantRows, setVariantRows] = useState<AdminVariant[]>([])
  useEffect(() => { void listAdminCategories().then(setCategories).catch(() => undefined); if (product) void getAdminProductEditor(product.id).then((next) => { if (!next) throw new Error('Product not found.'); setDetail(next); setVariantRows(next.variants) }).catch((cause: unknown) => setDetailError(cause instanceof Error ? cause.message : 'Product details could not be loaded.')) }, [product, push])
  if (product && !detail) return <div className="admin-panel">{detailError ? <div className="admin-state admin-state--error" role="alert">{detailError}</div> : <Loading />}</div>
  const current = detail?.product ?? product
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get('name') ?? '').trim(); const slug = String(data.get('slug') ?? '').trim(); const price = Number(data.get('price')); const desiredPublicationStatus = String(data.get('publication_status') ?? 'draft') as Database['public']['Tables']['products']['Row']['publication_status']; const savePublicationStatus = desiredPublicationStatus === 'published' && (!current || current.publication_status !== 'published') ? 'draft' : desiredPublicationStatus; if (!name || !slug || !Number.isFinite(price) || price < 0) { push('Enter a valid name, slug, and non-negative price.', 'error'); return } let specifications: unknown = []; let dimensions: unknown = {}; try { specifications = JSON.parse(String(data.get('specifications') || '[]')); dimensions = JSON.parse(String(data.get('dimensions') || '{}')) } catch { push('Specifications and dimensions must be valid JSON.', 'error'); return } setSaving(true); try { const saved = await saveProduct({ name, slug, price, currency: 'PKR', short_description: String(data.get('short_description') ?? ''), description: String(data.get('description') ?? ''), publication_status: savePublicationStatus, is_featured: data.get('is_featured') === 'on', track_inventory: data.get('track_inventory') === 'on', category_id: String(data.get('category_id') || '') || null, specifications: specifications as Database['public']['Tables']['products']['Insert']['specifications'], dimensions: dimensions as Database['public']['Tables']['products']['Insert']['dimensions'], sku: String(data.get('sku') ?? '') || null, weight_grams: data.get('weight_grams') ? Number(data.get('weight_grams')) : null, seo_title: String(data.get('seo_title') ?? '') || null, seo_description: String(data.get('seo_description') ?? '') || null }, current?.id); if (!saved) throw new Error('The product was not returned after saving.'); for (const image of images) await uploadAdditionalProductImage(saved.id, image, saved.publication_status !== 'published'); for (const row of variantRows) await saveProductVariant({ product_id: saved.id, option_label: row.option_label, option_value: row.option_value, sku: row.sku, price_override: row.price_override, attributes: row.attributes, is_active: row.is_active, sort_order: row.sort_order }, row.id.startsWith('new-') ? undefined : row.id); if (desiredPublicationStatus === 'published' && saved.publication_status !== 'published') await updateProductStatus(saved.id, 'published'); push(current ? 'Product changes saved.' : 'Draft product created.'); onSaved() } catch (cause) { push(cause instanceof Error ? cause.message : 'Product could not be saved.', 'error') } finally { setSaving(false) } }
  function addVariant() { setVariantRows((rows) => [...rows, { id: `new-${crypto.randomUUID()}`, product_id: current?.id ?? '', option_label: 'Option', option_value: '', sku: null, price_override: null, attributes: {}, is_active: true, sort_order: rows.length, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]) }
  function updateVariant(id: string, patch: Partial<AdminVariant>) { setVariantRows((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row)) }
  async function removeVariant(row: AdminVariant) { if (row.id.startsWith('new-')) { setVariantRows((rows) => rows.filter((item) => item.id !== row.id)); return } if (!window.confirm('Delete this variant?')) return; try { await deleteProductVariant(row.id); setVariantRows((rows) => rows.filter((item) => item.id !== row.id)); push('Variant deleted.') } catch (cause) { push(cause instanceof Error ? cause.message : 'Variant could not be deleted.', 'error') } }
  return <form className="admin-form admin-panel" onSubmit={(event) => void submit(event)}><div className="admin-panel-heading"><div><p className="admin-kicker">{current ? 'Edit catalog record' : 'Create safely'}</p><h3>{current ? current.name : 'New product draft'}</h3></div><button type="button" className="admin-icon-button" onClick={onCancel}><X size={18} /></button></div><div className="admin-form-grid"><label>Name<input name="name" defaultValue={current?.name ?? ''} required /></label><label>Slug<input name="slug" defaultValue={current?.slug ?? ''} placeholder="lowercase-with-dashes" required /></label><label>Price (PKR)<input name="price" type="number" min="0" step="0.01" defaultValue={current?.price ?? ''} required /></label><label>SKU<input name="sku" defaultValue={current?.sku ?? ''} /></label><label>Category<select name="category_id" defaultValue={current?.category_id ?? ''}><option value="">Unassigned</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Publication<select name="publication_status" defaultValue={current?.publication_status ?? 'draft'}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label className="admin-form-span"><span>Short description</span><input name="short_description" defaultValue={current?.short_description ?? ''} /></label><label className="admin-form-span"><span>Description</span><textarea name="description" rows={5} defaultValue={current?.description ?? ''} /></label><label>Weight (grams)<input name="weight_grams" type="number" min="0" defaultValue={current?.weight_grams ?? ''} /></label><label className="admin-form-span"><span>Specifications JSON</span><textarea name="specifications" rows={3} defaultValue={JSON.stringify(current?.specifications ?? [], null, 2)} /></label><label className="admin-form-span"><span>Dimensions JSON</span><textarea name="dimensions" rows={3} defaultValue={JSON.stringify(current?.dimensions ?? {}, null, 2)} /></label><label>SEO title<input name="seo_title" defaultValue={current?.seo_title ?? ''} /></label><label>SEO description<input name="seo_description" defaultValue={current?.seo_description ?? ''} /></label>{detail?.images.length ? <div className="admin-form-span"><span>Current images</span><div className="admin-product-image-previews">{detail.images.map((image) => image.display_url ? <img key={image.id} src={image.display_url} alt={image.alt_text || current?.name || 'Product image'} /> : null)}</div></div> : null}<label className="admin-form-span"><span>Add product images (multiple; JPG, PNG, WebP or AVIF, max 10 MB each)</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setImages(Array.from(event.target.files ?? []))} />{images.length > 0 && <small>{images.length} image{images.length === 1 ? '' : 's'} selected.</small>}</label><label className="admin-check"><input name="is_featured" type="checkbox" defaultChecked={current?.is_featured ?? false} /> Featured</label><label className="admin-check"><input name="track_inventory" type="checkbox" defaultChecked={current?.track_inventory ?? true} /> Track inventory</label></div><div className="admin-variants"><div className="admin-panel-heading"><div><p className="admin-kicker">Optional product choices</p><h4>Variants</h4></div><button type="button" className="admin-small-button" onClick={addVariant}><Plus size={13} /> Add variant</button></div>{variantRows.length === 0 ? <p className="admin-copy">No variants configured. Leave this empty for a single-SKU product.</p> : variantRows.map((row) => <div className="admin-variant-row" key={row.id}><input aria-label="Option label" value={row.option_label} onChange={(event) => updateVariant(row.id, { option_label: event.target.value })} placeholder="Size" /><input aria-label="Option value" value={row.option_value} onChange={(event) => updateVariant(row.id, { option_value: event.target.value })} placeholder="A4" /><input aria-label="Variant SKU" value={row.sku ?? ''} onChange={(event) => updateVariant(row.id, { sku: event.target.value || null })} placeholder="SKU" /><input aria-label="Variant price override" type="number" min="0" step="0.01" value={row.price_override ?? ''} onChange={(event) => updateVariant(row.id, { price_override: event.target.value ? Number(event.target.value) : null })} placeholder="Price override" /><button type="button" className="admin-icon-button" onClick={() => void removeVariant(row)}><X size={15} /></button></div>)}</div><div className="admin-form-actions"><button type="button" className="admin-button admin-button--outline" onClick={onCancel}>Cancel</button><button className="admin-button" disabled={saving}>{saving ? 'Saving…' : current ? 'Save product' : 'Create draft'}</button></div></form>
}

function Categories() {
  const { push } = useToast()
  const [items, setItems] = useState<AdminCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminCategory | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = (quiet = false) => { if (!quiet) setLoading(true); setError(null); void listAdminCategories().then(setItems).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Categories could not be loaded.')).finally(() => { if (!quiet) setLoading(false) }) }
  useEffect(load, [])
  useAutoRefresh(load)
  useEffect(() => { if (!image) { setImagePreview(null); return } const url = URL.createObjectURL(image); setImagePreview(url); return () => URL.revokeObjectURL(url) }, [image])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    try {
      const imageUrl = image ? await uploadPublicMedia(image, 'categories') : editing?.image_url ?? null
      await saveCategory({ name: String(data.get('name') ?? '').trim(), slug: String(data.get('slug') ?? '').trim(), description: String(data.get('description') ?? ''), is_active: data.get('is_active') === 'on', sort_order: Number(data.get('sort_order') ?? 0), parent_id: editing?.parent_id ?? null, eyebrow: editing?.eyebrow ?? null, image_url: imageUrl, seo_title: editing?.seo_title ?? null, seo_description: editing?.seo_description ?? null }, editing?.id)
      push(editing ? 'Category updated.' : 'Category created.')
      setShowForm(false); setEditing(null); setImage(null); load()
    } catch (cause) { push(cause instanceof Error ? cause.message : 'Category could not be saved.', 'error') }
    finally { setSaving(false) }
  }
  function startEdit(item: AdminCategory) { setEditing(item); setImage(null); setShowForm(true) }
  return <section className="admin-content">
    <div className="admin-page-heading"><div><p className="admin-kicker">Collections and taxonomy</p><h2>Categories</h2></div><button className="admin-button" onClick={() => { setEditing(null); setImage(null); setShowForm(true) }}><Plus size={16} /> New category</button></div>
    {showForm && <form key={editing?.id ?? 'new-category'} className="admin-form admin-panel" onSubmit={(event) => void submit(event)}><div className="admin-form-grid">
      <label>Name<input name="name" required defaultValue={editing?.name ?? ''} /></label><label>Slug<input name="slug" required defaultValue={editing?.slug ?? ''} /></label><label>Sort order<input name="sort_order" type="number" min="0" defaultValue={editing?.sort_order ?? 0} /></label><label className="admin-check"><input name="is_active" type="checkbox" defaultChecked={editing?.is_active ?? false} /> Visible on storefront</label><label className="admin-form-span"><span>Description</span><textarea name="description" rows={3} defaultValue={editing?.description ?? ''} /></label>
      <label className="admin-form-span"><span>Category image (JPG, PNG, WebP or AVIF; max 8 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && (file.size > 8 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','image/avif'].includes(file.type))) { push('Choose a JPG, PNG, WebP or AVIF image up to 8 MB.', 'error'); event.target.value = ''; setImage(null); return } setImage(file) }} /></label>
      {(imagePreview || editing?.image_url) && <img src={imagePreview ?? editing?.image_url ?? ''} alt="Category image preview" style={{ maxWidth: 220, maxHeight: 140, objectFit: 'cover', borderRadius: 8 }} />}
    </div><div className="admin-form-actions"><button type="button" className="admin-button admin-button--outline" onClick={() => { setShowForm(false); setEditing(null); setImage(null) }}>Cancel</button><button className="admin-button" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save category' : 'Create category'}</button></div></form>}
    {error ? <ErrorState message={error} retry={load} /> : loading ? <Loading /> : items.length === 0 ? <Empty title="No categories yet" detail="Create your first live category, then assign products to it." /> : <div className="admin-table-wrap"><TableTools /><table className="admin-table"><thead><tr><th>Name</th><th>Slug</th><th>Visibility</th><th>Order</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.description || 'No description'}</small></td><td>{item.slug}</td><td><em className={statusClass(item.is_active ? 'active' : 'hidden')}>{item.is_active ? 'active' : 'hidden'}</em></td><td>{item.sort_order}</td><td>{formatDate(item.updated_at)}</td><td><button type="button" className="admin-small-button" onClick={() => startEdit(item)}><Edit2 size={14} /> Edit</button></td></tr>)}</tbody></table></div>}
  </section>
}

function TableTools() {
  const [term, setTerm] = useState('')
  const [sortIndex, setSortIndex] = useState('')
  const [descending, setDescending] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const host = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const table = host.current?.parentElement?.querySelector<HTMLTableElement>('table.admin-table')
    const body = table?.tBodies[0]
    if (!body) return
    const applyRows = () => {
    const allRows = Array.from(body.rows)
    let rows = allRows.filter((row) => row.innerText.toLowerCase().includes(term.trim().toLowerCase()))
    if (sortIndex !== '') {
      const index = Number(sortIndex)
      rows = [...rows].sort((a, b) => {
        const left = a.cells[index]?.innerText.trim() ?? ''
        const right = b.cells[index]?.innerText.trim() ?? ''
        const leftNum = Number(left.replace(/[^0-9.-]/g, ''))
        const rightNum = Number(right.replace(/[^0-9.-]/g, ''))
        const result = Number.isFinite(leftNum) && Number.isFinite(rightNum) && left && right ? leftNum - rightNum : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
        return descending ? -result : result
      })
    }
    const start = page * pageSize
    const visible = new Set(rows.slice(start, start + pageSize))
    allRows.forEach((row) => { row.style.display = visible.has(row) ? '' : 'none' })
    }
    applyRows()
    const observer = new MutationObserver(applyRows)
    observer.observe(body, { childList: true })
    return () => observer.disconnect()
  }, [term, sortIndex, descending, page, pageSize])
  const table = host.current?.parentElement?.querySelector<HTMLTableElement>('table.admin-table')
  const headings = table?.tHead?.rows[0] ? Array.from(table.tHead.rows[0].cells).map((cell, index) => ({ label: cell.innerText.trim(), index })).filter(({ label }) => label && !['actions', 'next action'].includes(label.toLowerCase())) : []
  const rowCount = table?.tBodies[0]?.rows.length ?? 0
  const filteredCount = table?.tBodies[0] ? Array.from(table.tBodies[0].rows).filter((row) => row.innerText.toLowerCase().includes(term.trim().toLowerCase())).length : rowCount
  const pages = Math.max(1, Math.ceil(filteredCount / pageSize))
  return <div ref={host} className="admin-table-tools">
    <div className="admin-table-tools__main">
      <label className="admin-search admin-table-tools__search"><Search size={16} /><input aria-label="Filter table rows" value={term} onChange={(event) => { setTerm(event.target.value); setPage(0) }} placeholder="Search records in this table" /></label>
      <div className="admin-table-tools__options">
        <label className="admin-table-sort"><span>Sort by</span><select aria-label="Sort table" value={sortIndex} onChange={(event) => { setSortIndex(event.target.value); setPage(0) }}><option value="">Default order</option>{mounted && headings.map(({ label, index }) => <option key={index} value={index}>{label}</option>)}</select></label>
        <label className="admin-table-sort"><span>Direction</span><select aria-label="Sort direction" value={descending ? 'desc' : 'asc'} onChange={(event) => setDescending(event.target.value === 'desc')}><option value="desc">Newest / Z–A</option><option value="asc">Oldest / A–Z</option></select></label>
        <label className="admin-table-sort"><span>Rows</span><select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0) }}><option value={10}>10 rows</option><option value={25}>25 rows</option><option value={50}>50 rows</option></select></label>
      </div>
    </div>
    <div className="admin-table-tools__footer"><span className="admin-table-count">{filteredCount ? `Showing ${page * pageSize + 1}–${Math.min(filteredCount, (page + 1) * pageSize)} of ${filteredCount}` : 'No matching records'}</span><div className="admin-table-tools__pagination"><span>Page {page + 1} of {pages}</span><button type="button" className="admin-icon-button" aria-label="Previous table page" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /></button><button type="button" className="admin-icon-button" aria-label="Next table page" disabled={page + 1 >= pages} onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}><ChevronRight size={15} /></button></div></div>
  </div>
}

function Pagination({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize: (size: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <div className="admin-pagination"><span>{total ? `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} of ${total}` : '0 results'}</span><label>Rows <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><button className="admin-icon-button" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={15} /></button><span>Page {page + 1} / {pages}</span><button className="admin-icon-button" aria-label="Next page" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={15} /></button></div>
}

function Orders() {
  const { push } = useToast(); const [items, setItems] = useState<AdminOrder[]>([]); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [sort, setSort] = useState('created_at.desc'); const [page, setPage] = useState(0); const [pageSize, setPageSize] = useState(25); const [total, setTotal] = useState(0); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true)
  const load = (quiet = false) => { if (!quiet) setLoading(true); setError(null); void listAdminOrders(search, status, page, pageSize, sort).then((result) => { setItems(result.items); setTotal(result.count) }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Orders could not be loaded.')).finally(() => { if (!quiet) setLoading(false) }) }
  useEffect(load, [search, status, sort, page, pageSize]); useAutoRefresh(load)
  async function changeStatus(order: AdminOrder, next: Database['public']['Tables']['orders']['Row']['order_status']) { if (next === 'cancelled' && !window.confirm(`Cancel order ${order.order_number}?`)) return; try { await updateOrder(order.id, next); push(`Order ${order.order_number} updated.`, 'success'); load() } catch (cause) { push(cause instanceof Error ? cause.message : 'The database rejected this transition.', 'error') } }
  return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">Fulfilment workflow</p><h2>Orders</h2><p className="admin-copy">Search and filter orders; open any order for full details or a printable slip.</p></div></div><div className="admin-toolbar"><label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search order or customer" /></label><select aria-label="Filter order status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="all">All statuses</option>{['pending','confirmed','processing','shipped','delivered','cancelled'].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Sort orders" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0) }}><option value="created_at.desc">Newest first</option><option value="created_at.asc">Oldest first</option><option value="total.desc">Highest total</option><option value="total.asc">Lowest total</option></select><button className="admin-button admin-button--outline" onClick={() => load()}><RefreshCw size={15} /> Refresh</button></div>{error ? <ErrorState message={error} retry={load} /> : loading ? <Loading /> : items.length === 0 ? <Empty title="No orders found" detail="Try a different search or status filter." /> : <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Next action</th></tr></thead><tbody>{items.map((order) => <tr key={order.id}><td><Link className="admin-link-button" to={`/admin/orders/${order.id}`}><strong>{order.order_number}</strong><small>{formatDate(order.created_at)}</small></Link></td><td>{order.customer_name}<small>{order.customer_phone}</small></td><td>{formatMoney(order.total)}</td><td><em className={statusClass(order.payment_status)}>{order.payment_status}</em></td><td><em className={statusClass(order.order_status)}>{order.order_status}</em></td><td><div className="admin-action-row">{order.order_status === 'pending' && <button className="admin-small-button" onClick={() => void changeStatus(order, 'confirmed')}>Confirm</button>}{order.order_status === 'confirmed' && <button className="admin-small-button" onClick={() => void changeStatus(order, 'processing')}>Process</button>}{order.order_status === 'processing' && <button className="admin-small-button" onClick={() => void changeStatus(order, 'shipped')}>Ship</button>}{order.order_status === 'shipped' && <button className="admin-small-button" onClick={() => void changeStatus(order, 'delivered')}>Deliver</button>}{['pending','confirmed','processing'].includes(order.order_status) && <button className="admin-small-button admin-small-button--danger" onClick={() => void changeStatus(order, 'cancelled')}>Cancel</button>}</div></td></tr>)}</tbody></table></div><Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(size) => { setPage(0); setPageSize(size) }} /></>}</section>
}

function OrderDetailPage({ orderId }: { orderId: string }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getAdminOrderDetail>> | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); setError(null); void getAdminOrderDetail(orderId).then(setDetail).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Order details could not be loaded.')).finally(() => setLoading(false)) }
  useEffect(load, [orderId])
  if (loading) return <div className="admin-content"><Loading /></div>
  if (error || !detail) return <div className="admin-content"><ErrorState message={error ?? 'Order not found.'} retry={load} /></div>
  const { order, items } = detail
  const shipping = order.shipping_address_snapshot && typeof order.shipping_address_snapshot === 'object' && !Array.isArray(order.shipping_address_snapshot) ? order.shipping_address_snapshot as Record<string, unknown> : {}
  const address = ['address_line_1', 'address_line_2', 'city', 'province', 'postal_code'].map((key) => shipping[key]).filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join(', ') || '—'
  return <section className="admin-content">
    <div className="admin-page-heading no-print"><div><p className="admin-kicker">Order management</p><h2>{order.order_number}</h2></div><div className="admin-action-row"><Link className="admin-button admin-button--outline" to="/admin/orders"><ArrowLeft size={15} /> All orders</Link><button className="admin-button" onClick={() => window.print()}><Printer size={15} /> Print order slip</button></div></div>
    <div className="admin-grid-2 no-print"><div className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Buyer & delivery</p><h3>{order.customer_name}</h3></div><em className={statusClass(order.order_status)}>{order.order_status}</em></div><p>{order.customer_email ?? 'No email'} · {order.customer_phone}</p><p className="admin-copy">{address}</p>{order.customer_note && <p className="admin-callout">{order.customer_note}</p>}</div><div className="admin-panel"><p className="admin-kicker">Payment & totals</p><h3>{formatMoney(order.total)}</h3><p>{order.payment_method.toUpperCase()} · {order.payment_status}</p><p className="admin-copy">Subtotal {formatMoney(order.subtotal)} · Delivery {formatMoney(order.delivery_fee)} · Discount {formatMoney(order.discount_amount)}</p><small>Placed {formatDate(order.created_at)} · Updated {formatDate(order.updated_at)}</small></div></div>
    <article className="admin-order-slip">
      <header className="slip-brand"><div className="slip-brand__identity"><img className="slip-logo" src="/jtbazar-logo.webp" alt="JTBazar" /><small>ORDER PACKING SLIP</small></div><div className="slip-brand__order"><small>ORDER NUMBER</small><b>{order.order_number}</b></div></header>
      <div className="slip-columns"><section><h3>Ship to</h3><strong>{order.customer_name}</strong><p>{order.customer_phone}</p><p>{address}</p>{typeof shipping.delivery_instructions === 'string' && shipping.delivery_instructions && <small>Delivery note: {shipping.delivery_instructions}</small>}{order.delivery_location_name && <small className="slip-location">{order.delivery_location_name}</small>}</section><section><h3>Order info</h3><p><b>Order date</b><span>{formatDate(order.created_at)}</span></p><p><b>Payment</b><span>{order.payment_method.toUpperCase()} · {order.payment_status}</span></p><p><b>Order status</b><span className="slip-status">{order.order_status}</span></p></section></div>
      <div className="slip-items"><table><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{items.map((item) => { const variant = item.variant_snapshot && typeof item.variant_snapshot === 'object' && !Array.isArray(item.variant_snapshot) ? Object.entries(item.variant_snapshot as Record<string, unknown>).filter(([, value]) => value != null && String(value).trim()).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : ''; return <tr key={item.id}><td><strong>{item.product_name_snapshot}</strong><small>{item.seller_name_snapshot ?? 'Marketplace seller'}{variant ? ` · ${variant}` : ''}</small></td><td>{item.sku_snapshot ?? '—'}</td><td>{item.quantity}</td><td>{formatMoney(item.unit_price)}</td><td>{formatMoney(item.line_total)}</td></tr> })}</tbody></table></div>
      <div className="slip-total"><span>Subtotal</span><b>{formatMoney(order.subtotal)}</b><span>Delivery</span><b>{formatMoney(order.delivery_fee)}</b><span>Discount</span><b>− {formatMoney(order.discount_amount)}</b><strong>Grand total</strong><strong>{formatMoney(order.total)}</strong></div>
      <footer><strong>Thank you for shopping with JTBazar.</strong><span>We appreciate your order.</span></footer>
    </article>
  </section>
}


function Inventory() {
  const { push } = useToast()
  const [items, setItems] = useState<AdminInventory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const load = (quiet = false) => { if (!quiet) setLoading(true); setError(null); void listAdminInventory().then(setItems).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Inventory could not be loaded.')).finally(() => { if (!quiet) setLoading(false) }) }
  useEffect(load, [])
  useAutoRefresh(load)
  function startAdjust(item: AdminInventory) { setEditingId(item.id); setQuantity(String(item.quantity)); setNote('') }
  async function saveAdjustment(event: FormEvent<HTMLFormElement>, item: AdminInventory) {
    event.preventDefault()
    const value = Number(quantity)
    if (!Number.isInteger(value) || value < 0) { setError('Quantity must be a whole number of zero or more.'); return }
    if (!note.trim()) { setError('Add a reason for this stock adjustment.'); return }
    setSaving(true); setError(null)
    try { await adjustInventory(item.id, value, note.trim()); setEditingId(null); setNote(''); push('Inventory updated.'); load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Inventory update failed.') }
    finally { setSaving(false) }
  }
  return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">Stock control</p><h2>Inventory</h2></div><button type="button" className="admin-button admin-button--outline" onClick={() => load()}><RefreshCw size={15} /> Refresh</button></div>{error ? <ErrorState message={error} retry={load} /> : loading ? <Loading /> : items.length === 0 ? <Empty title="No inventory records" detail="Inventory records are created when products are configured for tracking." /> : <div className="admin-table-wrap"><TableTools /><table className="admin-table"><thead><tr><th>Product</th><th>Variant</th><th>Quantity</th><th>Threshold</th><th>Updated</th><th>Adjust</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.product_name}</strong></td><td>{item.variant_name ?? 'Base product'}</td><td><strong className={item.low_stock_threshold !== null && item.quantity <= item.low_stock_threshold ? 'admin-low-stock' : ''}>{item.quantity}</strong></td><td>{item.low_stock_threshold ?? '—'}</td><td>{formatDate(item.updated_at)}</td><td>{editingId === item.id ? <form className="admin-inline-adjust" onSubmit={(event) => void saveAdjustment(event, item)}><label><span className="sr-only">New quantity</span><input type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span className="sr-only">Adjustment reason</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason" required /></label><button type="submit" className="admin-small-button" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button type="button" className="admin-small-button" onClick={() => setEditingId(null)}>Cancel</button></form> : <button type="button" className="admin-small-button" onClick={() => startAdjust(item)}>Adjust</button>}</td></tr>)}</tbody></table></div>}</section>
}

function Sellers() { const { push } = useToast(); const [items, setItems] = useState<AdminSeller[]>([]); const [status, setStatus] = useState('all'); const [error, setError] = useState<string | null>(null); const load = () => void listSellerApplications(status).then(setItems).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Seller applications could not be loaded.')); useEffect(load, [status]); useAutoRefresh(load); async function review(item: AdminSeller, next: AdminSeller['status']) { const reason = next === 'rejected' || next === 'suspended' ? window.prompt('Record a review reason', item.rejection_reason ?? '') : undefined; if ((next === 'rejected' || next === 'suspended') && reason === null) return; try { const result = await reviewSellerApplication(item.id, next, reason ?? undefined); const emailed = next === 'approved' ? (result as { email_sent?: boolean }).email_sent : undefined; push(next === 'approved' && !emailed ? 'Seller approved, but the approval email could not be sent.' : `Seller ${next}${emailed ? ' and approval email sent' : ''}.`, next === 'approved' && !emailed ? 'error' : 'success'); load() } catch (cause) { push(cause instanceof Error ? cause.message : 'Seller review failed.', 'error') } } return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">Marketplace governance</p><h2>Seller applications</h2></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option><option value="all">All</option></select></div>{error ? <ErrorState message={error} retry={load} /> : items.length === 0 ? <Empty title="No seller applications" detail="Change the filter to Pending to focus on applications awaiting review." /> : <div className="admin-table-wrap"><TableTools /><table className="admin-table"><thead><tr><th>Shop</th><th>Contact</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.shop_name}</strong><small>{item.slug}<br />{item.description || 'No description'}</small></td><td>{item.contact_email ?? '-'}{item.phone && <small>{item.phone}</small>}<SellerDocumentLink path={item.document_path} /></td><td><em className={statusClass(item.status)}>{item.status}</em></td><td>{formatDate(item.created_at)}</td><td><div className="admin-action-row">{item.status === 'pending' && <><button className="admin-small-button" onClick={() => void review(item, 'approved')}>Approve</button><button className="admin-small-button admin-small-button--danger" onClick={() => void review(item, 'rejected')}>Reject</button></>}{item.status === 'approved' && <button className="admin-small-button admin-small-button--danger" onClick={() => void review(item, 'suspended')}>Suspend</button>}{item.status === 'suspended' && <button className="admin-small-button" onClick={() => void review(item, 'approved')}>Reactivate</button>}</div></td></tr>)}</tbody></table></div>}</section> }

function Cases() { const { push } = useToast(); const [items, setItems] = useState<AdminCase[]>([]); const [status, setStatus] = useState('all'); const [error, setError] = useState<string | null>(null); const load = () => void listMarketplaceCases(status).then(setItems).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Marketplace cases could not be loaded.')); useEffect(load, [status]); useAutoRefresh(load); async function decide(item: AdminCase, next: AdminCase['status']) { const decision = window.prompt('Record the administrative decision', item.admin_decision ?? ''); if (!decision) return; try { await decideMarketplaceCase(item.id, next, decision); push('Case decision recorded.'); load() } catch (cause) { push(cause instanceof Error ? cause.message : 'Case decision failed.', 'error') } } return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">Returns, refunds and complaints</p><h2>Marketplace cases</h2></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="seller_responded">Seller responded</option><option value="under_review">Under review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="resolved">Resolved</option></select></div>{error ? <ErrorState message={error} retry={load} /> : items.length === 0 ? <Empty title="No cases" detail="Buyer returns, refund requests and complaints will appear here once the marketplace workflow is enabled." /> : <div className="admin-table-wrap"><TableTools /><table className="admin-table"><thead><tr><th>Type</th><th>Reason</th><th>Status</th><th>Opened</th><th>Decision</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><em className={statusClass(item.case_type)}>{item.case_type}</em></td><td>{item.reason}</td><td><em className={statusClass(item.status)}>{item.status}</em></td><td>{formatDate(item.created_at)}</td><td>{!['resolved', 'rejected'].includes(item.status) && <div className="admin-action-row"><button className="admin-small-button" onClick={() => void decide(item, 'approved')}>Approve</button><button className="admin-small-button" onClick={() => void decide(item, 'rejected')}>Reject</button></div>}{item.admin_decision && <small>{item.admin_decision}</small>}</td></tr>)}</tbody></table></div>}</section> }

function SupportTickets() {
  const { push } = useToast()
  const [items, setItems] = useState<AdminSupportInboxTicket[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = () => { setError(null); void listAdminSupportTickets().then(setItems).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Support tickets could not be loaded.')) }
  useEffect(load, [])
  useAutoRefresh(load)
  async function save(item: AdminSupportInboxTicket, form: HTMLFormElement) {
    const data = new FormData(form)
    try { const emailed = await updateAdminSupportTicket(item, String(data.get('status')) as AdminSupportInboxTicket['status'], String(data.get('admin_response') ?? '')); push(emailed ? 'Ticket updated and reply emailed.' : 'Ticket updated. Email notification could not be sent.', emailed ? 'success' : 'error'); load() }
    catch (cause) { push(cause instanceof Error ? cause.message : 'Ticket update failed.', 'error') }
  }
  return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">Customer and seller inbox</p><h2>Support tickets</h2></div><button className="admin-button admin-button--outline" onClick={() => load()}><RefreshCw size={15} /> Refresh</button></div>{error ? <ErrorState message={error} retry={load} /> : items.length === 0 ? <Empty title="No support tickets" detail="Customer and seller support requests will appear here." /> : <div className="admin-table-wrap"><TableTools /><table className="admin-table"><thead><tr><th>Requester</th><th>Subject</th><th>Request</th><th>Status</th><th>Marketplace reply</th><th>Action</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.ticket_kind}-${item.id}`}><td><strong>{item.requester_name}</strong><small>{item.ticket_kind} · {item.requester_email}</small></td><td><strong>{item.subject}</strong><small>{formatDate(item.created_at)}</small></td><td>{item.message}</td><td><select name="status" defaultValue={item.status} form={`support-ticket-${item.ticket_kind}-${item.id}`}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></td><td><textarea name="admin_response" form={`support-ticket-${item.ticket_kind}-${item.id}`} defaultValue={item.admin_response ?? ''} rows={3} /></td><td><form id={`support-ticket-${item.ticket_kind}-${item.id}`} onSubmit={(event) => { event.preventDefault(); void save(item, event.currentTarget) }}><button className="admin-small-button">Save reply</button></form></td></tr>)}</tbody></table></div>}</section>
}

function Customers() {
  const { push } = useToast()
  const [items, setItems] = useState<AdminCustomer[]>([])
  const [suspensions, setSuspensions] = useState<Map<string, AdminAccountSuspension>>(new Map())
  const [target, setTarget] = useState<AdminCustomer | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<AdminCustomer | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suspensionsAvailable, setSuspensionsAvailable] = useState(true)
  const [suspensionsError, setSuspensionsError] = useState<string | null>(null)
  const load = () => {
    setError(null)
    void Promise.allSettled([listAdminCustomers(), listAdminAccountSuspensions()]).then(([customersResult, suspensionsResult]) => {
      if (customersResult.status === 'rejected') { setError(customersResult.reason instanceof Error ? customersResult.reason.message : 'Customers could not be loaded.'); return }
      setItems(customersResult.value)
      if (suspensionsResult.status === 'fulfilled') {
        setSuspensions(new Map(suspensionsResult.value.map((row) => [row.user_id, row])))
        setSuspensionsAvailable(true)
        setSuspensionsError(null)
      } else {
        setSuspensions(new Map())
        setSuspensionsAvailable(false)
        setSuspensionsError(suspensionsResult.reason instanceof Error ? suspensionsResult.reason.message : String(suspensionsResult.reason ?? 'Unknown Supabase error'))
      }
    })
  }
  useEffect(load, []); useAutoRefresh(load)
  async function suspend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!target || reason.trim().length < 5) return
    setSaving(true)
    try { const result = await setAdminAccountSuspension(target.id, 'suspend', reason.trim()); push(result.email_sent ? 'Account suspended and notice emailed. Customer and vendor access are blocked.' : 'Account suspended, but the email notice could not be sent.', result.email_sent ? 'success' : 'error'); setTarget(null); setReason(''); load() }
    catch (cause) { push(cause instanceof Error ? cause.message : 'Account could not be suspended.', 'error') }
    finally { setSaving(false) }
  }
  async function restore() {
    if (!restoreTarget) return
    setSaving(true)
    try { const result = await setAdminAccountSuspension(restoreTarget.id, 'restore'); push(result.email_sent ? 'Account restored and notice emailed.' : 'Account restored, but the email notice could not be sent.', result.email_sent ? 'success' : 'error'); setRestoreTarget(null); load() }
    catch (cause) { push(cause instanceof Error ? cause.message : 'Account could not be restored.', 'error') }
    finally { setSaving(false) }
  }
  return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">Authorized customer records</p><h2>Customers</h2><p className="admin-copy">Suspend the shared sign-in to block both customer and vendor access for the same person.</p></div><button type="button" className="admin-button admin-button--outline" onClick={load}><RefreshCw size={15} /> Refresh</button></div>{!suspensionsAvailable && <div className="admin-inline-notice" role="status">Account suspension check failed: {suspensionsError ?? 'Unknown Supabase error'}. Customer records remain available. Confirm the migration and admin permissions.</div>}{error ? <ErrorState message={error} retry={load} /> : items.length === 0 ? <Empty title="No customer profiles" detail="Customer profiles will appear here after real accounts are created through Supabase Auth." /> : <div className="admin-table-wrap"><TableTools /><table className="admin-table"><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Orders</th><th>Lifetime value</th><th>Joined</th><th>Account access</th><th>Action</th></tr></thead><tbody>{items.map((item) => { const suspension = suspensions.get(item.id); return <tr key={item.id}><td><div className="admin-product-cell"><span className="admin-avatar">{(item.full_name ?? 'C').slice(0, 1).toUpperCase()}</span><span><strong>{item.full_name ?? 'Unnamed customer'}</strong><small>{item.email ?? 'No email on file'}</small></span></div></td><td>{item.email ?? '—'}</td><td>{item.phone ?? '—'}</td><td>{item.order_count}</td><td>{formatMoney(item.lifetime_value)}</td><td>{formatDate(item.created_at)}</td><td>{suspension ? <><em className={statusClass('suspended')}>Suspended</em><small title={suspension.reason}>{suspension.reason}</small></> : <em className={statusClass('active')}>Active</em>}</td><td>{suspension ? <button type="button" className="admin-small-button" onClick={() => setRestoreTarget(item)}>Restore access</button> : <button type="button" className="admin-small-button admin-small-button--danger" disabled={!suspensionsAvailable} title={!suspensionsAvailable ? 'Apply the account-suspensions migration first' : undefined} onClick={() => { setReason(''); setTarget(item) }}><ShieldAlert size={14} /> Suspend</button>}</td></tr> })}</tbody></table></div>}
    {target && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setTarget(null) }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="suspend-title"><div className="admin-panel-heading"><div><p className="admin-kicker">Block account access</p><h3 id="suspend-title">Suspend {target.full_name || target.email || 'this account'}?</h3></div><button type="button" className="admin-icon-button" aria-label="Close suspension dialog" disabled={saving} onClick={() => setTarget(null)}><X size={17} /></button></div><p className="admin-copy">This blocks sign-in for this user, including both customer and vendor features. Record a reason for the admin log and account notice.</p><form onSubmit={(event) => void suspend(event)}><label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={1000} rows={4} required placeholder="Explain why access is being suspended…" /></label><div className="admin-form-actions"><button type="button" className="admin-button admin-button--outline" disabled={saving} onClick={() => setTarget(null)}>Cancel</button><button className="admin-button admin-button--danger" disabled={saving || reason.trim().length < 5}>{saving ? 'Suspending…' : 'Confirm suspension'}</button></div></form></section></div>}
    {restoreTarget && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setRestoreTarget(null) }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="restore-title"><div className="admin-panel-heading"><div><p className="admin-kicker">Restore sign-in</p><h3 id="restore-title">Restore {restoreTarget.full_name || restoreTarget.email || 'this account'}?</h3></div><button type="button" className="admin-icon-button" aria-label="Close restore dialog" disabled={saving} onClick={() => setRestoreTarget(null)}><X size={17} /></button></div><p className="admin-copy">This restores access to the shared account and its customer and vendor features.</p><div className="admin-form-actions"><button type="button" className="admin-button admin-button--outline" disabled={saving} onClick={() => setRestoreTarget(null)}>Cancel</button><button type="button" className="admin-button" disabled={saving} onClick={() => void restore()}>{saving ? 'Restoring…' : 'Restore access'}</button></div></section></div>}
  </section>
}

function SellerDocumentLink({ path }: { path: string | null }) {
  const { push } = useToast()
  const [opening, setOpening] = useState(false)
  async function open() {
    if (!path) return
    setOpening(true)
    try {
      const url = await getVendorDocumentSignedUrl(path)
      if (!url) throw new Error('A signed document link could not be created.')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      push(cause instanceof Error ? cause.message : 'The verification document could not be opened.', 'error')
    } finally { setOpening(false) }
  }
  if (!path) return <small>No verification document uploaded</small>
  return <button className="admin-small-button" onClick={() => void open()} disabled={opening}>{opening ? 'Opening…' : 'View document'}</button>
}

function StoreSettings() {
  const { push } = useToast()
  const [settings, setSettings] = useState<AdminStoreSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const load = () => { setError(null); void getAdminStoreSettings().then(setSettings).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Store settings could not be loaded.')) }
  useEffect(load, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const deliveryFee = Number(data.get('delivery_fee'))
    const returnWindowDays = Number(data.get('return_window_days'))
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) { push('Delivery fee must be zero or more.', 'error'); return }
    if (!Number.isInteger(returnWindowDays) || returnWindowDays < 0) { push('Return window must be a whole number of days.', 'error'); return }
    setSaving(true)
    try {
      const next = await updateAdminStoreSettings({ store_name: String(data.get('store_name') ?? '').trim(), support_email: String(data.get('support_email') ?? '').trim() || null, support_phone: String(data.get('support_phone') ?? '').trim() || null, support_whatsapp: String(data.get('support_whatsapp') ?? '').trim() || null, delivery_fee: deliveryFee, cod_enabled: data.get('cod_enabled') === 'on', return_window_days: returnWindowDays })
      setSettings(next); push('Store settings saved. Storefront visitors will see the updated values on their next visit.')
    } catch (cause) { push(cause instanceof Error ? cause.message : 'Store settings could not be saved.', 'error') } finally { setSaving(false) }
  }
  if (error) return <ErrorState message={error} retry={load} />
  if (!settings) return <Loading />
  return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">Storefront defaults and contact details</p><h2>Store settings</h2></div></div><form className="admin-form admin-panel" onSubmit={(event) => void submit(event)}><div className="admin-panel-heading"><div><h3>Public store configuration</h3><p className="admin-copy">These values are read by the storefront checkout, footer and help pages. Delivery fee and cash-on-delivery availability are enforced again by the database when an order is placed.</p></div></div><div className="admin-form-grid"><label className="admin-form-span">Store name<input name="store_name" defaultValue={settings.store_name} maxLength={160} required /></label><label>Support email<input name="support_email" type="email" defaultValue={settings.support_email ?? ''} placeholder="support@example.com" /></label><label>Support phone<input name="support_phone" defaultValue={settings.support_phone ?? ''} placeholder="+92 300 0000000" /></label><label>Support WhatsApp<input name="support_whatsapp" defaultValue={settings.support_whatsapp ?? ''} placeholder="+92 300 0000000" /></label><label>Delivery fee (PKR)<input name="delivery_fee" type="number" min="0" step="0.01" defaultValue={settings.delivery_fee} required /></label><label>Return window (days)<input name="return_window_days" type="number" min="0" step="1" defaultValue={settings.return_window_days} required /></label><label className="admin-check"><input name="cod_enabled" type="checkbox" defaultChecked={settings.cod_enabled} /> Cash on delivery available</label></div><div className="admin-form-actions"><button className="admin-button" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button></div></form></section>
}

function Audit() { const [items, setItems] = useState<Array<{ id: string; action: string; entity: string; entity_id: string | null; created_at: string }>>([]); const [error, setError] = useState<string | null>(null); const load = () => void listAuditLogs().then(setItems).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Audit log could not be loaded.')); useEffect(load, []); useAutoRefresh(load); return <section className="admin-content"><div className="admin-page-heading"><div><p className="admin-kicker">Sensitive changes</p><h2>Audit log</h2></div></div>{error ? <ErrorState message={error} retry={load} /> : items.length === 0 ? <Empty title="No audit events" detail="Product, category, inventory, note, and order status changes will be recorded by database triggers." /> : <div className="admin-table-wrap"><TableTools /><table className="admin-table"><thead><tr><th>Action</th><th>Entity</th><th>Entity ID</th><th>When</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><em className={statusClass(item.action.toLowerCase())}>{item.action}</em></td><td>{item.entity}</td><td className="admin-mono">{item.entity_id ?? '—'}</td><td>{formatDate(item.created_at)}</td></tr>)}</tbody></table></div>}</section> }

function Promotions() {
  const { push } = useToast()
  const [items, setItems] = useState<AdminPromotion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingPromo, setEditingPromo] = useState<AdminPromotion | null>(null)
  const [promoImages, setPromoImages] = useState<string[]>([])
  const [uploadingPromoImages, setUploadingPromoImages] = useState(false)

  const load = (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    void listAdminPromotions()
      .then(setItems)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Promotions could not be loaded.'))
      .finally(() => { if (!quiet) setLoading(false) })
  }

  useEffect(load, [])
  useAutoRefresh(load)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    try {
      await saveAdminPromotion(
        {
          title: String(data.get('title') ?? '').trim(),
          description: String(data.get('description') ?? '').trim() || null,
          banner_image_url: promoImages[0] ?? null,
          banner_image_urls: promoImages,
          cta_text: String(data.get('cta_text') ?? '').trim() || null,
          cta_destination: String(data.get('cta_destination') ?? '').trim() || null,
          is_platform_wide: data.get('is_platform_wide') === 'on',
          status: String(data.get('status') ?? 'approved') as AdminPromotion['status'],
          display_position: String(data.get('display_position') ?? 'hero_banner'),
          priority: Number(data.get('priority') ?? 0),
          coupon_code: String(data.get('coupon_code') ?? '').trim() || null,
          discount_percent: data.get('discount_percent') ? Number(data.get('discount_percent')) : null,
        },
        editingPromo?.id
      )
      push('Promotion campaign saved.')
      setShowForm(false)
      setEditingPromo(null)
      load()
    } catch (cause) {
      push(cause instanceof Error ? cause.message : 'Promotion could not be saved.', 'error')
    }
  }

  async function removePromo(id: string) {
    if (!window.confirm('Delete this promotional campaign?')) return
    try {
      await deleteAdminPromotion(id)
      push('Promotion deleted.')
      load()
    } catch (cause) {
      push(cause instanceof Error ? cause.message : 'Delete failed.', 'error')
    }
  }

  return (
    <section className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">Campaign management</p>
          <h2>Promotions & Offers</h2>
        </div>
        <button
          className="admin-button"
          onClick={() => {
            setEditingPromo(null)
            setPromoImages([])
            setShowForm(true)
          }}
        >
          <Plus size={16} /> New platform campaign
        </button>
      </div>

      {(showForm || editingPromo) && (
        <form className="admin-form admin-panel" onSubmit={(event) => void submit(event)}>
          <div className="admin-panel-heading">
            <h3>{editingPromo ? 'Edit campaign' : 'New platform promotion'}</h3>
            <button
              type="button"
              className="admin-icon-button"
              onClick={() => {
                setShowForm(false)
                setEditingPromo(null)
                setPromoImages([])
              }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="admin-form-grid">
            <label>
              Title <input name="title" defaultValue={editingPromo?.title ?? ''} required />
            </label>
            <label>
              Coupon code <input name="coupon_code" defaultValue={editingPromo?.coupon_code ?? ''} placeholder="e.g. SAVE20" />
            </label>
            <label>
              Discount % <input name="discount_percent" type="number" min="0" max="100" defaultValue={editingPromo?.discount_percent ?? ''} placeholder="20" />
            </label>
            <label>
              Display position
              <select name="display_position" defaultValue={editingPromo?.display_position ?? 'hero_banner'}>
                <option value="hero_banner">Hero Banner</option>
                <option value="seller_banner">Become a Seller Banner</option>
                <option value="top_promo">Top Promo Bar</option>
                <option value="category_feature">Category Feature</option>
                <option value="product_strip">Product Strip</option>
                <option value="offer_section">Offer Section</option>
              </select>
            </label>
            <label>
              Priority <input name="priority" type="number" defaultValue={editingPromo?.priority ?? 0} />
            </label>
            <label>
              Status
              <select name="status" defaultValue={editingPromo?.status ?? 'approved'}>
                <option value="pending_review">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="hidden">Hidden</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="admin-form-span">
              <span>Upload banner images</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                disabled={uploadingPromoImages}
                onChange={(event) => {
                  const input = event.currentTarget
                  const files = Array.from(input.files ?? [])
                  if (!files.length) return
                  setUploadingPromoImages(true)
                  void Promise.all(files.map((file) => uploadPublicMedia(file, 'promotions')))
                    .then((urls) => setPromoImages((current) => [...current, ...urls]))
                    .catch((cause) => push(cause instanceof Error ? cause.message : 'Banner images could not be uploaded.', 'error'))
                    .finally(() => {
                      setUploadingPromoImages(false)
                      input.value = ''
                    })
                }}
              />
              <small>Choose one or more JPG, PNG, WebP or AVIF images, up to 8 MB each.</small>
              {uploadingPromoImages && <small>Uploading images…</small>}
              {promoImages.length > 0 && (
                <div className="admin-promotion-image-list">
                  {promoImages.map((url, index) => (
                    <div className="admin-promotion-image" key={`${url}-${index}`}>
                      <img src={url} alt={`Campaign banner ${index + 1}`} />
                      <span>Image {index + 1}</span>
                      <button type="button" className="admin-icon-button" aria-label={`Remove image ${index + 1}`} onClick={() => setPromoImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </label>
            <label className="admin-form-span">
              <span>CTA text & link</span>
              <input name="cta_text" defaultValue={editingPromo?.cta_text ?? ''} placeholder="CTA Text" />
              <input name="cta_destination" defaultValue={editingPromo?.cta_destination ?? ''} placeholder="CTA Link e.g. /shop" />
            </label>
            <label className="admin-form-span">
              <span>Description</span>
              <textarea name="description" rows={3} defaultValue={editingPromo?.description ?? ''} />
            </label>
            <label className="admin-check">
              <input name="is_platform_wide" type="checkbox" defaultChecked={editingPromo?.is_platform_wide ?? true} /> Platform-wide promotion
            </label>
          </div>
          <div className="admin-form-actions">
            <button
              type="button"
              className="admin-button admin-button--outline"
              onClick={() => {
                setShowForm(false)
                setEditingPromo(null)
              }}
            >
              Cancel
            </button>
            <button className="admin-button" disabled={uploadingPromoImages}>{uploadingPromoImages ? 'Uploading…' : 'Save campaign'}</button>
          </div>
        </form>
      )}

      {error ? (
        <ErrorState message={error} retry={load} />
      ) : loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty
          title="No promotional campaigns found"
          detail="Create platform-wide banners or review seller promotional submissions here."
        />
      ) : (
        <div className="admin-table-wrap"><TableTools />
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Placement</th>
                <th>Discount</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title}</strong>
                    <small>{item.coupon_code ? `Code: ${item.coupon_code}` : 'No coupon code'}</small>
                  </td>
                  <td>{item.display_position}</td>
                  <td>{item.discount_percent ? `${item.discount_percent}% OFF` : 'Banner'}</td>
                  <td>{item.is_platform_wide ? 'Platform' : 'Vendor'}</td>
                  <td>
                    <em className={statusClass(item.status)}>{item.status}</em>
                  </td>
                  <td>
                    <div className="admin-action-row">
                      <button className="admin-icon-button" title="Edit" onClick={() => { setPromoImages(item.banner_image_urls?.length ? item.banner_image_urls : item.banner_image_url ? [item.banner_image_url] : []); setEditingPromo(item) }}>
                        <Edit2 size={15} />
                      </button>
                      <button className="admin-icon-button" title="Delete" onClick={() => void removePromo(item.id)}>
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Heroes() {
  const { push } = useToast()
  const [items, setItems] = useState<AdminHero[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingHero, setEditingHero] = useState<AdminHero | null>(null)
  const [heroFile, setHeroFile] = useState<File | null>(null)
  const [heroPreview, setHeroPreview] = useState<string | null>(null)
  const [savingHero, setSavingHero] = useState(false)

  useEffect(() => {
    if (!heroFile) { setHeroPreview(null); return }
    const preview = URL.createObjectURL(heroFile)
    setHeroPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [heroFile])

  const load = (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    void listAdminHeroes()
      .then(setItems)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Heroes could not be loaded.'))
      .finally(() => { if (!quiet) setLoading(false) })
  }

  useEffect(load, [])
  useAutoRefresh(load)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSavingHero(true)
    try {
      let imageUrl = editingHero?.image_url ?? ""
      if (heroFile) {
        imageUrl = await uploadPublicMedia(heroFile, "heroes")
      } else if (String(data.get("image_url") ?? "").trim()) {
        imageUrl = String(data.get("image_url") ?? "").trim()
      }
      if (!imageUrl) throw new Error('Choose a hero image or enter an image URL.')
      if (!/^https:\/\//i.test(imageUrl) && !imageUrl.startsWith('/')) throw new Error('Use an HTTPS image URL.')

      await saveAdminHero(
        {
          title: String(data.get("title") ?? "").trim(),
          subtitle: String(data.get("subtitle") ?? "").trim() || null,
          cta_text: String(data.get("cta_text") ?? "").trim() || null,
          cta_destination: String(data.get("cta_destination") ?? "").trim() || null,
          image_url: imageUrl,
          display_order: Number(data.get("display_order") ?? 0),
          status: String(data.get("status") ?? "published") as AdminHero["status"],
        },
        editingHero?.id
      )
      push("Hero slide saved.")
      setShowForm(false)
      setEditingHero(null)
      setHeroFile(null)
      load()
    } catch (cause) {
      push(cause instanceof Error ? cause.message : "Hero slide could not be saved.", "error")
    } finally {
      setSavingHero(false)
    }
  }

  async function removeHero(id: string) {
    if (!window.confirm('Delete this hero slide?')) return
    try {
      await deleteAdminHero(id)
      push('Hero slide deleted.')
      load()
    } catch (cause) {
      push(cause instanceof Error ? cause.message : 'Delete failed.', 'error')
    }
  }

  return (
    <section className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">Storefront branding</p>
          <h2>Homepage Heroes</h2>
        </div>
        <button
          className="admin-button"
          onClick={() => {
            setEditingHero(null)
            setHeroFile(null)
            setShowForm(true)
          }}
        >
          <Plus size={16} /> New hero slide
        </button>
      </div>

      {(showForm || editingHero) && (
        <form className="admin-form admin-panel" onSubmit={(event) => void submit(event)}>
          <div className="admin-panel-heading">
            <h3>{editingHero ? 'Edit hero slide' : 'New hero slide'}</h3>
            <button
              type="button"
              className="admin-icon-button"
              onClick={() => {
                setShowForm(false)
                setEditingHero(null)
                setHeroFile(null)
              }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="admin-form-grid">
            <label>
              Title <input name="title" defaultValue={editingHero?.title ?? ''} required />
            </label>
            <label>
              Subtitle <input name="subtitle" defaultValue={editingHero?.subtitle ?? ''} />
            </label>
            <label>
              CTA text <input name="cta_text" defaultValue={editingHero?.cta_text ?? ''} placeholder="e.g. Shop Now" />
            </label>
            <label>
              CTA destination <input name="cta_destination" defaultValue={editingHero?.cta_destination ?? ''} placeholder="e.g. /shop" />
            </label>
            <label className="admin-form-span">
              <span>Hero image (JPG, PNG, WebP or AVIF; max 8 MB)</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && (file.size > 8 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','image/avif'].includes(file.type))) { push('Choose a JPG, PNG, WebP or AVIF image up to 8 MB.', 'error'); event.target.value = ''; setHeroFile(null); return } setHeroFile(file) }} />
              <small>Upload a file or use an existing hosted image URL.</small>
              <input name="image_url" defaultValue={editingHero?.image_url ?? ''} placeholder="https://..." />
              {(heroPreview || editingHero?.image_url) && <img src={heroPreview ?? editingHero?.image_url ?? ''} alt="Hero image preview" style={{ display: 'block', maxWidth: 420, maxHeight: 180, objectFit: 'cover', borderRadius: 8, marginTop: 10 }} />}
            </label>
            <label>
              Display order <input name="display_order" type="number" defaultValue={editingHero?.display_order ?? 0} />
            </label>
            <label>
              Status
              <select name="status" defaultValue={editingHero?.status ?? 'published'}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <div className="admin-form-actions">
            <button
              type="button"
              className="admin-button admin-button--outline"
              onClick={() => {
                setShowForm(false)
                setEditingHero(null)
                setHeroFile(null)
              }}
            >
              Cancel
            </button>
            <button className="admin-button" disabled={savingHero}>{savingHero ? "Saving…" : "Save hero slide"}</button>
          </div>
        </form>
      )}

      {error ? (
        <ErrorState message={error} retry={load} />
      ) : loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty
          title="No homepage heroes configured"
          detail="Create your first hero slide to customize the storefront homepage hero banner dynamically."
        />
      ) : (
        <div className="admin-table-wrap"><TableTools />
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>CTA Link</th>
                <th>Order</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle || 'No subtitle'}</small>
                  </td>
                  <td>{item.cta_destination || '—'}</td>
                  <td>{item.display_order}</td>
                  <td>
                    <em className={statusClass(item.status)}>{item.status}</em>
                  </td>
                  <td>
                    <div className="admin-action-row">
                      <button className="admin-icon-button" title="Edit" onClick={() => setEditingHero(item)}>
                        <Edit2 size={15} />
                      </button>
                      <button className="admin-icon-button" title="Delete" onClick={() => void removeHero(item.id)}>
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}


function ManualOrders() {
  type ManualItem = { mode: 'catalog' | 'custom'; product_id: string; seller_id: string; product_name_snapshot: string; quantity: number; unit_price: number; seller_name_snapshot: string; sku_snapshot: string }
  const emptyItem = (): ManualItem => ({ mode: 'catalog', product_id: '', seller_id: '', product_name_snapshot: '', quantity: 1, unit_price: 0, seller_name_snapshot: '', sku_snapshot: '' })
  const { push } = useToast()
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [source, setSource] = useState('whatsapp')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [orderStatus, setOrderStatus] = useState('pending')
  const [deliveryFee, setDeliveryFee] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [paidAmount, setPaidAmount] = useState('0')
  const [formItems, setFormItems] = useState<ManualItem[]>([emptyItem()])
  const subtotal = formItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unit_price) || 0), 0)
  const total = Math.max(0, subtotal + (Number(deliveryFee) || 0) - (Number(discount) || 0))
  const load = () => {
    setLoading(true); setError(null)
    void (async () => {
      try {
        const client = getSupabase() as any
        const { data, error: queryError } = await client.from('manual_orders').select('*').order('created_at', { ascending: false }).limit(200)
        if (queryError) throw new Error(queryError.message)
        setItems((data ?? []) as Record<string, unknown>[])
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Manual orders could not be loaded.') }
      finally { setLoading(false) }
    })()
  }
  const loadProducts = () => { setProductsLoading(true); void listAdminProducts('').then(setProducts).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Products could not be loaded.')).finally(() => setProductsLoading(false)) }
  useEffect(() => { load(); loadProducts() }, [])
  const value = (row: Record<string, unknown>, ...keys: string[]) => {
    for (const key of keys) { const v = row[key]; if (v !== null && v !== undefined && v !== '') return String(v) }
    return '—'
  }
  const resetForm = () => {
    setCustomerName(''); setPhone(''); setEmail(''); setAddress(''); setNote(''); setReference('')
    setSource('whatsapp'); setPaymentMethod('cod'); setOrderStatus('pending')
    setDeliveryFee('0'); setDiscount('0'); setPaidAmount('0'); setFormItems([emptyItem()])
  }
  const changeItemMode = (index: number, mode: 'catalog' | 'custom') => setFormItems(v => v.map((item,i) => i === index ? { ...item, mode, product_id: '', seller_id: '', product_name_snapshot: '', unit_price: 0, seller_name_snapshot: '', sku_snapshot: '' } : item))
  const selectProduct = (index: number, productId: string) => { const product = products.find(p => p.id === productId); setFormItems(v => v.map((item,i) => i === index ? { ...item, product_id: product?.id ?? '', seller_id: (product as any)?.seller_id ?? '', product_name_snapshot: product?.name ?? '', unit_price: Number(product?.price ?? 0), seller_name_snapshot: '', sku_snapshot: product?.sku ?? '' } : item)) }
  const saveOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formItems.length || formItems.some(item => !item.product_name_snapshot.trim() || Number(item.quantity) < 1 || Number(item.unit_price) < 0 || (item.mode === 'catalog' && !item.product_id))) {
      setError('Har item ka naam, quantity (kam az kam 1) aur valid price enter karein.'); return
    }
    setSaving(true); setError(null)
    try {
      const client = getSupabase() as any
      const { data, error: saveError } = await client.rpc('admin_save_manual_order', {
        p_order_id: null,
        p_order: {
          source, customer_name: customerName, customer_phone: phone, customer_email: email,
          shipping_address: address, customer_note: note, external_reference: reference,
          delivery_fee: Number(deliveryFee) || 0, discount_amount: Number(discount) || 0,
          paid_amount: Number(paidAmount) || 0, payment_method: paymentMethod, order_status: orderStatus
        },
        p_items: formItems.map(item => ({
          product_id: item.mode === 'catalog' ? item.product_id : null,
          seller_id: item.mode === 'catalog' ? (item.seller_id || null) : null,
          product_name_snapshot: item.product_name_snapshot.trim(),
          quantity: Number(item.quantity), unit_price: Number(item.unit_price),
          seller_name_snapshot: item.seller_name_snapshot.trim(), sku_snapshot: item.sku_snapshot.trim(),
          variant_snapshot: {}
        }))
      })
      if (saveError) throw new Error(saveError.message)
      const created = Array.isArray(data) ? data[0] : data
      resetForm(); setFormOpen(false); load()
      push(`Manual order ${created?.manual_order_number ?? ''} saved successfully.`, 'success')
    } catch (cause) { push(cause instanceof Error ? cause.message : 'Manual order save nahi ho saka.', 'error') }
    finally { setSaving(false) }
  }
  const fieldStyle = { width: '100%', minWidth: 0, padding: '10px 12px', border: '1px solid var(--admin-border, #d9dee7)', borderRadius: '8px', background: 'var(--admin-surface, #fff)', color: 'inherit', font: 'inherit' }
  const labelStyle = { display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 600 as const }
  return <section className="admin-content">
    <div className="admin-page-heading">
      <div><p className="admin-kicker">Phone, WhatsApp and walk-in sales</p><h2>Manual Orders</h2><p className="admin-copy">Admin yahan customer ki phone, WhatsApp, social media ya shop wali order manually add kar sakta hai.</p></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button className="admin-button" onClick={() => { setError(null); if (!products.length) loadProducts(); setFormOpen(v => !v) }}><Plus size={15} /> {formOpen ? 'Close form' : 'Add Manual Order'}</button>
        <button className="admin-button admin-button--outline" onClick={load}><RefreshCw size={15} /> Refresh</button>
      </div>
    </div>
    {error && <ErrorState message={error} retry={() => { setError(null); loadProducts() }} />}
    {formOpen && <form className="admin-panel" onSubmit={saveOrder} style={{display:'grid',gap:18,marginBottom:20}}>
      <div className="admin-panel-heading"><div><p className="admin-kicker">New order</p><h3>Customer and delivery details</h3></div></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:14}}>
        <label style={labelStyle}>Customer name *<input style={fieldStyle} required value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Customer full name" /></label>
        <label style={labelStyle}>Phone / WhatsApp *<input style={fieldStyle} required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="03xx xxxxxxx" /></label>
        <label style={labelStyle}>Email (optional)<input style={fieldStyle} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@example.com" /></label>
        <label style={labelStyle}>Order source *<select style={fieldStyle} value={source} onChange={e=>setSource(e.target.value)}>{[['whatsapp','WhatsApp'],['instagram','Instagram'],['facebook','Facebook'],['phone','Phone call'],['walk_in','Walk-in / shop'],['other','Other']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <label style={labelStyle}>Delivery address *<textarea style={fieldStyle} required value={address} onChange={e=>setAddress(e.target.value)} rows={2} placeholder="Full delivery address" /></label>
      <div className="admin-panel-heading"><div><p className="admin-kicker">Order items</p><h3>Products and quantities</h3></div><button type="button" className="admin-button admin-button--outline" onClick={()=>setFormItems(v=>[...v,emptyItem()])}><Plus size={14}/> Add item</button></div>
      {formItems.map((item,index)=><div key={index} style={{display:'grid',gap:12,padding:14,border:'1px solid var(--admin-border, #d9dee7)',borderRadius:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><strong>Item {index+1}</strong><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button type="button" className={item.mode==='catalog'?'admin-button':'admin-button admin-button--outline'} onClick={()=>changeItemMode(index,'catalog')}>Select catalog product</button>
          <button type="button" className={item.mode==='custom'?'admin-button':'admin-button admin-button--outline'} onClick={()=>changeItemMode(index,'custom')}>Custom product</button>
          <button type="button" className="admin-icon-button" aria-label="Remove item" disabled={formItems.length===1} onClick={()=>setFormItems(v=>v.filter((_,i)=>i!==index))}><X size={15}/></button>
        </div></div>
        {item.mode==='catalog' ? <label style={labelStyle}>Product dropdown *<select style={fieldStyle} required value={item.product_id} onChange={e=>selectProduct(index,e.target.value)}><option value="">{productsLoading?'Loading products…':'Choose a product from catalog'}</option>{products.map(product=><option key={product.id} value={product.id}>{product.name} · {formatMoney(product.price)}{product.sku? ' · SKU '+product.sku:''}</option>)}</select>{!productsLoading&&products.length===0&&<small>No catalog products loaded. Try Refresh, or choose Custom product.</small>}</label> :
          <label style={labelStyle}>Custom product name *<input style={fieldStyle} required value={item.product_name_snapshot} onChange={e=>setFormItems(v=>v.map((x,i)=>i===index?{...x,product_name_snapshot:e.target.value}:x))} placeholder="Enter product not available in catalog"/></label>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:12}}>
          <label style={labelStyle}>Quantity *<input style={fieldStyle} type="number" min="1" max="999" required value={item.quantity} onChange={e=>setFormItems(v=>v.map((x,i)=>i===index?{...x,quantity:Number(e.target.value)}:x))}/></label>
          <label style={labelStyle}>Unit price (PKR) *<input style={fieldStyle} type="number" min="0" step="0.01" required value={item.unit_price} onChange={e=>setFormItems(v=>v.map((x,i)=>i===index?{...x,unit_price:Number(e.target.value)}:x))}/></label>
          <label style={labelStyle}>Seller (optional)<input style={fieldStyle} value={item.seller_name_snapshot} onChange={e=>setFormItems(v=>v.map((x,i)=>i===index?{...x,seller_name_snapshot:e.target.value}:x))} placeholder="Seller name"/></label>
          <label style={labelStyle}>SKU (optional)<input style={fieldStyle} value={item.sku_snapshot} onChange={e=>setFormItems(v=>v.map((x,i)=>i===index?{...x,sku_snapshot:e.target.value}:x))} placeholder="SKU"/></label>
        </div>
      </div>)}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:14}}>
        <label style={labelStyle}>Delivery fee (PKR)<input style={fieldStyle} type="number" min="0" step="0.01" value={deliveryFee} onChange={e=>setDeliveryFee(e.target.value)}/></label>
        <label style={labelStyle}>Discount (PKR)<input style={fieldStyle} type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
        <label style={labelStyle}>Payment method<select style={fieldStyle} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>{[['cod','Cash on delivery'],['cash','Cash paid'],['bank_transfer','Bank transfer'],['card','Card'],['other','Other']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label style={labelStyle}>Order status<select style={fieldStyle} value={orderStatus} onChange={e=>setOrderStatus(e.target.value)}>{[['pending','Pending'],['processing','Processing'],['shipped','Shipped'],['delivered','Delivered'],['cancelled','Cancelled']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label style={labelStyle}>Amount paid (PKR)<input style={fieldStyle} type="number" min="0" max={total} step="0.01" value={paidAmount} onChange={e=>setPaidAmount(e.target.value)}/></label>
        <label style={labelStyle}>External reference (optional)<input style={fieldStyle} value={reference} onChange={e=>setReference(e.target.value)} placeholder="WhatsApp ref / receipt no."/></label>
      </div>
      <label style={labelStyle}>Order note (optional)<textarea style={fieldStyle} value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Customer instructions or internal note"/></label>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',paddingTop:12,borderTop:'1px solid var(--admin-border, #d9dee7)'}}>
        <div><div style={{fontSize:13,color:'var(--admin-muted,#64748b)'}}>Subtotal: PKR {subtotal.toLocaleString('en-PK')} · Delivery: PKR {(Number(deliveryFee)||0).toLocaleString('en-PK')} · Discount: PKR {(Number(discount)||0).toLocaleString('en-PK')}</div><strong style={{fontSize:20}}>Total: PKR {total.toLocaleString('en-PK')}</strong></div>
        <button className="admin-button" type="submit" disabled={saving}>{saving ? <><RefreshCw size={15} className="spin"/> Saving…</> : <><Check size={15}/> Save Manual Order</>}</button>
      </div>
    </form>}
    <div className="admin-panel">
      <div className="admin-panel-heading"><div><p className="admin-kicker">Saved records</p><h3>{items.length} manual orders</h3></div></div>
      {loading ? <Loading /> : items.length === 0 ? <Empty title="No manual orders yet" detail="Add the first order using the “Add Manual Order” button above." /> :
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order number</th><th>Customer</th><th>Phone</th><th>Total</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>{items.map((row,index)=><tr key={value(row,'id')==='—'?index:value(row,'id')}><td><Link className="admin-link-button" to={`/admin/manual-orders/${value(row,'id')}`}><strong>{value(row,'manual_order_number','order_number','id')}</strong><small>{value(row,'source')}</small></Link></td><td>{value(row,'customer_name')}<small>{value(row,'customer_email')}</small></td><td>{value(row,'customer_phone')}</td><td>{formatMoney(value(row,'total'))}</td><td><em className={statusClass(value(row,'order_status'))}>{value(row,'order_status')}</em></td><td>{formatDate(value(row,'created_at'))}</td></tr>)}</tbody></table></div>}
    </div>
  </section>
}


function ManualOrderDetailPage({ orderId }: { orderId: string }) {
  const { push } = useToast()
  const [order, setOrder] = useState<Record<string, unknown> | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    setLoading(true); setError(null)
    void (async () => {
      try {
        const client = getSupabase() as any
        const [orderResult, itemsResult] = await Promise.all([
          client.from('manual_orders').select('*').eq('id', orderId).single(),
          client.from('manual_order_items').select('*').eq('manual_order_id', orderId).order('created_at')
        ])
        if (orderResult.error) throw new Error(orderResult.error.message)
        if (itemsResult.error) throw new Error(itemsResult.error.message)
        setOrder(orderResult.data as Record<string, unknown>)
        setItems((itemsResult.data ?? []) as Record<string, unknown>[])
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Manual order details could not be loaded.') }
      finally { setLoading(false) }
    })()
  }
  useEffect(() => { load() }, [orderId])
  const v = (key: string, fallback = '—') => { const value = order?.[key]; return value === null || value === undefined || value === '' ? fallback : String(value) }
  if (loading) return <div className="admin-content"><Loading /></div>
  if (error || !order) return <div className="admin-content"><div className="admin-page-heading"><Link className="admin-button admin-button--outline" to="/admin/manual-orders"><ArrowLeft size={15}/> All manual orders</Link></div><ErrorState message={error ?? 'Manual order not found.'} retry={load}/></div>
  return <section className="admin-content">
    <div className="admin-page-heading no-print"><div><p className="admin-kicker">Manual order details</p><h2>{v('manual_order_number')}</h2><p className="admin-copy">Created {formatDate(v('created_at'))} · Source: {v('source')}</p></div><div className="admin-action-row"><Link className="admin-button admin-button--outline" to="/admin/manual-orders"><ArrowLeft size={15}/> All manual orders</Link><button className="admin-button" onClick={() => window.print()}><Printer size={15}/> Print order slip</button></div></div>
    <div className="admin-grid-2 no-print">
      <div className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Customer & delivery</p><h3>{v('customer_name')}</h3></div><em className={statusClass(v('order_status'))}>{v('order_status')}</em></div><p>{v('customer_phone')}</p><p>{v('customer_email','No email provided')}</p><p className="admin-copy">{v('shipping_address')}</p>{v('customer_note','') && <p className="admin-callout">{v('customer_note','')}</p>}{v('external_reference','') && <p>Reference: {v('external_reference')}</p>}</div>
      <div className="admin-panel"><p className="admin-kicker">Payment & totals</p><h3>{formatMoney(v('total'))}</h3><p>{v('payment_method').toUpperCase()} · {v('payment_status')}</p><p className="admin-copy">Subtotal {formatMoney(v('subtotal'))} · Delivery {formatMoney(v('delivery_fee'))} · Discount {formatMoney(v('discount_amount'))}</p><p>Paid: {formatMoney(v('paid_amount'))}</p><small>Updated {formatDate(v('updated_at'))}</small></div>
    </div>
    <article className="admin-order-slip">
      <header className="slip-brand"><div className="slip-brand__identity"><img className="slip-logo" src="/jtbazar-logo.webp" alt="JTBazar"/><small>MANUAL ORDER SLIP</small></div><div className="slip-brand__order"><small>ORDER NUMBER</small><b>{v('manual_order_number')}</b></div></header>
      <div className="slip-columns"><section><h3>Customer & delivery</h3><strong>{v('customer_name')}</strong><p>{v('customer_phone')}</p>{v('customer_email','') && <p>{v('customer_email')}</p>}<p>{v('shipping_address')}</p>{v('customer_note','') && <small>Note: {v('customer_note')}</small>}</section><section><h3>Order info</h3><p><b>Order date</b><span>{formatDate(v('created_at'))}</span></p><p><b>Source</b><span>{v('source')}</span></p><p><b>Payment</b><span>{v('payment_method')} · {v('payment_status')}</span></p><p><b>Status</b><span className="slip-status">{v('order_status')}</span></p><p><b>Reference</b><span>{v('external_reference')}</span></p></section></div>
      <div className="slip-items"><table><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{items.map((item,index)=><tr key={String(item.id ?? index)}><td><strong>{String(item.product_name_snapshot ?? '—')}</strong><small>{String(item.seller_name_snapshot ?? '')}</small></td><td>{String(item.sku_snapshot ?? '—')}</td><td>{Number(item.quantity ?? 0)}</td><td>{formatMoney(String(item.unit_price ?? 0))}</td><td>{formatMoney(String(item.line_total ?? (Number(item.quantity ?? 0)*Number(item.unit_price ?? 0))))}</td></tr>)}</tbody></table></div>
      <div className="slip-total"><span>Subtotal</span><b>{formatMoney(v('subtotal'))}</b><span>Delivery</span><b>{formatMoney(v('delivery_fee'))}</b><span>Discount</span><b>− {formatMoney(v('discount_amount'))}</b><strong>Grand total</strong><strong>{formatMoney(v('total'))}</strong></div>
      <footer><strong>Thank you for shopping with JTBazar.</strong><span>We appreciate your order.</span></footer>
    </article>
  </section>
}


