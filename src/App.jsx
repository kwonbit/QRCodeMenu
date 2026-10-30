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
  const [newMenuName, setNewMenuName] = useState('')
  const [newMenuDescription, setNewMenuDescription] = useState('')
  const [newMenuPrice, setNewMenuPrice] = useState('')
  const [newMenuImage, setNewMenuImage] = useState(null)
  const [menuImagePreview, setMenuImagePreview] = useState('')
  const [menuSaving, setMenuSaving] = useState(false)
  const [cart, setCart] = useState([])
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
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])

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
      const [{ data: categoryRows, error: categoryError }, { data: menuRows, error: menuError }] = await Promise.all([
        supabase.from('menu_categories').select('id, name, sort_order, is_active').eq('is_active', true).order('sort_order'),
        supabase.from('menu_items').select('id, category_id, name, description, price, image_url, is_available, sort_order, menu_categories(name)').eq('is_available', true).order('sort_order')
      ])
      if (!active) return
      if (categoryError) setNotice('음식종류 조회 실패: ' + categoryError.message)
      else {
        setMenuCategories(categoryRows || [])
        if (!selectedMenuCategory && categoryRows?.length) setSelectedMenuCategory(categoryRows[0].id)
      }
      if (menuError) setNotice('메뉴 조회 실패: ' + menuError.message)
      else setMenu((menuRows || []).map(item => ({ id: item.id, category: item.menu_categories?.name || '', category_id: item.category_id, name: item.name, desc: item.description, price: item.price, image_url: item.image_url, emoji: '🍽️' })))
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
        .select('id, table_number, status, payment_status, total_amount, created_at, order_items(id, item_name, unit_price, quantity, line_total)')
        .order('created_at', { ascending: false }).limit(100)
      if (!active) return
      if (error) setOrderError('주문 조회 실패: ' + error.message)
      else setOrders(data || [])
      setOrdersLoading(false)
    }
    const loadMenuManagement = async () => {
      const [{ data: categoryRows, error: categoryError }, { data: menuRows, error: menuError }] = await Promise.all([
        supabase.from('menu_categories').select('id, name, sort_order, is_active').order('sort_order'),
        supabase.from('menu_items').select('id, category_id, name, description, price, image_url, is_available, sort_order, menu_categories(name)').order('sort_order')
      ])
      if (!active) return
      if (categoryError) setOrderError('음식종류 조회 실패: ' + categoryError.message)
      else {
        const activeCategories = (categoryRows || []).filter(row => row.is_active)
        setMenuCategories(activeCategories)
        if (!selectedMenuCategory && activeCategories.length) setSelectedMenuCategory(activeCategories[0].id)
      }
      if (menuError) setOrderError('메뉴 조회 실패: ' + menuError.message)
      else setMenu((menuRows || []).filter(item => item.is_available).map(item => ({ id: item.id, category: item.menu_categories?.name || '', category_id: item.category_id, name: item.name, desc: item.description, price: item.price, image_url: item.image_url, emoji: '🍽️' })))
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

  function add(item) {
    setCart(current => {
      const found = current.find(row => row.id === item.id)
      return found ? current.map(row => row.id === item.id ? { ...row, quantity: row.quantity + 1 } : row) : [...current, { ...item, quantity: 1 }]
    })
    setNotice(item.name + ' 메뉴를 담았습니다.')
  }
  function changeQuantity(id, amount) {
    setCart(current => current.map(item => item.id === id ? { ...item, quantity: item.quantity + amount } : item).filter(item => item.quantity > 0))
  }
  async function submitOrder() {
    if (!cart.length || tableNumber == null) return
    if (supabase) {
      const args = tableToken
        ? { p_table_token: tableToken, p_items: cart.map(item => ({ menu_item_id: item.id, quantity: item.quantity })) }
        : null
      if (!args) { setNotice('테이블 QR 코드로 접속해 주세요.'); return }
      const { data: orderId, error } = await supabase.rpc('create_customer_order_by_token', args)
      if (error) { setNotice('주문 접수에 실패했습니다: ' + error.message); return }
      setCustomerOrderIds(current => {
        const next = [...new Set([...current, orderId])].slice(-30)
        localStorage.setItem('qrcodemenu-orders-' + tableToken, JSON.stringify(next))
        return next
      })
    }
    setCart([])
    setNotice('주문이 접수되었습니다. 카운터에서 결제해 주세요.')
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
  async function createMenuCategory(event) {
    event.preventDefault()
    const name = newCategoryName.trim()
    if (!name) return
    setMenuSaving(true)
    const { error } = await supabase.from('menu_categories').insert({ name, sort_order: menuCategories.length + 1 })
    if (error) setOrderError('음식종류 등록 실패: ' + error.message)
    else {
      setNewCategoryName('')
      const { data } = await supabase.from('menu_categories').select('id, name, sort_order, is_active').eq('is_active', true).order('sort_order')
      setMenuCategories(data || [])
      const created = (data || []).find(row => row.name === name)
      if (created) setSelectedMenuCategory(created.id)
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
      setNewMenuName(''); setNewMenuDescription(''); setNewMenuPrice(''); setNewMenuImage(null); setMenuImagePreview('')
      const [{ data: categoryRows }, { data: menuRows }] = await Promise.all([
        supabase.from('menu_categories').select('id, name, sort_order, is_active').eq('is_active', true).order('sort_order'),
        supabase.from('menu_items').select('id, category_id, name, description, price, image_url, is_available, sort_order, menu_categories(name)').eq('is_available', true).order('sort_order')
      ])
      setMenuCategories(categoryRows || [])
      setMenu((menuRows || []).map(item => ({ id: item.id, category: item.menu_categories?.name || '', category_id: item.category_id, name: item.name, desc: item.description, price: item.price, image_url: item.image_url, emoji: '🍽️' })))
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
        {tab === 'customer-orders' ? <section className="customer-history"><div className="section-heading"><div><p className="eyebrow">MY ORDERS</p><h2>주문 내역</h2></div><span className="menu-count">{visibleCustomerOrders.length} ORDERS</span></div><p className="history-help">이 휴대폰에서 QR 코드로 주문한 내역입니다. 결제는 매장 카운터에서 진행해 주세요.</p>{customerOrdersLoading ? <div className="empty-orders">주문 내역을 불러오는 중...</div> : !visibleCustomerOrders.length ? <div className="empty-orders">결제 전이고 취소되지 않은 주문이 없습니다.</div> : <div className="customer-order-list">{visibleCustomerOrders.map(order => <article className="customer-order-card" key={order.id}><div className="customer-order-head"><div><b>주문 #{String(order.id).slice(0,8).toUpperCase()}</b><small>{new Date(order.created_at).toLocaleString('ko-KR')}</small></div><span className={order.payment_status === 'paid' ? 'paid-label' : 'unpaid-label'}>{order.payment_status === 'paid' ? '결제 완료' : '결제 전'}</span></div><div className="customer-order-items">{(order.items || []).map((item,index) => <div key={index}><span>{item.item_name} × {item.quantity}</span><b>{money(item.line_total)}</b></div>)}</div><div className="customer-order-total"><span>주문 합계</span><b>{money(order.total_amount)}</b></div><div className="customer-order-foot"><span>주문 상태: {statusLabels[order.status] || order.status}</span><span>{order.payment_status === 'paid' ? '결제가 완료되었습니다.' : '카운터에서 결제해 주세요.'}</span></div></article>)}</div>} {!customerOrdersLoading && <section className="customer-order-summary"><div className="customer-summary-heading"><div><p className="eyebrow">ORDER SUMMARY</p><h3>주문 현황</h3></div><span>현재 미결제 주문 기준</span></div><div className="customer-status-grid">{customerOrderStatusCounts.map(item => <div className={'customer-status-item status-' + item.status} key={item.status}><span>{item.label}</span><b>{item.count}<small>건</small></b></div>)}</div><div className="customer-summary-totals"><div><span>총 주문 건수</span><b>{visibleCustomerOrders.length}<small>건</small></b></div><div className="customer-summary-amount"><span>총 주문 금액</span><b>{money(visibleCustomerOrderTotal)}</b></div></div></section>}</section> : <div className="content-grid">
          <section className="menu-section">
            <div className="section-heading"><div><p className="eyebrow">OUR MENU</p><h2>오늘의 메뉴</h2></div><span className="menu-count">{filtered.length} ITEMS</span></div>
            <div className="categories">{categories.map(item => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="menu-grid">{filtered.map(item => <article className="menu-card" key={item.id}><div className="food-art">{item.image_url ? <img src={item.image_url} alt={item.name} /> : item.emoji}<span>{item.category}</span></div><div className="food-info"><h3>{item.name}</h3><p>{item.desc}</p><div className="food-bottom"><b>{money(item.price)}</b><button aria-label={item.name + ' 담기'} onClick={() => add(item)}>+</button></div></div></article>)}</div>
          </section>
          <aside className="cart-card">
            <div className="cart-title"><div><p className="eyebrow">YOUR ORDER</p><h2>테이블 {String(tableNumber ?? 1).padStart(2, '0')} 주문 내역</h2></div><span>{cart.reduce((s, i) => s + i.quantity, 0)}개</span></div>
            {cart.length ? <div className="cart-items">{cart.map(item => <div className="cart-row" key={item.id}><div><b>{item.name}</b><small>{money(item.price)}</small></div><div className="quantity"><button onClick={() => changeQuantity(item.id, -1)}>−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)}>+</button></div></div>)}</div> : <div className="empty-cart"><span>🛍️</span><b>아직 담긴 메뉴가 없어요.</b><small>마음에 드는 메뉴를 선택해 주세요.</small></div>}
            <div className="cart-total"><span>총 주문 금액</span><b>{money(total)}</b></div>
            <button className="order-button" disabled={!cart.length} onClick={submitOrder}>주문하기 <span>→</span></button>
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
            {!filteredOrders.length ? <div className="empty-orders">{orders.length ? '선택한 주문 상태에 해당하는 주문이 없습니다.' : '저장된 주문이 없습니다.'}</div> : <div className="order-list">{filteredOrders.map(order => <article className="order-card" key={order.id}><div className="order-card-head"><b>테이블 {order.table_number}</b><span>{new Date(order.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div><div className="order-detail-items">{(order.order_items || []).map(item => <div key={item.id}><span>{item.item_name} × {item.quantity}</span><b>{money(item.line_total)}</b></div>)}</div><div className="order-card-bottom"><strong>{money(order.total_amount)}</strong><span className={'status status-' + (order.payment_status === 'paid' ? 'paid' : order.status)}>{statusLabels[order.payment_status === 'paid' ? 'paid' : order.status] || order.status}</span></div>
              <div className="order-actions"><span className="order-actions-title">주문 상태 변경</span><div className="order-status-actions">{orderStatusOptions.map(option => <button type="button" key={option.value} className={(order.payment_status === 'paid' ? 'paid' : order.status) === option.value ? 'active status-' + option.value : ''} disabled={updatingOrder === order.id} aria-pressed={(order.payment_status === 'paid' ? 'paid' : order.status) === option.value} onClick={() => updateOrderStatus(order, option.value)}>{option.label}</button>)}</div></div></article>)}</div>}
          </> : tab === 'menu-management' ? <div className="menu-manager">
            <div className="section-heading"><div><p className="eyebrow">MENU MANAGEMENT</p><h2>음식종류 및 메뉴 관리</h2></div><span className="menu-count">{menuCategories.length} CATEGORIES</span></div>
            <section className="menu-admin-panel"><div className="menu-admin-title"><h3>음식종류 등록</h3><p>메뉴를 분류할 음식종류를 먼저 등록해 주세요.</p></div><form className="menu-category-form" onSubmit={createMenuCategory}><input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="예: 식사, 사이드, 음료" maxLength="40" required /><button className="order-button" disabled={menuSaving}>음식종류 추가</button></form><div className="menu-category-chips">{menuCategories.map(item => <button type="button" key={item.id} className={selectedMenuCategory === item.id ? 'selected' : ''} onClick={() => setSelectedMenuCategory(item.id)}>{item.name}</button>)}</div></section>
            <section className="menu-admin-panel"><div className="menu-admin-title"><h3>{menuCategories.find(item => item.id === selectedMenuCategory)?.name || '음식종류'} 메뉴 등록</h3><p>선택한 음식종류 아래에 메뉴를 추가합니다.</p></div>{!menuCategories.length ? <div className="empty-orders">먼저 음식종류를 등록해 주세요.</div> : <form className="menu-item-form" onSubmit={createMenuItem}><label>음식종류<select value={selectedMenuCategory} onChange={e => setSelectedMenuCategory(e.target.value)} required>{menuCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>메뉴명<input value={newMenuName} onChange={e => setNewMenuName(e.target.value)} placeholder="예: 김치찌개" maxLength="100" required /></label><label>메뉴 설명<input value={newMenuDescription} onChange={e => setNewMenuDescription(e.target.value)} placeholder="메뉴에 대한 간단한 설명" maxLength="200" /></label><label>판매 가격(원)<input type="number" min="0" step="100" value={newMenuPrice} onChange={e => setNewMenuPrice(e.target.value)} placeholder="예: 9000" required /></label><label className="menu-image-field">음식 사진<input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0] || null; setNewMenuImage(file); setMenuImagePreview(file ? URL.createObjectURL(file) : "") }} /><small>JPG, PNG, WEBP · 최대 5MB</small></label>{menuImagePreview && <div className="menu-image-preview"><img src={menuImagePreview} alt="첨부할 음식 사진 미리보기" /><button type="button" onClick={() => { setNewMenuImage(null); setMenuImagePreview("") }}>사진 제거</button></div>}<button className="order-button" disabled={menuSaving}>{menuSaving ? "등록 중..." : "메뉴 등록"}</button></form>}</section>
            <section className="menu-admin-panel"><div className="menu-admin-title"><h3>{menuCategories.find(item => item.id === selectedMenuCategory)?.name || '선택한 종류'} 메뉴 목록</h3><p>선택한 음식종류에 등록된 판매 메뉴입니다.</p></div><div className="managed-menu-list">{menu.filter(item => item.category_id === selectedMenuCategory).map(item => <article key={item.id}><div><b>{item.name}</b><span>{item.desc || '설명 없음'}</span></div><strong>{money(item.price)}</strong></article>)}{!menu.some(item => item.category_id === selectedMenuCategory) && <div className="empty-orders">등록된 메뉴가 없습니다.</div>}</div></section>
          </div> : <div className="table-manager">
            <div className="section-heading"><div><p className="eyebrow">TABLE QR CODES</p><h2>테이블별 QR 코드</h2></div><span className="menu-count">{tables.length} TABLES</span></div>
            <form className="add-table-form" onSubmit={createTable}><label>새 테이블 번호<input type="number" min="1" value={newTableNumber} onChange={e => setNewTableNumber(e.target.value)} placeholder="예: 2" required /></label><button className="order-button">테이블 추가</button></form>
            <p className="table-manager-help">QR 코드를 다운로드하여 테이블에 부착하세요. 손님은 스마트폰 카메라로 스캔하면 해당 테이블 번호가 표시된 메뉴로 이동합니다.</p>
            <div className="table-qr-grid">{tables.map(table => <article className="table-qr-card" key={table.id}><div className="table-qr-head"><b>테이블 {String(table.table_number).padStart(2, '0')}</b><span className={table.is_active ? 'table-active' : 'table-inactive'}>{table.is_active ? '사용 중' : '사용 중지'}</span></div>{qrImages[table.id] && <img src={qrImages[table.id]} alt={'테이블 ' + table.table_number + ' QR 코드'} /> }<small className="qr-url">{window.location.origin + '/?table_token=' + table.table_token}</small><button className="order-button" disabled={!table.is_active || !qrImages[table.id]} onClick={() => downloadQr(table)}>QR 코드 다운로드</button><button className="logout-button" onClick={() => toggleTable(table)}>{table.is_active ? '사용 중지' : '다시 활성화'}</button></article>)}</div>
          </div>}
        </>}
      </section>}
    </main>
    <footer><span>TABLE ORDER</span><span>편안한 식사 되세요 :)</span></footer>
  </div>
}
