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
export type AdminProductDeletionRequest = { id: string; product_id: string; product_name: string; product_image_url: string | null; seller_id: string; shop_name: string; reason: string; status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; created_at: string }
export type AdminCase = Database['public']['Tables']['marketplace_cases']['Row']
export type AdminCaseDetail = AdminCase & {
  order: Pick<Database['public']['Tables']['orders']['Row'], 'id' | 'order_number' | 'customer_name' | 'customer_phone' | 'customer_email' | 'shipping_address_snapshot' | 'total' | 'order_status' | 'created_at'> | null
  order_item: Pick<Database['public']['Tables']['order_items']['Row'], 'id' | 'product_id' | 'product_name_snapshot' | 'sku_snapshot' | 'variant_snapshot' | 'quantity' | 'unit_price' | 'line_total' | 'seller_name_snapshot'> | null
  product_image_url: string | null
  evidence_url: string | null
}
export type AdminStoreSettings = Database['public']['Tables']['store_settings']['Row']
export type AdminFoodDeliverySettings = { hub_lat: number | null; hub_lng: number | null; radius_km: number; updated_at: string }
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

export interface AdminCustomerReview {
  review_type: 'product' | 'seller'
  review_id: string
  target_name: string
  buyer_name: string
  rating: number
  title: string | null
  comment: string | null
  status: 'pending' | 'approved' | 'rejected'
  order_number: string
  created_at: string
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

function getProductImageBucket(storagePath: string, productId: string): 'product-images' | 'product-drafts' {
  // Vendor uploads may use either <user-id>/<product-id>/<file> (legacy)
  // or <product-id>/<user-id>/<file> (current vendor flow). Admin drafts
  // use <product-id>/<file>. Detect both vendor layouts before assuming draft.
  const segments = storagePath.split('/').filter(Boolean)
  return (segments[0] === productId && segments.length >= 3)
    || segments[1] === productId
    ? 'product-images'
    : 'product-drafts'
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
    client.from('seller_profiles').select('id, shop_name, user_id').limit(1000),
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
      const bucket = getProductImageBucket(primary.storage_path, row.id)
      if (bucket === 'product-images') {
        imageUrl = client.storage.from(bucket).getPublicUrl(primary.storage_path).data.publicUrl
      } else {
        const signed = await client.storage.from(bucket).createSignedUrl(primary.storage_path, 600)
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
  const { data, error } = await getSupabase().from('categories').select('id, parent_id, name, slug, description, eyebrow, image_url, is_active, is_coming_soon, is_food_category, sort_order, seo_title, seo_description, created_at, updated_at').order('sort_order').order('name').limit(200)
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
    client.rpc('admin_get_product_by_id', { p_product_id: id }),
    client.from('product_variants').select('id, product_id, option_label, option_value, sku, price_override, attributes, is_active, sort_order, created_at, updated_at').eq('product_id', id).order('sort_order').limit(100),
    client.from('product_images').select('id, product_id, image_url, storage_path, alt_text, sort_order, is_primary, created_at').eq('product_id', id).order('sort_order').limit(100),
    client.from('product_inventory').select('id, variant_id, quantity, low_stock_threshold, updated_at').eq('product_id', id).limit(200),
  ])
  assertError(products.error); assertError(variants.error); assertError(images.error); assertError(inventory.error)
  const productRow = (products.data ?? []).find((row) => row.id === id)
  if (!productRow) return null
  const [seller, category] = await Promise.all([
    productRow.seller_id ? client.from('seller_profiles').select('id, shop_name, slug, status, user_id').eq('id', productRow.seller_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    productRow.category_id ? client.from('categories').select('id, name, slug').eq('id', productRow.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  assertError(seller.error); assertError(category.error)
  const mappedImages = await Promise.all((images.data ?? []).map(async (image) => {
    if (image.image_url) return { ...image, display_url: image.image_url }
    if (!image.storage_path) return { ...image, display_url: null }
    const bucket = getProductImageBucket(image.storage_path, id)
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
    const sourceBucket = getProductImageBucket(image.storage_path, productId)
    if (sourceBucket === 'product-images') {
      // Vendor images are uploaded directly into the public bucket. The old
      // code incorrectly looked for these objects in product-drafts, causing
      // Storage NoSuchKey / Object not found when admins published the listing.
      const url = client.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl
      const saved = await client.from('product_images').update({ image_url: url, storage_path: null }).eq('id', image.id)
      assertError(saved.error)
      continue
    }
    const { data: file, error: downloadError } = await client.storage.from('product-drafts').download(image.storage_path)
    if (downloadError || !file) {
      throw new Error(`Draft image is missing from product storage (${image.storage_path}). Re-upload this image before publishing.`)
    }
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

export async function listAdminProductDeletionRequests(): Promise<AdminProductDeletionRequest[]> {
  const { data, error } = await getSupabase().rpc('admin_list_product_deletion_requests')
  assertError(error)
  return data ?? []
}

async function removeProductStorageFiles(productId: string) {
  const client = getSupabase()
  const { data: images, error } = await client.from('product_images').select('storage_path').eq('product_id', productId)
  assertError(error)
  const paths = [...new Set((images ?? []).map((row) => row.storage_path).filter((path): path is string => Boolean(path)))]
  if (!paths.length) return
  // Vendor uploads live in product-images; admin draft uploads live in product-drafts.
  // Remove from both buckets so deletion is independent of the product's current publication state.
  const [publicRemoval, draftRemoval] = await Promise.all([
    client.storage.from('product-images').remove(paths),
    client.storage.from('product-drafts').remove(paths),
  ])
  assertError(publicRemoval.error)
  assertError(draftRemoval.error)
}

export async function deleteAdminProductPermanently(productId: string): Promise<void> {
  await removeProductStorageFiles(productId)
  const { error } = await getSupabase().rpc('admin_delete_product', { p_product_id: productId })
  assertError(error)
}

export async function reviewAdminProductDeletion(requestId: string, approve: boolean, note?: string): Promise<void> {
  if (!approve && (note ?? '').trim().length < 3) throw new Error('A reason is required when declining a deletion request.')
  if (approve) {
    const requests = await listAdminProductDeletionRequests()
    const request = requests.find((item) => item.id === requestId)
    if (!request) throw new Error('Deletion request was not found.')
    await removeProductStorageFiles(request.product_id)
  }
  const { error } = await getSupabase().rpc('admin_review_product_deletion', {
    p_request_id: requestId, p_approve: approve, p_admin_note: note?.trim() || null,
  })
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

export async function listAdminOrders(search = '', status = 'all', page = 0, pageSize = 25, sort = 'created_at.desc', vendorId = 'all'): Promise<{ items: (AdminOrder & { vendor_names: string[]; has_food_items: boolean })[]; count: number }> {
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
  const rows = (data ?? []) as AdminOrder[]
  const orderIds = rows.map((row) => row.id)
  const { data: orderItems, error: orderItemsError } = orderIds.length ? await client.from('order_items').select('order_id, seller_id, product_id').in('order_id', orderIds).limit(10000) : { data: [], error: null }
  assertError(orderItemsError)
  const sellerIds = [...new Set((orderItems ?? []).map((item) => item.seller_id).filter((id): id is string => Boolean(id)))]
  const { data: sellers, error: sellersError } = sellerIds.length ? await client.from('seller_profiles').select('id, shop_name').in('id', sellerIds).limit(1000) : { data: [], error: null }
  assertError(sellersError)
  const productIds = [...new Set((orderItems ?? []).map((item) => item.product_id).filter((id): id is string => Boolean(id)))]
  const { data: orderProducts, error: orderProductsError } = productIds.length ? await (client as any).from('products').select('id, category_id, food_product_type').in('id', productIds) : { data: [], error: null }
  assertError(orderProductsError)
  const categoryIds: string[] = [...new Set<string>((orderProducts ?? []).map((product: any) => product.category_id as string | null).filter((id: string | null): id is string => Boolean(id)))]
  const { data: orderCategories, error: orderCategoriesError } = categoryIds.length ? await client.from('categories').select('id, name').in('id', categoryIds) : { data: [], error: null }
  assertError(orderCategoriesError)
  const categoryNames = new Map((orderCategories ?? []).map((category) => [category.id, category.name]))
  const foodProductIds = new Set((orderProducts ?? []).filter((product: any) =>
    /food|grocery/i.test(categoryNames.get(product.category_id) ?? '') || Boolean(product.food_product_type)
  ).map((product: any) => String(product.id)))
  const foodOrders = new Set((orderItems ?? []).filter((item) => item.product_id && foodProductIds.has(item.product_id)).map((item) => item.order_id))
  const sellerNames = new Map((sellers ?? []).map((seller) => [seller.id, seller.shop_name]))
  const namesByOrder = new Map<string, Set<string>>()
  for (const item of orderItems ?? []) { if (!item.seller_id) continue; const name = sellerNames.get(item.seller_id); if (!name) continue; const names = namesByOrder.get(item.order_id) ?? new Set<string>(); names.add(name); namesByOrder.set(item.order_id, names) }
  return { items: rows.map((row) => ({ ...row, vendor_names: [...(namesByOrder.get(row.id) ?? [])], has_food_items: foodOrders.has(row.id) })), count: count ?? 0 }
}

export async function getAdminOrderDetail(id: string) {
  const client = getSupabase()
  const [order, items, notes, history] = await Promise.all([
    client.from('orders').select('id, order_number, customer_id, customer_name, customer_phone, customer_email, shipping_address_snapshot, customer_note, currency, subtotal, delivery_fee, discount_amount, total, order_status, payment_method, payment_status, delivery_lat, delivery_lng, delivery_location_name, delivery_location_captured_at, expected_delivery_date, delivery_window_start, delivery_window_end, delivery_note, delivery_timing_confirmed_at, delivery_timing_confirmed_by, created_at, updated_at').eq('id', id).single(),
    client.from('order_items').select('id, order_id, product_id, variant_id, seller_id, seller_name_snapshot, product_name_snapshot, sku_snapshot, variant_snapshot, product_snapshot, quantity, unit_price, line_total, vendor_fulfillment_status, tracking_number, tracking_url, vendor_note, vendor_updated_at, created_at').eq('order_id', id).order('created_at').limit(100),
    client.from('admin_order_notes').select('id, order_id, created_by, note, created_at').eq('order_id', id).order('created_at', { ascending: false }).limit(100),
    client.from('admin_audit_logs').select('id, action, entity, entity_id, details, created_at').eq('entity', 'orders').eq('entity_id', id).order('created_at', { ascending: false }).limit(100),
  ])
  assertError(order.error); assertError(items.error)
  const productIds = [...new Set((items.data ?? []).map((item) => item.product_id).filter((value): value is string => Boolean(value)))]
  const productRows = productIds.length ? await (client as any).from('products').select('id, food_product_type, categories(name)').in('id', productIds) : { data: [], error: null }
  assertError(productRows.error)
  const productMap = new Map<string, any>((productRows.data ?? []).map((product: any) => [String(product.id), product]))
  const enrichedItems = (items.data ?? []).map((item) => {
    const product = item.product_id ? productMap.get(String(item.product_id)) : undefined
    const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories
    return { ...item, food_product_type: product?.food_product_type ?? null, product_category_name: category?.name ?? null }
  })
  const warnings = [notes.error && `Admin notes unavailable: ${notes.error.message}`, history.error && `Status history unavailable: ${history.error.message}`].filter((message): message is string => Boolean(message))
  return { order: order.data as AdminOrder, items: enrichedItems, notes: notes.data ?? [], history: history.data ?? [], warnings }
}

export type AdminDeliveryTiming = { expected_delivery_date: string; delivery_window_start?: string | null; delivery_window_end?: string | null; delivery_note?: string | null }

export async function updateOrder(id: string, order_status: Database['public']['Tables']['orders']['Row']['order_status'], deliveryTiming?: AdminDeliveryTiming) {
  const client = getSupabase()
  if (order_status === 'confirmed') {
    if (!deliveryTiming?.expected_delivery_date) throw new Error('Delivery date is required before confirming an order.')
    const { error: timingError } = await client.from('orders').update({
      expected_delivery_date: deliveryTiming.expected_delivery_date,
      delivery_window_start: deliveryTiming.delivery_window_start ?? '09:00',
      delivery_window_end: deliveryTiming.delivery_window_end ?? '21:00',
      delivery_note: deliveryTiming.delivery_note?.trim() || null,
      delivery_timing_confirmed_at: new Date().toISOString(),
    }).eq('id', id)
    assertError(timingError)
    const { error } = await (client as any).rpc('admin_confirm_customer_order', {
      p_order_id: id, p_decision: 'confirmed', p_note: 'Confirmed after marketplace phone verification.',
    })
    assertError(error)
  } else {
    const { error } = await client.from('orders').update({ order_status }).eq('id', id)
    assertError(error)
  }

  if (['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].includes(order_status)) {
    const { data: updatedOrder, error: lookupError } = await (client as any).from('orders').select('confirmation_status').eq('id', id).maybeSingle()
    assertError(lookupError)
    const emailStatus = order_status === 'cancelled' && updatedOrder?.confirmation_status === 'not_reachable' ? 'rejected' : order_status
    const { data, error: emailError } = await client.functions.invoke('commerce-email', {
      body: { event: 'order_status', order_id: id, status: emailStatus },
    })
    if (emailError) { console.error('Order status email invocation failed:', emailError.message); return false }
    if (!data?.sent) { console.warn('Order status email was not sent:', data); return false }
  }
  return true
}

export async function rejectAdminOrder(id: string) {
  const client = getSupabase()
  const { error } = await (client as any).rpc('admin_confirm_customer_order', {
    p_order_id: id,
    p_decision: 'not_reachable',
    p_note: 'Order rejected after customer confirmation attempt.',
  })
  assertError(error)
  const { data, error: emailError } = await client.functions.invoke('commerce-email', {
    body: { event: 'order_status', order_id: id, status: 'rejected' },
  })
  if (emailError) console.error('Order rejection email invocation failed:', emailError.message)
  else if (!data?.sent) console.warn('Order rejection email was not sent:', data)
}

export async function listAdminVendorPickups(orderId?: string) {
  const { data, error } = await (getSupabase() as any).rpc('admin_list_vendor_pickups', {
    p_order_id: orderId ?? null,
  })
  assertError(error)
  return data ?? []
}

export async function markAdminVendorPickedUp(pickupId: string) {
  const { data, error } = await (getSupabase() as any).rpc('admin_mark_vendor_picked_up', {
    p_pickup_id: pickupId,
  })
  assertError(error)
  if (!data) throw new Error('Vendor pickup could not be marked collected.')
  return data
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


export async function saveAdminProductInventory(productId: string, variantId: string | null, quantity: number, note = 'Product editor stock update') {
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error('Stock must be a whole number of zero or more.')
  const client = getSupabase()
  const { error: trackingError } = await client.from('products').update({ track_inventory: true }).eq('id', productId)
  assertError(trackingError)
  let query = client.from('product_inventory').select('id').eq('product_id', productId)
  query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null)
  const { data: existing, error: lookupError } = await query.maybeSingle()
  assertError(lookupError)
  if (existing?.id) {
    const { error } = await client.rpc('admin_adjust_inventory', { p_inventory_id: existing.id, p_new_quantity: quantity, p_note: note.trim() || 'Admin stock update' })
    assertError(error)
    return
  }
  const { error } = await client.from('product_inventory').insert({ product_id: productId, variant_id: variantId, quantity, low_stock_threshold: 5 })
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

export async function getAdminFoodDeliverySettings(): Promise<AdminFoodDeliverySettings> {
  const { data, error } = await getSupabase().rpc('admin_get_jtbazar_food_delivery_settings')
  assertError(error)
  return data as unknown as AdminFoodDeliverySettings
}

export async function updateAdminFoodDeliverySettings(input: { hub_lat: number | null; hub_lng: number | null; radius_km: number }): Promise<AdminFoodDeliverySettings> {
  const { data, error } = await getSupabase().rpc('admin_update_jtbazar_food_delivery_settings', {
    p_hub_lat: input.hub_lat,
    p_hub_lng: input.hub_lng,
    p_radius_km: input.radius_km,
  })
  assertError(error)
  return data as unknown as AdminFoodDeliverySettings
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
  if (status === 'approved' || status === 'rejected') {
    const event = status === 'approved' ? 'seller_approved' : 'seller_rejected'
    const { data: emailData, error: emailError } = await getSupabase().functions.invoke('commerce-email', {
      body: { event, seller_profile_id: id },
    })
    return {
      result: data,
      email_sent: !emailError && (emailData as { sent?: boolean } | null)?.sent === true,
      email_error: emailError?.message ?? ((emailData as { error?: string } | null)?.error ?? null),
    }
  }
  return { result: data, email_sent: true }
}

export async function listMarketplaceCases(status = 'all'): Promise<AdminCaseDetail[]> {
  const client = getSupabase()
  let query = client.from('marketplace_cases').select('*').order('created_at', { ascending: false }).limit(200)
  if (status !== 'all') query = query.eq('status', status as Database['public']['Tables']['marketplace_cases']['Row']['status'])
  const { data, error } = await query
  assertError(error)
  const cases = (data ?? []) as AdminCase[]
  if (!cases.length) return []
  const orderIds = [...new Set(cases.map((item) => item.order_id))]
  const itemIds = [...new Set(cases.map((item) => item.order_item_id).filter((id): id is string => Boolean(id)))]
  const [ordersResult, itemsResult] = await Promise.all([
    client.from('orders').select('id, order_number, customer_name, customer_phone, customer_email, shipping_address_snapshot, total, order_status, created_at').in('id', orderIds),
    itemIds.length ? client.from('order_items').select('id, product_id, product_name_snapshot, sku_snapshot, variant_snapshot, quantity, unit_price, line_total, seller_name_snapshot').in('id', itemIds) : Promise.resolve({ data: [], error: null }),
  ])
  assertError(ordersResult.error); assertError(itemsResult.error)
  const orders = new Map((ordersResult.data ?? []).map((row) => [row.id, row]))
  const orderItems = new Map((itemsResult.data ?? []).map((row) => [row.id, row]))
  const productIds = [...new Set((itemsResult.data ?? []).map((row) => row.product_id).filter((id): id is string => Boolean(id)))]
  const imagesResult = productIds.length ? await client.from('product_images').select('product_id, image_url, storage_path, is_primary, sort_order').in('product_id', productIds).order('sort_order') : { data: [], error: null }
  assertError(imagesResult.error)
  const imageByProduct = new Map<string, string>()
  for (const image of imagesResult.data ?? []) {
    if (imageByProduct.has(image.product_id)) continue
    const url = image.image_url || (image.storage_path ? client.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl : '')
    if (url) imageByProduct.set(image.product_id, url)
  }
  return Promise.all(cases.map(async (item) => {
    const orderItem = item.order_item_id ? orderItems.get(item.order_item_id) : undefined
    const signed = item.evidence_path ? await client.storage.from('complaint-evidence').createSignedUrl(item.evidence_path, 600) : null
    return {
      ...item,
      order: orders.get(item.order_id) ?? null,
      order_item: orderItem ?? null,
      product_image_url: orderItem?.product_id ? imageByProduct.get(orderItem.product_id) ?? null : null,
      evidence_url: signed?.data?.signedUrl ?? null,
    }
  }))
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


export async function listAdminCustomerReviews(): Promise<AdminCustomerReview[]> {
  const { data, error } = await (getSupabase() as any).rpc('admin_list_customer_reviews')
  assertError(error)
  return (data ?? []) as AdminCustomerReview[]
}

export async function setAdminCustomerReviewStatus(reviewType: 'product' | 'seller', reviewId: string, status: 'approved' | 'rejected' | 'pending'): Promise<void> {
  const { error } = await (getSupabase() as any).rpc('admin_set_customer_review_status', { p_review_type: reviewType, p_review_id: reviewId, p_status: status })
  assertError(error)
}

export async function setAdminVendorLock(id: string, locked: boolean, reason?: string) {
  const { data, error } = await getSupabase().rpc('admin_set_vendor_lock', { p_seller_id: id, p_locked: locked, p_reason: reason ?? null })
  assertError(error)
  return data as AdminSeller
}
