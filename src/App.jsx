import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const money = value => new Intl.NumberFormat('ko-KR').format(value || 0) + '원'
const statusLabels = { pending: '접수 대기', accepted: '주문 확인', preparing: '조리 시작', served: '제공 완료', paid: '결제 완료', cancelled: '주문 취소' }
const orderStatusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }))

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const tableToken = params.get('table_token')
  const [tableNumber, setTableNumber] = useState(null)
  const [customerOrderIds, setCustomerOrderIds] = useState(() => {
    if (!tableToken) return []
    try { return JSON.parse(localStorage.getItem('qrcodemenu-orders-' + tableToken) || '[]') } catch { return [] }
  })
  const [customerOrders, setCustomerOrders] = useState([])
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(Boolean(tableToken))
  const [tableError, setTableError] = useState('')
  const [tab, setTab] = useState('menu')
  const [category, setCategory] = useState('전체')
  const [menu, setMenu] = useState([])
  const [menuCategories, setMenuCategories] = useState([])
  const [selectedMenuCategory, setSelectedMenuCategory] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [newMenuName, setNewMenuName] = useState('')
  const [newMenuDescription, setNewMenuDescription] = useState('')
  const [newMenuPrice, setNewMenuPrice] = useState('')
  const [newMenuImage, setNewMenuImage] = useState(null)
  const [menuImagePreview, setMenuImagePreview] = useState('')
  const [editingMenuId, setEditingMenuId] = useState(null)
  const [editingMenuImageUrl, setEditingMenuImageUrl] = useState('')
  const [menuSaving, setMenuSaving] = useState(false)
  const [menuOptionDrafts, setMenuOptionDrafts] = useState([])
  const [optionMenuItem, setOptionMenuItem] = useState(null)
  const [selectedMenuOptions, setSelectedMenuOptions] = useState([])
  const [cart, setCart] = useState([])
  const [orderSubmitting, setOrderSubmitting] = useState(false)
  const [cancellingCustomerOrder, setCancellingCustomerOrder] = useState('')
  const [orders, setOrders] = useState([])
  const [selectedOrderStatuses, setSelectedOrderStatuses] = useState(['pending', 'accepted', 'preparing', 'served'])
  const [selectedOrderTable, setSelectedOrderTable] = useState('all')
  const [tables, setTables] = useState([])
  const [qrImages, setQrImages] = useState({})
  const [newTableNumber, setNewTableNumber] = useState('')
  const [notice, setNotice] = useState('')
  const [counterUser, setCounterUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [orderError, setOrderError] = useState('')
  const [updatingOrder, setUpdatingOrder] = useState('')
  const categories = ['전체', ...menuCategories.filter(item => item.is_active).map(item => item.name)]
  const filtered = category === '전체' ? menu : menu.filter(item => item.category === category)
  const visibleCustomerOrders = customerOrders.filter(order => order.payment_status !== 'paid' && order.status !== 'cancelled')
  const orderTableOptions = [...new Set(tables.map(table => String(table.table_number)))].sort((a, b) => Number(a) - Number(b))
  const filteredOrders = orders.filter(order => selectedOrderStatuses.includes(order.payment_status === 'paid' ? 'paid' : order.status) && (selectedOrderTable === 'all' || String(order.table_number) === selectedOrderTable))
  const visibleCustomerOrderTotal = visibleCustomerOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
  const customerOrderStatusCounts = Object.entries(statusLabels).filter(([status]) => status !== 'cancelled').map(([status, label]) => ({ status, label, count: visibleCustomerOrders.filter(order => order.status === status).length }))
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [cart])

  useEffect(() => {
    if (!tableToken) {
      setTableNumber(Number(params.get('table') || 1))
      setTableLoading(false)
      return
    }
    if (!supabase) {
      setTableError('서비스 연결 설정이 없습니다.')
      setTableLoading(false)
      return
    }
    let active = true
    supabase.rpc('resolve_table_token', { p_table_token: tableToken }).then(({ data, error }) => {
      if (!active) return
      if (error || data == null) setTableError('유효하지 않거나 사용 중지된 테이블 QR 코드입니다.')
      else setTableNumber(Number(data))
      setTableLoading(false)
    })
    return () => { active = false }
  }, [tableToken])

  useEffect(() => {
    if (!supabase || !tableToken || !customerOrderIds.length) {
      setCustomerOrders([])
      return
    }
    let active = true
    setCustomerOrdersLoading(true)
    supabase.rpc('get_customer_orders_by_token', {
      p_table_token: tableToken,
      p_order_ids: customerOrderIds,
    }).then(({ data, error }) => {
      if (!active) return
      if (error) setNotice('주문 내역 조회 실패: ' + error.message)
      else setCustomerOrders(Array.isArray(data) ? data : [])
      setCustomerOrdersLoading(false)
    })
    return () => { active = false }
  }, [tableToken, customerOrderIds])

  useEffect(() => {
    if (!supabase) return
    let active = true
    const loadMenu = async () => {
      const [{ data: categoryRows, error: categoryError }, { data: menuRows, error: menuError }, { data: optionRows, error: optionError }] = await Promise.all([
        supabase.from('menu_categories').select('id, name, sort_order, is_active').eq('is_active', true).order('sort_order'),
        supabase.from('menu_items').select('id, category_id, name, description, price, image_url, is_available, sort_order, menu_categories(name)').eq('is_available', true).order('sort_order'),
        supabase.from('menu_options').select('id, menu_item_id, name, additional_price').eq('is_available', true).order('sort_order')
      ])
      if (!active) return
      if (categoryError) setNotice('음식종류 조회 실패: ' + categoryError.message)
      else {
        setMenuCategories(categoryRows || [])
        if (!selectedMenuCategory && categoryRows?.length) setSelectedMenuCategory(categoryRows[0].id)
      }
      if (menuError) setNotice('메뉴 조회 실패: ' + menuError.message)
      if (optionError) setNotice('메뉴 옵션 조회 실패: ' + optionError.message)
      else setMenu((menuRows || []).map(item => ({ id: item.id, category: item.menu_categories?.name || '', category_id: item.category_id, name: item.name, desc: item.description, price: item.price, image_url: item.image_url, emoji: '🍽️', options: (optionRows || []).filter(option => option.menu_item_id === item.id) })))
    }
    loadMenu()
    return () => { active = false }
  }, [counterUser])
  
  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) setAuthError(error.message)
      setCounterUser(data?.session?.user || null)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCounterUser(session?.user || null)
      setAuthError('')
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabase || !counterUser) { setOrders([]); setTables([]); return }
    let active = true
    const loadOrders = async () => {
      setOrdersLoading(true)
      setOrderError('')
      const { data, error } = await supabase.from('orders')
        .select('id, table_number, status, payment_status, total_amount, created_at, order_items(id, item_name, unit_price, quantity, line_total, selected_options)')
        .order('created_at', { ascending: false }).limit(100)
      if (!active) return
      if (error) setOrderError('주문 조회 실패: ' + error.message)
      else setOrders(data || [])
      setOrdersLoading(false)
    }
    const loadMenuManagement = async () => {
      const [{ data: categoryRows, error: categoryError }, { data: menuRows, error: menuError }, { data: optionRows, error: optionError }] = await Promise.all([
        supabase.from('menu_categories').select('id, name, sort_order, is_active').order('sort_order'),
        supabase.from('menu_items').select('id, category_id, name, description, price, image_url, is_available, sort_order, menu_categories(name)').order('sort_order'),
        supabase.from('menu_options').select('id, menu_item_id, name, additional_price').eq('is_available', true).order('sort_order')
      ])
      if (!active) return
      if (categoryError) setOrderError('음식종류 조회 실패: ' + categoryError.message)
      else {
        const activeCategories = (categoryRows || []).filter(row => row.is_active)
        setMenuCategories(activeCategories)
        if (!selectedMenuCategory && activeCategories.length) setSelectedMenuCategory(activeCategories[0].id)
      }
      if (menuError) setOrderError('메뉴 조회 실패: ' + menuError.message)
      else setMenu((menuRows || []).filter(item => item.is_available).map(item => ({ id: item.id, category: item.menu_categories?.name || '', category_id: item.category_id, name: item.name, desc: item.description, price: item.price, image_url: item.image_url, emoji: '🍽️', options: (optionRows || []).filter(option => option.menu_item_id === item.id) })))
    }
    const loadTables = async () => {
      const { data, error } = await supabase.from('restaurant_tables').select('id, table_number, table_token, is_active').order('table_number')
      if (!active) return
      if (error) setOrderError('테이블 조회 실패: ' + error.message)
      else {
        const rows = data || []
        setTables(rows)
        const images = {}
        await Promise.all(rows.map(async table => {
          const url = new URL(window.location.href)
          url.search = ''
          url.searchParams.set('table_token', table.table_token)
          images[table.id] = await QRCode.toDataURL(url.toString(), { width: 240, margin: 2, errorCorrectionLevel: 'H' })
        }))
        if (active) setQrImages(images)
      }
    }
    loadOrders()
    loadTables()
    loadMenuManagement()
    const channel = supabase.channel('counter-admin-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, loadTables)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [counterUser])

  function add(item, options = []) {
    const optionPrice = options.reduce((sum, option) => sum + Number(option.additional_price || 0), 0)
    const optionKey = options.map(option => option.id).sort().join(',')
    const cartKey = item.id + ':' + optionKey
    setCart(current => {
      const found = current.find(row => row.cartKey === cartKey)
      return found ? current.map(row => row.cartKey === cartKey ? { ...row, quantity: row.quantity + 1 } : row) : [...current, { ...item, options, cartKey, unitPrice: item.price + optionPrice, quantity: 1 }]
    })
    setOptionMenuItem(null)
    setSelectedMenuOptions([])
    setNotice(item.name + ' 메뉴를 담았습니다.')
  }
  function openMenuOptions(item) {
    if (!item.options?.length) { add(item); return }
    setOptionMenuItem(item)
    setSelectedMenuOptions([])
  }
  function changeQuantity(cartKey, amount) {
    setCart(current => current.map(item => item.cartKey === cartKey ? { ...item, quantity: item.quantity + amount } : item).filter(item => item.quantity > 0))
  }
  async function cancelCustomerOrder(order) {
    if (!tableToken || order.status !== 'pending' || cancellingCustomerOrder) return
    if (!window.confirm('이 주문을 취소하시겠습니까?')) return
    setCancellingCustomerOrder(order.id)
    setNotice('주문 취소를 처리하고 있습니다...')
    try {
      const { data, error } = await supabase.rpc('cancel_customer_order_by_token', {
        p_table_token: tableToken,
        p_order_id: order.id,
      })
      if (error) throw error
      if (!data) throw new Error('이미 주문 상태가 변경되어 취소할 수 없습니다.')
      setCustomerOrders(current => current.map(item => item.id === order.id ? { ...item, status: 'cancelled' } : item))
      setNotice('주문이 취소되었습니다.')
    } catch (error) {
      console.error('주문 취소 오류:', error)
      setNotice('주문 취소에 실패했습니다: ' + (error?.message || '알 수 없는 오류'))
    } finally {
      setCancellingCustomerOrder('')
    }
  }

  async function submitOrder() {
    if (orderSubmitting) return
    if (!cart.length) { setNotice('주문할 메뉴를 먼저 담아 주세요.'); return }
    if (tableNumber == null) { setNotice('테이블 정보를 확인하지 못했습니다. QR 코드를 다시 스캔해 주세요.'); return }
    if (!isSupabaseConfigured || !supabase) { setNotice('주문 서버 연결 설정이 없습니다. 매장 관리자에게 문의해 주세요.'); return }
    if (!tableToken) { setNotice('테이블별 QR 코드를 스캔한 화면에서 주문해 주세요.'); return }

    setOrderSubmitting(true)
    setNotice('주문을 접수하고 있습니다...')
    try {
      const { data: orderId, error } = await supabase.rpc('create_customer_order_by_token', {
        p_table_token: tableToken,
        p_items: cart.map(item => ({ menu_item_id: item.id, quantity: item.quantity, option_ids: item.options.map(option => option.id) })),
      })
      if (error) throw error
      if (!orderId) throw new Error('서버에서 주문 번호를 받지 못했습니다.')
      setCustomerOrderIds(current => {
        const next = [...new Set([...current, orderId])].slice(-30)
        localStorage.setItem('qrcodemenu-orders-' + tableToken, JSON.stringify(next))
        return next
      })
      setCart([])
      setNotice('주문이 접수되었습니다. 카운터에서 결제해 주세요.')
    } catch (error) {
      console.error('주문 접수 오류:', error)
      setNotice('주문 접수에 실패했습니다: ' + (error?.message || '알 수 없는 오류'))
    } finally {
      setOrderSubmitting(false)
    }
  }
  async function signInCounter(event) {
    event.preventDefault()
    if (!supabase) return
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
    if (error) setAuthError('로그인 실패: ' + error.message)
    else setAuthPassword('')
  }
  async function signOutCounter() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
    else { setOrders([]); setTables([]) }
  }
  async function updateOrderStatus(order, status) {
    setUpdatingOrder(order.id)
    const update = status === 'paid' ? { payment_status: 'paid' } : status === 'cancelled' ? { status: 'cancelled' } : { status, payment_status: 'unpaid' }
    const { error } = await supabase.from('orders').update(update).eq('id', order.id)
    if (error) setOrderError('상태 변경 실패: ' + error.message)
    else setOrders(current => current.map(item => item.id === order.id ? { ...item, ...update } : item))
    setUpdatingOrder('')
  }
  async function loadActiveCategories() {
    const { data, error } = await supabase.from('menu_categories').select('id, name, sort_order, is_active').eq('is_active', true).order('sort_order')
    if (error) throw error
    setMenuCategories(data || [])
    return data || []
  }
  async function createMenuCategory(event) {
    event.preventDefault()
    const name = newCategoryName.trim()
    if (!name) return
    setMenuSaving(true)
    const { error } = await supabase.from('menu_categories').insert({ name, sort_order: menuCategories.length + 1 })
    if (error) setOrderError('음식종류 등록 실패: ' + error.message)
    else {
      setNewCategoryName('')
      try {
        const data = await loadActiveCategories()
        const created = data.find(row => row.name === name)
        if (created) setSelectedMenuCategory(created.id)
        setOrderError('')
      } catch (refreshError) { setOrderError('음식종류 목록 갱신 실패: ' + refreshError.message) }
    }
    setMenuSaving(false)
  }
  function startEditCategory(item) {
    setEditingCategoryId(item.id)
    setNewCategoryName(item.name)
    setOrderError('')
  }
  function cancelEditCategory() {
    setEditingCategoryId(null)
    setNewCategoryName('')
  }
  async function saveMenuCategory(event) {
    event.preventDefault()
    const name = newCategoryName.trim()
    if (!name || !editingCategoryId) return
    setMenuSaving(true)
    const { error } = await supabase.from('menu_categories').update({ name }).eq('id', editingCategoryId)
    if (error) setOrderError('음식종류 수정 실패: ' + error.message)
    else {
      try {
        await loadActiveCategories()
        await refreshManagedMenu()
        setNewCategoryName('')
        setEditingCategoryId(null)
        setOrderError('')
      } catch (refreshError) { setOrderError('수정 후 목록 갱신 실패: ' + refreshError.message) }
    }
    setMenuSaving(false)
  }
  async function deleteMenuCategory(item) {
    if (menuSaving) return
    setMenuSaving(true)
    setOrderError('')
    const { data: linkedMenus, error: checkError } = await supabase.from('menu_items').select('id').eq('category_id', item.id).limit(1)
    if (checkError) {
      setOrderError('음식종류 사용 여부 확인 실패: ' + checkError.message)
      setMenuSaving(false)
      return
    }
    if (linkedMenus?.length) {
      setOrderError('「' + item.name + '」에 등록된 메뉴가 있어 삭제할 수 없습니다. 먼저 메뉴를 다른 음식종류로 이동하거나 메뉴를 정리해 주세요.')
      setMenuSaving(false)
      return
    }
    if (!window.confirm('음식종류 「' + item.name + '」을(를) 삭제하시겠습니까?')) {
      setMenuSaving(false)
      return
    }
    const { error } = await supabase.from('menu_categories').delete().eq('id', item.id)
    if (error) setOrderError('음식종류 삭제 실패: ' + error.message)
    else {
      try {
        const data = await loadActiveCategories()
        if (selectedMenuCategory === item.id) setSelectedMenuCategory(data[0]?.id || '')
        if (editingCategoryId === item.id) cancelEditCategory()
        setOrderError('')
      } catch (refreshError) { setOrderError('삭제 후 목록 갱신 실패: ' + refreshError.message) }
    }
    setMenuSaving(false)
  }
  function resetMenuForm() {
    setMenuOptionDrafts([])
    setEditingMenuId(null)
    setNewMenuName('')
    setNewMenuDescription('')
    setNewMenuPrice('')
    setNewMenuImage(null)
    setMenuImagePreview('')
    setEditingMenuImageUrl('')
  }
  function startEditMenu(item) {
    setEditingMenuId(item.id)
    setSelectedMenuCategory(item.category_id)
    setNewMenuName(item.name)
    setNewMenuDescription(item.desc || '')
    setNewMenuPrice(String(item.price))
    setNewMenuImage(null)
    setEditingMenuImageUrl(item.image_url || '')
    supabase.from('menu_options').select('id, name, additional_price').eq('menu_item_id', item.id).eq('is_available', true).order('sort_order').then(({ data, error }) => {
      if (error) setOrderError('메뉴 옵션 조회 실패: ' + error.message)
      else setMenuOptionDrafts((data || []).map(option => ({ name: option.name, additional_price: String(option.additional_price) })))
    })
    setMenuImagePreview(item.image_url || '')
    setOrderError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function refreshManagedMenu() {
    const { data, error } = await supabase.from('menu_items')
      .select('id, category_id, name, description, price, image_url, is_available, sort_order, menu_categories(name)')
      .eq('is_available', true).order('sort_order')
    if (error) { setOrderError('메뉴 목록 조회 실패: ' + error.message); return }
    const { data: optionRows } = await supabase.from('menu_options').select('id, menu_item_id, name, additional_price').eq('is_available', true).order('sort_order')
    setMenu((data || []).map(item => ({ id: item.id, category: item.menu_categories?.name || '', category_id: item.category_id, name: item.name, desc: item.description, price: item.price, image_url: item.image_url, emoji: '🍽️', options: (optionRows || []).filter(option => option.menu_item_id === item.id) })))
  }
  async function updateMenuItem(event) {
    event.preventDefault()
    const price = Number(newMenuPrice)
    if (!selectedMenuCategory || !newMenuName.trim() || !Number.isInteger(price) || price < 0) return
    if (newMenuImage && (!newMenuImage.type.startsWith('image/') || newMenuImage.size > 5 * 1024 * 1024)) { setOrderError('이미지는 5MB 이하만 가능합니다.'); return }
    setMenuSaving(true)
    let image_url = editingMenuImageUrl || null
    let uploadedPath = ''
    if (newMenuImage) {
      const ext = (newMenuImage.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      uploadedPath = editingMenuId + '/' + crypto.randomUUID() + '.' + ext
      const { error: uploadError } = await supabase.storage.from('menu-images').upload(uploadedPath, newMenuImage, { cacheControl: '3600', upsert: false, contentType: newMenuImage.type })
      if (uploadError) { setOrderError('음식 사진 업로드 실패: ' + uploadError.message); setMenuSaving(false); return }
      image_url = supabase.storage.from('menu-images').getPublicUrl(uploadedPath).data.publicUrl
    }
    const { error } = await supabase.from('menu_items').update({
      category_id: selectedMenuCategory, name: newMenuName.trim(),
      description: newMenuDescription.trim(), price, image_url
    }).eq('id', editingMenuId)
    if (!error) {
      const { error: removeOptionsError } = await supabase.from('menu_options').delete().eq('menu_item_id', editingMenuId)
      if (removeOptionsError) { setOrderError('기존 옵션 정리 실패: ' + removeOptionsError.message); setMenuSaving(false); return }
      const options = menuOptionDrafts.filter(option => option.name.trim()).map((option, index) => ({
        menu_item_id: editingMenuId, name: option.name.trim(), additional_price: Math.max(0, Number(option.additional_price) || 0), sort_order: index + 1
      }))
      if (options.length) {
        const { error: optionError } = await supabase.from('menu_options').insert(options)
        if (optionError) { setOrderError('메뉴 옵션 저장 실패: ' + optionError.message); setMenuSaving(false); return }
      }
    }
    if (error) {
      if (uploadedPath) await supabase.storage.from('menu-images').remove([uploadedPath])
      setOrderError('메뉴 수정 실패: ' + error.message)
    } else {
      const oldUrl = menu.find(item => item.id === editingMenuId)?.image_url
      if (oldUrl && oldUrl !== image_url) {
        try {
          const marker = '/storage/v1/object/public/menu-images/'
          const oldPath = new URL(oldUrl).pathname.split(marker)[1]
          if (oldPath) await supabase.storage.from('menu-images').remove([decodeURIComponent(oldPath)])
        } catch { /* Ignore cleanup errors; the menu update has already succeeded. */ }
      }
      await refreshManagedMenu()
      resetMenuForm()
      setOrderError('')
    }
    setMenuSaving(false)
  }
  async function deleteMenuItem(item) {
    if (!window.confirm('"' + item.name + '" 메뉴를 삭제하시겠습니까?\n주문 내역 보존을 위해 메뉴는 판매 중지 처리됩니다.')) return
    setMenuSaving(true)
    const { error } = await supabase.from('menu_items').update({ is_available: false }).eq('id', item.id)
    if (error) setOrderError('메뉴 삭제 실패: ' + error.message)
    else {
      setMenu(current => current.filter(row => row.id !== item.id))
      if (editingMenuId === item.id) resetMenuForm()
      setOrderError('')
    }
    setMenuSaving(false)
  }
  async function createMenuItem(event) {
    event.preventDefault()
    const price = Number(newMenuPrice)
    if (!selectedMenuCategory || !newMenuName.trim() || !Number.isInteger(price) || price < 0) return
    if (newMenuImage && (!newMenuImage.type.startsWith('image/') || newMenuImage.size > 5 * 1024 * 1024)) { setOrderError('이미지는 5MB 이하만 가능합니다.'); return }
    setMenuSaving(true)
    const id = crypto.randomUUID()
    let image_url = null
    if (newMenuImage) {
      const ext = (newMenuImage.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = id + '/' + crypto.randomUUID() + '.' + ext
      const { error: uploadError } = await supabase.storage.from('menu-images').upload(path, newMenuImage, { cacheControl: '3600', upsert: false, contentType: newMenuImage.type })
      if (uploadError) { setOrderError('음식 사진 업로드 실패: ' + uploadError.message); setMenuSaving(false); return }
      image_url = supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl
    }
    const { error } = await supabase.from('menu_items').insert({ id, category_id: selectedMenuCategory, name: newMenuName.trim(), description: newMenuDescription.trim(), price, image_url, sort_order: menu.filter(item => item.category_id === selectedMenuCategory).length + 1 })
    if (error) setOrderError('메뉴 등록 실패: ' + error.message)
    else {
      const options = menuOptionDrafts.filter(option => option.name.trim()).map((option, index) => ({
        menu_item_id: id, name: option.name.trim(), additional_price: Math.max(0, Number(option.additional_price) || 0), sort_order: index + 1
      }))
      if (options.length) {
        const { error: optionError } = await supabase.from('menu_options').insert(options)
        if (optionError) { setOrderError('메뉴 옵션 저장 실패: ' + optionError.message); setMenuSaving(false); return }
      }
      resetMenuForm()
      const [{ data: categoryRows }, { data: menuRows }] = await Promise.all([
        supabase.from('menu_categories').select('id, name, sort_order, is_active').eq('is_active', true).order('sort_order'),
        supabase.from('menu_items').select('id, category_id, name, description, price, image_url, is_available, sort_order, menu_categories(name)').eq('is_available', true).order('sort_order')
      ])
      const { data: optionRows } = await supabase.from('menu_options').select('id, menu_item_id, name, additional_price').eq('is_available', true).order('sort_order')
      setMenuCategories(categoryRows || [])
      setMenu((menuRows || []).map(item => ({ id: item.id, category: item.menu_categories?.name || '', category_id: item.category_id, name: item.name, desc: item.description, price: item.price, image_url: item.image_url, emoji: '🍽️', options: (optionRows || []).filter(option => option.menu_item_id === item.id) })))
      setOrderError('')
    }
    setMenuSaving(false)
  }
  async function createTable(event) {
    event.preventDefault()
    const number = Number(newTableNumber)
    if (!Number.isInteger(number) || number < 1) return
    const { error } = await supabase.from('restaurant_tables').insert({ table_number: number })
    if (error) setOrderError('테이블 생성 실패: ' + error.message)
    else { setNewTableNumber(''); setOrderError(''); }
  }
  async function toggleTable(table) {
    const { error } = await supabase.from('restaurant_tables').update({ is_active: !table.is_active }).eq('id', table.id)
    if (error) setOrderError('테이블 변경 실패: ' + error.message)
  }
  function downloadQr(table) {
    const a = document.createElement('a')
    a.href = qrImages[table.id]
    a.download = 'QRCodeMenu-table-' + table.table_number + '.png'
    a.click()
  }

  const customerBlocked = tableToken && (tableLoading || tableError || tableNumber == null)

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/"><span className="brand-mark">Q</span><span>TABLE<span className="brand-light"> ORDER</span></span></a>
      {(tab === 'menu' || tab === 'customer-orders') && !customerBlocked && <div className="table-chip">TABLE <b>{String(tableNumber ?? 1).padStart(2, '0')}</b></div>}
    </header>
    <main>
      {(tab === 'menu' || tab === 'customer-orders') ? customerBlocked ? <section className="table-error"><p className="eyebrow">TABLE ORDER</p><h2>{tableLoading ? '테이블 정보를 확인하고 있습니다...' : '테이블 QR 코드를 확인해 주세요.'}</h2><p>{tableError}</p></section> : <>
        <section className="hero">
          <p className="eyebrow">WELCOME TO OUR TABLE · TABLE {String(tableNumber ?? 1).padStart(2, '0')}</p>
          <h1>맛있는 시간을<br /><em>주문해 보세요.</em></h1>
          <p className="hero-copy">메뉴를 천천히 살펴보고 편하게 주문해 주세요.</p>
          <div className="hero-stamp">FRESH<br />& TASTY</div>
        </section>
        <nav className="tabs customer-tabs"><button className={tab === 'menu' ? 'active' : ''} onClick={() => setTab('menu')}>메뉴 주문</button><button className={tab === 'customer-orders' ? 'active' : ''} onClick={() => setTab('customer-orders')}>주문 내역 <span className="count">{visibleCustomerOrders.length}</span></button><button onClick={() => setTab('counter')}>카운터 / 관리자</button></nav>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>확인</button></div>}
        {tab === 'customer-orders' ? <section className="customer-history"><div className="section-heading"><div><p className="eyebrow">MY ORDERS</p><h2>주문 내역</h2></div><span className="menu-count">{visibleCustomerOrders.length} ORDERS</span></div><p className="history-help">이 휴대폰에서 QR 코드로 주문한 내역입니다. 결제는 매장 카운터에서 진행해 주세요.</p>{customerOrdersLoading ? <div className="empty-orders">주문 내역을 불러오는 중...</div> : !visibleCustomerOrders.length ? <div className="empty-orders">결제 전이고 취소되지 않은 주문이 없습니다.</div> : <div className="customer-order-list">{visibleCustomerOrders.map(order => <article className="customer-order-card" key={order.id}><div className="customer-order-head"><div><b>주문 #{String(order.id).slice(0,8).toUpperCase()}</b><small>{new Date(order.created_at).toLocaleString('ko-KR')}</small></div><span className={'customer-order-status status-' + (order.payment_status === 'paid' ? 'paid' : order.status)}>{statusLabels[order.payment_status === 'paid' ? 'paid' : order.status] || order.status}</span></div><div className="customer-order-items">{(order.items || []).map((item,index) => <div key={index}><span>{item.item_name} × {item.quantity}{item.selected_options?.length > 0 && <small className="order-option-note">{item.selected_options.map(option => option.name + ' (+' + money(option.additional_price) + ')').join(', ')}</small>}</span><b>{money(item.line_total)}</b></div>)}</div><div className="customer-order-total"><span>주문 합계</span><b>{money(order.total_amount)}</b></div><div className="customer-order-foot"><span>{order.payment_status === 'paid' ? '결제가 완료되었습니다.' : '결제는 매장 카운터에서 진행됩니다.'}</span>{order.status === 'pending' && order.payment_status !== 'paid' && <button type="button" className="customer-cancel-button" disabled={cancellingCustomerOrder === order.id} onClick={() => cancelCustomerOrder(order)}>{cancellingCustomerOrder === order.id ? '취소 처리 중...' : '주문 취소'}</button>}</div></article>)}</div>} {!customerOrdersLoading && <section className="customer-order-summary"><div className="customer-summary-heading"><div><p className="eyebrow">ORDER SUMMARY</p><h3>주문 현황</h3></div><span>현재 미결제 주문 기준</span></div><div className="customer-status-grid">{customerOrderStatusCounts.map(item => <div className={'customer-status-item status-' + item.status} key={item.status}><span>{item.label}</span><b>{item.count}<small>건</small></b></div>)}</div><div className="customer-summary-totals"><div><span>총 주문 건수</span><b>{visibleCustomerOrders.length}<small>건</small></b></div><div className="customer-summary-amount"><span>총 주문 금액</span><b>{money(visibleCustomerOrderTotal)}</b></div></div></section>}</section> : <div className="content-grid">
          <section className="menu-section">
            <div className="section-heading"><div><p className="eyebrow">OUR MENU</p><h2>오늘의 메뉴</h2></div><span className="menu-count">{filtered.length} ITEMS</span></div>
            <div className="categories">{categories.map(item => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="menu-grid">{filtered.map(item => <article className="menu-card" key={item.id}><div className="food-art">{item.image_url ? <img src={item.image_url} alt={item.name} /> : item.emoji}<span>{item.category}</span></div><div className="food-info"><h3>{item.name}</h3><p>{item.desc}</p><div className="food-bottom"><b>{money(item.price)}</b><button aria-label={item.name + ' 담기'} onClick={() => openMenuOptions(item)}>+</button></div></div></article>)}</div>
          </section>
          <aside className="cart-card">
            <div className="cart-title"><div><p className="eyebrow">YOUR ORDER</p><h2>테이블 {String(tableNumber ?? 1).padStart(2, '0')} 주문 내역</h2></div><span>{cart.reduce((s, i) => s + i.quantity, 0)}개</span></div>
            {cart.length ? <div className="cart-items">{cart.map(item => <div className="cart-row" key={item.cartKey}><div><b>{item.name}</b>{item.options?.length > 0 && <small>{item.options.map(option => option.name).join(', ')}</small>}<small>{money(item.unitPrice)}</small></div><div className="quantity"><button onClick={() => changeQuantity(item.cartKey, -1)}>−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.cartKey, 1)}>+</button></div></div>)}</div> : <div className="empty-cart"><span>🛍️</span><b>아직 담긴 메뉴가 없어요.</b><small>마음에 드는 메뉴를 선택해 주세요.</small></div>}
            <div className="cart-total"><span>총 주문 금액</span><b>{money(total)}</b></div>
            <button type="button" className="order-button" disabled={!cart.length || orderSubmitting} onClick={submitOrder}>{orderSubmitting ? '주문 접수 중...' : '주문하기'} <span>→</span></button>
            <p className="payment-note">결제는 매장 카운터에서 진행됩니다.</p>
          </aside>
        </div>}
      </> : <section className="counter-section">
        {authLoading ? <div className="empty-orders">직원 로그인 상태를 확인하고 있습니다...</div> : !counterUser ? <div className="staff-login"><div><p className="eyebrow">STAFF ACCESS</p><h2>카운터 직원 로그인</h2><p className="login-description">직원 계정으로 로그인하면 주문 및 테이블 QR을 관리할 수 있습니다.</p></div>
          {!isSupabaseConfigured ? <p className="form-error">Supabase 환경변수가 설정되지 않았습니다.</p> : <form onSubmit={signInCounter}><label>이메일<input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required /></label><label>비밀번호<input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required /></label>{authError && <p className="form-error">{authError}</p>}<button className="order-button">로그인</button></form>}
        </div> : <>
          <div className="counter-toolbar"><div><p className="eyebrow">MANAGEMENT</p><h2>매장 관리</h2><span className="staff-email">{counterUser.email}</span></div><button className="logout-button" onClick={signOutCounter}>로그아웃</button></div>
          <nav className="tabs admin-tabs"><button className={tab === 'counter' ? 'active' : ''} onClick={() => setTab('counter')}>주문 관리</button><button className={tab === 'menu-management' ? 'active' : ''} onClick={() => setTab('menu-management')}>메뉴 관리</button><button className={tab === 'tables' ? 'active' : ''} onClick={() => setTab('tables')}>테이블 QR 관리</button></nav>
          {orderError && <p className="form-error">{orderError}</p>}
          {tab === 'counter' ? <>
            <div className="section-heading counter-heading"><span className="live-label">● 주문 {filteredOrders.length}건 표시 / 전체 {orders.length}건</span><span className="refresh-label">{ordersLoading ? '불러오는 중...' : '최근 주문 100건'}</span></div>
            <section className="order-filter-panel"><div className="table-filter-row"><label htmlFor="order-table-filter">테이블 선택</label><select id="order-table-filter" value={selectedOrderTable} onChange={e => setSelectedOrderTable(e.target.value)}><option value="all">전체 테이블</option>{orderTableOptions.map(number => <option key={number} value={number}>테이블 {number}</option>)}</select></div><div className="order-status-filter"><div className="order-filter-heading"><b>주문 상태 필터</b><span>여러 상태를 선택할 수 있습니다.</span></div><div className="order-filter-options">{orderStatusOptions.map(option => <button type="button" key={option.value} className={selectedOrderStatuses.includes(option.value) ? 'selected' : ''} aria-pressed={selectedOrderStatuses.includes(option.value)} onClick={() => setSelectedOrderStatuses(current => current.includes(option.value) ? current.filter(value => value !== option.value) : [...current, option.value])}>{option.label}</button>)}</div></div></section>
            {!filteredOrders.length ? <div className="empty-orders">{orders.length ? '선택한 주문 상태에 해당하는 주문이 없습니다.' : '저장된 주문이 없습니다.'}</div> : <div className="order-list">{filteredOrders.map(order => <article className="order-card" key={order.id}><div className="order-card-head"><b>테이블 {order.table_number}</b><span>{new Date(order.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div><div className="order-detail-items">{(order.order_items || []).map(item => <div key={item.id}><span>{item.item_name} × {item.quantity}{item.selected_options?.length > 0 && <small className="order-option-note">{item.selected_options.map(option => option.name + ' (+' + money(option.additional_price) + ')').join(', ')}</small>}</span><b>{money(item.line_total)}</b></div>)}</div><div className="order-card-bottom"><strong>{money(order.total_amount)}</strong><span className={'status status-' + (order.payment_status === 'paid' ? 'paid' : order.status)}>{statusLabels[order.payment_status === 'paid' ? 'paid' : order.status] || order.status}</span></div>
              <div className="order-actions"><span className="order-actions-title">주문 상태 변경</span><div className="order-status-actions">{orderStatusOptions.map(option => <button type="button" key={option.value} className={(order.payment_status === 'paid' ? 'paid' : order.status) === option.value ? 'active status-' + option.value : ''} disabled={updatingOrder === order.id} aria-pressed={(order.payment_status === 'paid' ? 'paid' : order.status) === option.value} onClick={() => updateOrderStatus(order, option.value)}>{option.label}</button>)}</div></div></article>)}</div>}
          </> : tab === 'menu-management' ? <div className="menu-manager">
            <div className="section-heading"><div><p className="eyebrow">MENU MANAGEMENT</p><h2>음식종류 및 메뉴 관리</h2></div><span className="menu-count">{menuCategories.length} CATEGORIES</span></div>
            <section className="menu-admin-panel"><div className="menu-admin-title"><h3>음식종류 등록 / 수정 / 삭제</h3><p>음식종류를 선택한 뒤 수정 또는 삭제하거나, 새 이름을 입력해 추가할 수 있습니다.</p></div><form className="menu-category-form" onSubmit={event => { event.preventDefault(); if (editingCategoryId) saveMenuCategory(event); else createMenuCategory(event) }}><input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="음식종류 입력 (예: 면류, 밥류, 요리류)" maxLength="40" required /><div className="menu-category-form-actions"><button type="button" className="order-button" disabled={menuSaving} onClick={createMenuCategory}>추가</button><button type="button" className="logout-button" disabled={menuSaving || !selectedMenuCategory} onClick={() => { if (editingCategoryId) saveMenuCategory({ preventDefault: () => {} }); else { const selected = menuCategories.find(item => item.id === selectedMenuCategory); if (selected) startEditCategory(selected) } }}>{editingCategoryId ? '수정 저장' : '수정'}</button><button type="button" className="menu-delete-button" disabled={menuSaving || !selectedMenuCategory} onClick={() => { const selected = menuCategories.find(item => item.id === selectedMenuCategory); if (selected) deleteMenuCategory(selected) }}>삭제</button>{editingCategoryId && <button type="button" className="category-cancel-button" disabled={menuSaving} onClick={cancelEditCategory}>취소</button>}</div></form><div className="menu-category-manage-list">{menuCategories.map(item => <button type="button" key={item.id} className={'menu-category-chip ' + (selectedMenuCategory === item.id ? 'selected' : '')} onClick={() => { setSelectedMenuCategory(item.id); if (editingCategoryId) cancelEditCategory() }}>{item.name}</button>)}</div></section>
            <section className="menu-admin-panel"><div className="menu-admin-title"><h3>{editingMenuId ? '메뉴 수정' : (menuCategories.find(item => item.id === selectedMenuCategory)?.name || '음식종류') + ' 메뉴 등록'}</h3><p>{editingMenuId ? '메뉴 정보를 수정한 뒤 저장해 주세요.' : '선택한 음식종류 아래에 메뉴를 추가합니다.'}</p></div>{!menuCategories.length ? <div className="empty-orders">먼저 음식종류를 등록해 주세요.</div> : <form className="menu-item-form" onSubmit={editingMenuId ? updateMenuItem : createMenuItem}><label>음식종류<select value={selectedMenuCategory} onChange={e => setSelectedMenuCategory(e.target.value)} required>{menuCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>메뉴명<input value={newMenuName} onChange={e => setNewMenuName(e.target.value)} placeholder="예: 김치찌개" maxLength="100" required /></label><label>메뉴 설명<input value={newMenuDescription} onChange={e => setNewMenuDescription(e.target.value)} placeholder="메뉴에 대한 간단한 설명" maxLength="200" /></label><label>판매 가격(원)<input type="number" min="0" step="100" value={newMenuPrice} onChange={e => setNewMenuPrice(e.target.value)} placeholder="예: 9000" required /></label><label className="menu-image-field">음식 사진<input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0] || null; setNewMenuImage(file); setMenuImagePreview(file ? URL.createObjectURL(file) : editingMenuImageUrl) }} /><small>JPG, PNG, WEBP · 최대 5MB</small></label>{menuImagePreview && <div className="menu-image-preview"><img src={menuImagePreview} alt="음식 사진 미리보기" /><button type="button" onClick={() => { setNewMenuImage(null); setEditingMenuImageUrl(''); setMenuImagePreview('') }}>사진 제거</button></div>}<div className="menu-options-editor"><div className="menu-options-heading"><b>메뉴 옵션 관리</b><button type="button" className="logout-button" onClick={() => setMenuOptionDrafts(current => [...current, { name: '', additional_price: '0' }])}>+ 옵션 추가</button></div><p>예: 곱빼기 +2,000원, 면 추가 +1,000원</p>{menuOptionDrafts.map((option, index) => <div className="menu-option-draft" key={index}><input aria-label="옵션명" value={option.name} onChange={e => setMenuOptionDrafts(current => current.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} placeholder="옵션명 (예: 곱빼기)" /><input aria-label="추가 금액" type="number" min="0" step="100" value={option.additional_price} onChange={e => setMenuOptionDrafts(current => current.map((row, i) => i === index ? { ...row, additional_price: e.target.value } : row))} placeholder="추가 금액" /><button type="button" className="menu-delete-button" onClick={() => setMenuOptionDrafts(current => current.filter((_, i) => i !== index))}>삭제</button></div>)}</div><div className="menu-form-actions"><button className="order-button" disabled={menuSaving}>{menuSaving ? (editingMenuId ? "저장 중..." : "등록 중...") : (editingMenuId ? "수정 내용 저장" : "메뉴 등록")}</button>{editingMenuId && <button type="button" className="logout-button" disabled={menuSaving} onClick={resetMenuForm}>수정 취소</button>}</div></form>}</section>
            <section className="menu-admin-panel"><div className="menu-admin-title"><h3>{menuCategories.find(item => item.id === selectedMenuCategory)?.name || '선택한 종류'} 메뉴 목록</h3><p>선택한 음식종류에 등록된 판매 메뉴입니다.</p></div><div className="managed-menu-list">{menu.filter(item => item.category_id === selectedMenuCategory).map(item => <article key={item.id}><div className="managed-menu-info">{item.image_url && <img src={item.image_url} alt={item.name} />}<div><b>{item.name}</b><span>{item.desc || '설명 없음'}</span><strong>{money(item.price)}</strong></div></div><div className="managed-menu-actions"><button type="button" className="logout-button" disabled={menuSaving} onClick={() => startEditMenu(item)}>수정</button><button type="button" className="menu-delete-button" disabled={menuSaving} onClick={() => deleteMenuItem(item)}>삭제</button></div></article>)}{!menu.some(item => item.category_id === selectedMenuCategory) && <div className="empty-orders">등록된 메뉴가 없습니다.</div>}</div></section>
          </div> : <div className="table-manager">
            <div className="section-heading"><div><p className="eyebrow">TABLE QR CODES</p><h2>테이블별 QR 코드</h2></div><span className="menu-count">{tables.length} TABLES</span></div>
            <form className="add-table-form" onSubmit={createTable}><label>새 테이블 번호<input type="number" min="1" value={newTableNumber} onChange={e => setNewTableNumber(e.target.value)} placeholder="예: 2" required /></label><button className="order-button">테이블 추가</button></form>
            <p className="table-manager-help">QR 코드를 다운로드하여 테이블에 부착하세요. 손님은 스마트폰 카메라로 스캔하면 해당 테이블 번호가 표시된 메뉴로 이동합니다.</p>
            <div className="table-qr-grid">{tables.map(table => <article className="table-qr-card" key={table.id}><div className="table-qr-head"><b>테이블 {String(table.table_number).padStart(2, '0')}</b><span className={table.is_active ? 'table-active' : 'table-inactive'}>{table.is_active ? '사용 중' : '사용 중지'}</span></div>{qrImages[table.id] && <img src={qrImages[table.id]} alt={'테이블 ' + table.table_number + ' QR 코드'} /> }<small className="qr-url">{window.location.origin + '/?table_token=' + table.table_token}</small><button className="order-button" disabled={!table.is_active || !qrImages[table.id]} onClick={() => downloadQr(table)}>QR 코드 다운로드</button><button className="logout-button" onClick={() => toggleTable(table)}>{table.is_active ? '사용 중지' : '다시 활성화'}</button></article>)}</div>
          </div>}
        </>}
      </section>}
    </main>
    {optionMenuItem && <div className="option-modal-backdrop" onClick={() => setOptionMenuItem(null)}><section className="option-modal" onClick={event => event.stopPropagation()}><button type="button" className="option-modal-close" onClick={() => setOptionMenuItem(null)}>×</button><p className="eyebrow">CUSTOMIZE YOUR MENU</p><h2>{optionMenuItem.name}</h2><p className="option-base-price">기본 가격 {money(optionMenuItem.price)}</p><div className="customer-option-list">{optionMenuItem.options.map(option => <label key={option.id}><input type="checkbox" checked={selectedMenuOptions.includes(option.id)} onChange={event => setSelectedMenuOptions(current => event.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} /><span>{option.name}</span><b>+{money(option.additional_price)}</b></label>)}</div><div className="option-modal-total"><span>선택 옵션 포함 금액</span><b>{money(optionMenuItem.price + optionMenuItem.options.filter(option => selectedMenuOptions.includes(option.id)).reduce((sum, option) => sum + Number(option.additional_price), 0))}</b></div><button type="button" className="order-button" onClick={() => add(optionMenuItem, optionMenuItem.options.filter(option => selectedMenuOptions.includes(option.id)))}>장바구니 담기</button></section></div>}
    <footer><span>TABLE ORDER</span><span>편안한 식사 되세요 :)</span></footer>
  </div>
}
