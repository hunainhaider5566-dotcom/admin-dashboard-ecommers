import { getSupabase } from '../../lib/supabase'
import type { Database, Json } from '../../types/database'

export type AdminSummary = Database['public']['Functions']['admin_dashboard_summary']['Returns'][number]
export type AdminProduct = Database['public']['Tables']['products']['Row'] & { category: { name: string } | null; inventory: number; image_url: string | null; seller_name: string | null }
export type AdminCategory = Database['public']['Tables']['categories']['Row']
export type AdminOrder = Database['public']['Tables']['orders']['Row']
export type AdminOrderVendor = { id: string; shop_name: string }
export type AdminOrderItem = Database['public']['Tables']['order_items']['Row']
export type AdminInventory = Database['public']['Tables']['product_inventory']['Row'] & { product_name: string; variant_name: string | null }
export type AdminCustomer = Database['public']['Functions']['admin_customer_summary']['Returns'][number]
export type AdminAccountSuspension = Database['public']['Functions']['admin_account_suspensions']['Returns'][number]
export type AdminVariant = Database['public']['Tables']['product_variants']['Row']
export type AdminSeller = Database['public']['Tables']['seller_profiles']['Row']
export type AdminCase = Database['public']['Tables']['marketplace_cases']['Row']
export type AdminStoreSettings = Database['public']['Tables']['store_settings']['Row']
export type AdminNotification = Database['public']['Tables']['notifications']['Row']
export type AdminSupportTicket = Database['public']['Tables']['support_tickets']['Row']
export type AdminSupportInboxTicket = { id: string; ticket_kind: 'seller' | 'customer'; requester_name: string; requester_email: string; subject: string; message: string; status: 'open' | 'in_progress' | 'resolved'; admin_response: string | null; created_at: string; updated_at: string }

export interface AdminHero {
  id: string
  title: string
  subtitle: string | null
  cta_text: string | null
  cta_destination: string | null
  image_url: string
  mobile_image_url: string | null
  image_alt_text: string | null
  status: 'draft' | 'published' | 'archived'
  display_order: number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface AdminPromotion {
  id: string
  title: string
  description: string | null
  banner_image_url: string | null
  banner_image_urls: string[]
  cta_text: string | null
  cta_destination: string | null
  is_platform_wide: boolean
  seller_id: string | null
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'hidden' | 'archived'
  rejection_reason: string | null
  display_position: string
  priority: number
  coupon_code: string | null
  discount_percent: number | null
  created_at: string
  updated_at: string
}

function assertError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function getAdminSummary() {
  const { data, error } = await getSupabase().rpc('admin_dashboard_summary')
  assertError(error)
  return data?.[0] ?? null
}

export async function listAdminProducts(search = ''): Promise<AdminProduct[]> {
  const client = getSupabase()
  const { data, error } = await client.rpc('admin_list_products', { p_search: search.trim() })
  assertError(error)
  const rows = (data ?? []) as Database['public']['Tables']['products']['Row'][]
  if (rows.length === 0) return []

  const productIds = rows.map((row) => row.id)
  const [categoriesResult, inventoryResult, imagesResult, sellersResult] = await Promise.all([
    client.from('categories').select('id, name').limit(500),
    client.from('product_inventory').select('product_id, quantity').in('product_id', productIds).limit(1000),
    client.from('product_images').select('product_id, image_url, storage_path, is_primary, sort_order').in('product_id', productIds).order('sort_order').limit(1000),
    client.from('seller_profiles').select('id, shop_name').limit(1000),
  ])
  assertError(categoriesResult.error); assertError(inventoryResult.error); assertError(imagesResult.error); assertError(sellersResult.error)

  const categoryNames = new Map((categoriesResult.data ?? []).map((category) => [category.id, category.name]))
  const sellerNames = new Map((sellersResult.data ?? []).map((seller) => [seller.id, seller.shop_name]))
  const inventoryTotals = new Map<string, number>()
  for (const row of inventoryResult.data ?? []) {
    inventoryTotals.set(row.product_id, (inventoryTotals.get(row.product_id) ?? 0) + (row.quantity ?? 0))
  }
  const imagesByProduct = new Map<string, { image_url: string | null; storage_path: string | null; is_primary: boolean | null }[]>()
  for (const image of imagesResult.data ?? []) {
    const list = imagesByProduct.get(image.product_id) ?? []
    list.push(image)
    imagesByProduct.set(image.product_id, list)
  }

  return Promise.all(rows.map(async (row) => {
    const images = imagesByProduct.get(row.id) ?? []
    const primary = images.find((image) => image.is_primary) ?? images[0]
    let imageUrl = primary?.image_url ?? null
    if (!imageUrl && primary?.storage_path) {
      if (row.publication_status === 'published') imageUrl = client.storage.from('product-images').getPublicUrl(primary.storage_path).data.publicUrl
      else {
        const signed = await client.storage.from('product-drafts').createSignedUrl(primary.storage_path, 600)
        imageUrl = signed.data?.signedUrl ?? null
      }
    }
    return {
      ...row,
      category: row.category_id ? { name: categoryNames.get(row.category_id) ?? 'Unassigned' } : null,
      inventory: inventoryTotals.get(row.id) ?? 0,
      image_url: imageUrl,
      seller_name: row.seller_id ? sellerNames.get(row.seller_id) ?? null : null,
    }
  }))
}

export async function listAdminCategories(): Promise<AdminCategory[]> {
  const { data, error } = await getSupabase().from('categories').select('id, parent_id, name, slug, description, eyebrow, image_url, is_active, is_coming_soon, sort_order, seo_title, seo_description, created_at, updated_at').order('sort_order').order('name').limit(200)
  assertError(error)
  return (data ?? []) as AdminCategory[]
}

export async function saveCategory(input: Database['public']['Tables']['categories']['Insert'], id?: string) {
  const client = getSupabase()
  const result = id ? await client.from('categories').update(input).eq('id', id).select().single() : await client.from('categories').insert(input).select().single()
  assertError(result.error)
  return result.data
}

export async function saveProduct(input: Database['public']['Tables']['products']['Insert'], id?: string) {
  const client = getSupabase()
  // The shared project deliberately removes table-level SELECT from products.
  // Do not ask PostgREST to return the mutated row; that requires SELECT grants
  // for the representation and fails even when the admin UPDATE/INSERT is valid.
  const productId = id ?? crypto.randomUUID()
  const result = id
    ? await client.from('products').update(input).eq('id', id)
    : await client.from('products').insert({ ...input, id: productId })
  assertError(result.error)
  const savedProducts = await client.rpc('admin_list_products', { p_search: String(input.slug ?? '') })
  assertError(savedProducts.error)
  const saved = (savedProducts.data ?? []).find((row) => row.id === productId)
  if (!saved) throw new Error('Product changes could not be verified after saving.')
  return { id: saved.id, publication_status: saved.publication_status }
}

export async function getAdminProductEditor(id: string) {
  const client = getSupabase()
  const [products, variants, images, inventory] = await Promise.all([
    client.rpc('admin_list_products', { p_search: '' }),
    client.from('product_variants').select('id, product_id, option_label, option_value, sku, price_override, attributes, is_active, sort_order, created_at, updated_at').eq('product_id', id).order('sort_order').limit(100),
    client.from('product_images').select('id, product_id, image_url, storage_path, alt_text, sort_order, is_primary, created_at').eq('product_id', id).order('sort_order').limit(100),
    client.from('product_inventory').select('id, variant_id, quantity, low_stock_threshold, updated_at').eq('product_id', id).limit(200),
  ])
  assertError(products.error); assertError(variants.error); assertError(images.error); assertError(inventory.error)
  const productRow = (products.data ?? []).find((row) => row.id === id)
  if (!productRow) return null
  const [seller, category] = await Promise.all([
    productRow.seller_id ? client.from('seller_profiles').select('id, shop_name, slug, status').eq('id', productRow.seller_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    productRow.category_id ? client.from('categories').select('id, name, slug').eq('id', productRow.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  assertError(seller.error); assertError(category.error)
  const mappedImages = await Promise.all((images.data ?? []).map(async (image) => {
    if (image.image_url) return { ...image, display_url: image.image_url }
    if (!image.storage_path) return { ...image, display_url: null }
    const bucket = productRow.publication_status === 'published' ? 'product-images' : 'product-drafts'
    if (bucket === 'product-images') return { ...image, display_url: client.storage.from(bucket).getPublicUrl(image.storage_path).data.publicUrl }
    const signed = await client.storage.from(bucket).createSignedUrl(image.storage_path, 600)
    return { ...image, display_url: signed.data?.signedUrl ?? null }
  }))
  return { product: productRow, variants: (variants.data ?? []) as AdminVariant[], images: mappedImages, inventory: inventory.data ?? [], seller: seller.data, category: category.data }
}

export async function saveProductVariant(input: Database['public']['Tables']['product_variants']['Insert'], id?: string) {
  const client = getSupabase()
  const result = id ? await client.from('product_variants').update(input).eq('id', id).select().single() : await client.from('product_variants').insert(input).select().single()
  assertError(result.error)
  return result.data
}

export async function deleteProductVariant(id: string) {
  const { error } = await getSupabase().from('product_variants').delete().eq('id', id)
  assertError(error)
}

export async function updateProductStatus(id: string, publication_status: Database['public']['Tables']['products']['Row']['publication_status']) {
  if (publication_status === 'published') await publishProductImages(id)
  const { error } = await getSupabase().from('products').update({ publication_status }).eq('id', id)
  assertError(error)
}

async function publishProductImages(productId: string) {
  const client = getSupabase()
  const { data: images, error } = await client.from('product_images').select('id, storage_path, image_url').eq('product_id', productId).order('sort_order')
  assertError(error)
  for (const image of images ?? []) {
    if (!image.storage_path || image.image_url) continue
    const { data: file, error: downloadError } = await client.storage.from('product-drafts').download(image.storage_path)
    assertError(downloadError)
    if (!file) throw new Error('A draft product image could not be opened for publication.')
    const upload = await client.storage.from('product-images').upload(image.storage_path, file, { upsert: true, contentType: file.type || undefined })
    assertError(upload.error)
    const url = client.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl
    const saved = await client.from('product_images').update({ image_url: url, storage_path: null }).eq('id', image.id)
    if (saved.error) {
      await client.storage.from('product-images').remove([image.storage_path])
      throw new Error(saved.error.message)
    }
    await client.storage.from('product-drafts').remove([image.storage_path])
  }
}

export async function moderateProduct(id: string, status: Database['public']['Tables']['products']['Row']['moderation_status'], reason?: string) {
  const { error } = await getSupabase().rpc('admin_moderate_product', { p_product_id: id, p_status: status, p_reason: reason ?? null })
  assertError(error)
}

export async function uploadProductImage(productId: string, file: File, draft = true, previousDraft = draft) {
  const client = getSupabase()
  const bucket = draft ? 'product-drafts' : 'product-images'
  const path = `${productId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
  const upload = await client.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type })
  assertError(upload.error)
  const imageUrl = draft ? null : client.storage.from(bucket).getPublicUrl(path).data.publicUrl
  const { data: currentImages, error: currentImagesError } = await client.from('product_images')
    .select('id, storage_path, sort_order, is_primary')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
    .limit(100)

  if (currentImagesError) {
    await client.storage.from(bucket).remove([path])
    throw new Error(currentImagesError.message)
  }

  const currentPrimary = currentImages?.find((image) => image.is_primary) ?? currentImages?.[0]
  const imageValues = { storage_path: draft ? path : null, image_url: imageUrl, alt_text: file.name, is_primary: true }
  const result = currentPrimary
    ? await client.from('product_images').update(imageValues).eq('id', currentPrimary.id)
    : await client.from('product_images').upsert({ ...imageValues, product_id: productId, sort_order: 0 }, { onConflict: 'product_id,sort_order' })

  if (result.error) {
    await client.storage.from(bucket).remove([path])
    throw new Error(result.error.message)
  }

  if (currentPrimary?.storage_path) {
    const previousBucket = previousDraft ? 'product-drafts' : 'product-images'
    await client.storage.from(previousBucket).remove([currentPrimary.storage_path])
  }
}

export async function uploadAdditionalProductImage(productId: string, file: File, draft = true) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Product images must be 10 MB or smaller.')
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP or AVIF product image.')
  const client = getSupabase()
  const bucket = draft ? 'product-drafts' : 'product-images'
  const path = `${productId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
  const upload = await client.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type })
  assertError(upload.error)
  const { data: images, error: imagesError } = await client.from('product_images').select('sort_order, is_primary').eq('product_id', productId).order('sort_order', { ascending: false }).limit(100)
  if (imagesError) {
    await client.storage.from(bucket).remove([path])
    throw new Error(imagesError.message)
  }
  const sortOrder = (images?.[0]?.sort_order ?? -1) + 1
  const result = await client.from('product_images').insert({ product_id: productId, storage_path: draft ? path : null, image_url: draft ? null : client.storage.from(bucket).getPublicUrl(path).data.publicUrl, alt_text: file.name, sort_order: sortOrder, is_primary: !images?.length })
  if (result.error) {
    await client.storage.from(bucket).remove([path])
    throw new Error(result.error.message)
  }
}

export async function listAdminNotifications(): Promise<AdminNotification[]> {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) return []
  const { data, error } = await client.from('notifications').select('id, user_id, kind, title, body, related_order_id, read_at, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(25)
  assertError(error)
  return (data ?? []) as AdminNotification[]
}

export async function markAdminNotificationRead(id: string) {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in is required to update notifications.')
  const { error } = await client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
  assertError(error)
}

export async function markAllAdminNotificationsRead() {
  const client = getSupabase()
  const user = (await client.auth.getUser()).data.user
  if (!user) throw new Error('Sign in is required to update notifications.')
  const { error } = await client.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null)
  assertError(error)
}

export async function listAdminOrderVendors(): Promise<AdminOrderVendor[]> {
  const { data, error } = await getSupabase().from('seller_profiles').select('id, shop_name').order('shop_name').limit(1000)
  assertError(error)
  return (data ?? []) as AdminOrderVendor[]
}

export async function listAdminOrders(search = '', status = 'all', page = 0, pageSize = 25, sort = 'created_at.desc', vendorId = 'all'): Promise<{ items: AdminOrder[]; count: number }> {
  const [column, direction] = sort.split('.')
  const allowedSorts = new Set(['created_at', 'updated_at', 'total', 'order_number', 'order_status'])
  const sortColumn = allowedSorts.has(column) ? column : 'created_at'
  const ascending = direction === 'asc'
  const from = Math.max(0, page) * Math.max(1, pageSize)
  const client = getSupabase()
  let vendorOrderIds: string[] | null = null
  if (vendorId !== 'all') {
    const { data: matchingItems, error: itemError } = await client.from('order_items').select('order_id').eq('seller_id', vendorId).limit(10000)
    assertError(itemError)
    vendorOrderIds = [...new Set((matchingItems ?? []).map((item) => item.order_id).filter((id): id is string => Boolean(id)))]
    if (vendorOrderIds.length === 0) return { items: [], count: 0 }
  }
  let query = client.from('orders').select('id, order_number, customer_id, customer_name, customer_phone, customer_email, shipping_address_snapshot, customer_note, currency, subtotal, delivery_fee, discount_amount, total, order_status, payment_method, payment_status, delivery_lat, delivery_lng, delivery_location_name, delivery_location_captured_at, created_at, updated_at', { count: 'exact' }).order(sortColumn, { ascending }).range(from, from + Math.max(1, pageSize) - 1)
  if (vendorOrderIds) query = query.in('id', vendorOrderIds)
  const term = search.trim().replace(/[%,()]/g, ' ')
  if (term) query = query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`)
  if (status !== 'all') query = query.eq('order_status', status as Database['public']['Tables']['orders']['Row']['order_status'])
  const { data, error, count } = await query
  assertError(error)
  return { items: (data ?? []) as AdminOrder[], count: count ?? 0 }
}

export async function getAdminOrderDetail(id: string) {
  const client = getSupabase()
  const [order, items, notes, history] = await Promise.all([
    client.from('orders').select('id, order_number, customer_id, customer_name, customer_phone, customer_email, shipping_address_snapshot, customer_note, currency, subtotal, delivery_fee, discount_amount, total, order_status, payment_method, payment_status, delivery_lat, delivery_lng, delivery_location_name, delivery_location_captured_at, created_at, updated_at').eq('id', id).single(),
    client.from('order_items').select('id, order_id, product_id, variant_id, seller_id, seller_name_snapshot, product_name_snapshot, sku_snapshot, variant_snapshot, product_snapshot, quantity, unit_price, line_total, vendor_fulfillment_status, tracking_number, tracking_url, vendor_note, vendor_updated_at, created_at').eq('order_id', id).order('created_at').limit(100),
    client.from('admin_order_notes').select('id, order_id, created_by, note, created_at').eq('order_id', id).order('created_at', { ascending: false }).limit(100),
    client.from('admin_audit_logs').select('id, action, entity, entity_id, details, created_at').eq('entity', 'orders').eq('entity_id', id).order('created_at', { ascending: false }).limit(100),
  ])
  assertError(order.error); assertError(items.error)
  const warnings = [notes.error && `Admin notes unavailable: ${notes.error.message}`, history.error && `Status history unavailable: ${history.error.message}`].filter((message): message is string => Boolean(message))
  return { order: order.data as AdminOrder, items: (items.data ?? []) as AdminOrderItem[], notes: notes.data ?? [], history: history.data ?? [], warnings }
}

export async function updateOrder(id: string, order_status: Database['public']['Tables']['orders']['Row']['order_status']) {
  const client = getSupabase()
  const { error } = await client.from('orders').update({ order_status }).eq('id', id)
  assertError(error)

  // Send a customer notification after the status update succeeds.
  if (['confirmed', 'shipped', 'delivered'].includes(order_status)) {
    const { data, error: emailError } = await client.functions.invoke('commerce-email', {
      body: { event: 'order_status', order_id: id, status: order_status },
    })

    if (emailError) {
      console.error('Order status email invocation failed:', emailError.message)
    } else if (!data?.sent) {
      console.warn('Order status email was not sent:', data)
    }
  }
}

export async function addOrderNote(order_id: string, note: string) {
  const { error } = await getSupabase().from('admin_order_notes').insert({ order_id, note, created_by: (await getSupabase().auth.getUser()).data.user?.id ?? '' })
  assertError(error)
}

export async function listAdminInventory(): Promise<AdminInventory[]> {
  const { data, error } = await getSupabase().from('product_inventory').select('id, product_id, variant_id, quantity, low_stock_threshold, updated_at, products(name), product_variants(option_label, option_value)').order('updated_at', { ascending: false }).limit(100)
  assertError(error)
  return (data ?? []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants
    return { ...row, product_name: product?.name ?? 'Unknown product', variant_name: variant ? `${variant.option_label}: ${variant.option_value}` : null } as unknown as AdminInventory
  })
}

export async function adjustInventory(id: string, quantity: number, note: string) {
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error('Quantity must be a whole number of zero or more.')
  const { error } = await getSupabase().rpc('admin_adjust_inventory', { p_inventory_id: id, p_new_quantity: quantity, p_note: note })
  assertError(error)
}

export async function listAdminCustomers(): Promise<AdminCustomer[]> {
  const { data, error } = await getSupabase().rpc('admin_customer_summary')
  assertError(error)
  return (data ?? []) as AdminCustomer[]
}

export async function listAdminAccountSuspensions(): Promise<AdminAccountSuspension[]> {
  const { data, error } = await getSupabase().rpc('admin_account_suspensions')
  assertError(error)
  return data ?? []
}

export async function setAdminAccountSuspension(userId: string, action: 'suspend' | 'restore', reason?: string) {
  const { data, error } = await getSupabase().functions.invoke('admin-account-suspension', { body: { user_id: userId, action, reason } })
  if (error) {
    const message = typeof data === 'object' && data && 'error' in data ? String(data.error) : error.message
    throw new Error(message || 'Account status could not be changed.')
  }
  return data as { ok: boolean; user_id: string; suspended: boolean; email_sent?: boolean }
}

export async function getAdminStoreSettings(): Promise<AdminStoreSettings> {
  const { data, error } = await getSupabase()
    .from('store_settings')
    .select('id, store_name, support_email, support_phone, support_whatsapp, delivery_fee, cod_enabled, return_window_days, updated_at')
    .eq('id', 'default')
    .single()
  assertError(error)
  return data as AdminStoreSettings
}

export async function updateAdminStoreSettings(input: {
  store_name: string
  support_email: string | null
  support_phone: string | null
  support_whatsapp: string | null
  delivery_fee: number
  cod_enabled: boolean
  return_window_days: number
}): Promise<AdminStoreSettings> {
  const { data, error } = await getSupabase().rpc('admin_update_store_settings', { p_settings: input })
  assertError(error)
  return data as AdminStoreSettings
}

export async function listAuditLogs() {
  const { data, error } = await getSupabase().from('admin_audit_logs').select('id, actor_id, action, entity, entity_id, details, created_at').order('created_at', { ascending: false }).limit(100)
  assertError(error)
  return data ?? []
}

export function asJsonObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json | undefined> : {}
}

export async function listSellerApplications(status = 'all'): Promise<AdminSeller[]> {
  let query = getSupabase().from('seller_profiles').select('*').order('created_at', { ascending: false }).limit(200)
  if (status !== 'all') query = query.eq('status', status as Database['public']['Tables']['seller_profiles']['Row']['status'])
  const { data, error } = await query
  assertError(error)
  return (data ?? []) as AdminSeller[]
}

export async function getVendorDocumentSignedUrl(path: string): Promise<string | null> {
  const client = getSupabase()
  const { data, error } = await client.storage.from('vendor-documents').createSignedUrl(path, 600)
  if (error || !data) return null
  return data.signedUrl
}

export async function reviewSellerApplication(id: string, status: Database['public']['Tables']['seller_profiles']['Row']['status'], reason?: string) {
  const { data, error } = await getSupabase().rpc('admin_review_seller', { p_seller_id: id, p_status: status, p_reason: reason ?? null })
  assertError(error)
  if (status === 'approved') {
    const { data: emailData, error: emailError } = await getSupabase().functions.invoke('commerce-email', { body: { event: 'seller_approved', seller_profile_id: id } })
    return { result: data, email_sent: !emailError && (emailData as { sent?: boolean } | null)?.sent === true }
  }
  return data
}

export async function listMarketplaceCases(status = 'all'): Promise<AdminCase[]> {
  let query = getSupabase().from('marketplace_cases').select('*').order('created_at', { ascending: false }).limit(200)
  if (status !== 'all') query = query.eq('status', status as Database['public']['Tables']['marketplace_cases']['Row']['status'])
  const { data, error } = await query
  assertError(error)
  return (data ?? []) as AdminCase[]
}

export async function decideMarketplaceCase(id: string, status: Database['public']['Tables']['marketplace_cases']['Row']['status'], decision: string) {
  const { error } = await getSupabase().rpc('admin_decide_marketplace_case', { p_case_id: id, p_status: status, p_decision: decision })
  assertError(error)
}

export async function listAdminSupportTickets(): Promise<AdminSupportInboxTicket[]> {
  const client = getSupabase()
  const [sellerResult, customerResult] = await Promise.all([
    client.from('support_tickets').select('id,created_by,subject,message,status,admin_response,created_at,updated_at').order('updated_at', { ascending: false }).limit(50),
    client.from('customer_support_tickets').select('id,requester_name,requester_email,subject,message,status,admin_response,created_at,updated_at').order('updated_at', { ascending: false }).limit(50),
  ])
  assertError(sellerResult.error); assertError(customerResult.error)
  const sellerTickets = await Promise.all((sellerResult.data ?? []).map(async (ticket) => {
    const { data } = await client.from('seller_profiles').select('shop_name,contact_email').eq('user_id', ticket.created_by).maybeSingle()
    return { ...ticket, ticket_kind: 'seller' as const, requester_name: data?.shop_name ?? 'Seller', requester_email: data?.contact_email ?? '' }
  }))
  return [...sellerTickets, ...(customerResult.data ?? []).map((ticket) => ({ ...ticket, ticket_kind: 'customer' as const }))].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 100)
}

export async function updateAdminSupportTicket(item: AdminSupportInboxTicket, status: AdminSupportInboxTicket['status'], admin_response: string): Promise<boolean> {
  const client = getSupabase()
  const table = item.ticket_kind === 'seller' ? 'support_tickets' : 'customer_support_tickets'
  const { error } = await client.from(table).update({ status, admin_response: admin_response.trim() || null, updated_at: new Date().toISOString() }).eq('id', item.id)
  assertError(error)
  const { data, error: emailError } = await client.functions.invoke('support-email', { body: { ticket_id: item.id, ticket_kind: item.ticket_kind, event: 'admin_reply' } })
  return !emailError && (data as { sent?: boolean } | null)?.sent === true
}

export async function listAdminHeroes(): Promise<AdminHero[]> {
  const { data, error } = await getSupabase().from('homepage_heroes').select('*').order('created_at', { ascending: false }).limit(100)
  assertError(error)
  return (data ?? []) as AdminHero[]
}

export async function saveAdminHero(input: Database['public']['Tables']['homepage_heroes']['Insert'], id?: string) {
  const client = getSupabase()
  const result = id
    ? await client.from('homepage_heroes').update(input).eq('id', id).select().single()
    : await client.from('homepage_heroes').insert(input).select().single()
  assertError(result.error)
  return result.data
}

export async function deleteAdminHero(id: string) {
  const { error } = await getSupabase().from('homepage_heroes').delete().eq('id', id)
  assertError(error)
}

export async function listAdminPromotions(): Promise<AdminPromotion[]> {
  const { data, error } = await getSupabase().from('promotions').select('*').order('created_at', { ascending: false }).limit(100)
  assertError(error)
  return (data ?? []) as AdminPromotion[]
}

export async function saveAdminPromotion(input: Database['public']['Tables']['promotions']['Insert'], id?: string) {
  const client = getSupabase()
  const result = id
    ? await client.from('promotions').update(input).eq('id', id).select().single()
    : await client.from('promotions').insert(input).select().single()
  assertError(result.error)
  return result.data
}

export async function deleteAdminPromotion(id: string) {
  const { error } = await getSupabase().from('promotions').delete().eq('id', id)
  assertError(error)
}

export async function uploadPublicMedia(file: File, folder = "categories"): Promise<string> {
  if (file.size > 8 * 1024 * 1024) throw new Error("Images must be 8 MB or smaller.")
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) throw new Error("Choose a JPG, PNG, WebP or AVIF image.")
  const client = getSupabase()
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "")
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const upload = await client.storage.from("product-images").upload(path, file, { upsert: false, contentType: file.type })
  assertError(upload.error)
  const { data } = client.storage.from("product-images").getPublicUrl(path)
  return data.publicUrl
}
