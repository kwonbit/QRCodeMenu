import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const menu = [
  { id: 'hamburg', category: '식사', name: '수제 함박스테이크', desc: '촉촉한 함박과 데미글라스 소스', price: 13500, emoji: '🍛' },
  { id: 'pasta', category: '식사', name: '새우 크림 파스타', desc: '통통한 새우와 고소한 크림', price: 14500, emoji: '🍝' },
  { id: 'rice', category: '식사', name: '불고기 덮밥', desc: '달콤 짭조름한 한 끼', price: 11000, emoji: '🍚' },
  { id: 'chicken', category: '사이드', name: '치킨 가라아게', desc: '바삭하게 튀긴 한입 치킨', price: 9000, emoji: '🍗' },
  { id: 'lemon', category: '음료', name: '레몬에이드', desc: '상큼하고 시원한 에이드', price: 4500, emoji: '🍋' },
  { id: 'coffee', category: '음료', name: '아메리카노', desc: '깔끔한 향의 커피', price: 3500, emoji: '☕' },
]
const money = value => new Intl.NumberFormat('ko-KR').format(value || 0) + '원'
const statusLabels = { pending: '접수 대기', accepted: '주문 확인', preparing: '조리 중', served: '제공 완료', cancelled: '취소' }
const nextStatuses = [{ value: 'accepted', label: '주문 확인' }, { value: 'preparing', label: '조리 시작' }, { value: 'served', label: '제공 완료' }, { value: 'cancelled', label: '주문 취소' }]

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
  const [cart, setCart] = useState([])
  const [orders, setOrders] = useState([])
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
  const categories = ['전체', ...new Set(menu.map(item => item.category))]
  const filtered = category === '전체' ? menu : menu.filter(item => item.category === category)
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
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id)
    if (error) setOrderError('상태 변경 실패: ' + error.message)
    else setOrders(current => current.map(item => item.id === order.id ? { ...item, status } : item))
    setUpdatingOrder('')
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
        <nav className="tabs customer-tabs"><button className={tab === 'menu' ? 'active' : ''} onClick={() => setTab('menu')}>메뉴 주문</button><button className={tab === 'customer-orders' ? 'active' : ''} onClick={() => setTab('customer-orders')}>주문 내역 <span className="count">{customerOrders.filter(order => order.payment_status !== 'paid' && order.status !== 'cancelled').length}</span></button><button onClick={() => setTab('counter')}>카운터 / 관리자</button></nav>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>확인</button></div>}
        {tab === 'customer-orders' ? <section className="customer-history"><div className="section-heading"><div><p className="eyebrow">MY ORDERS</p><h2>주문 내역</h2></div><span className="menu-count">{customerOrders.length} ORDERS</span></div><p className="history-help">이 휴대폰에서 QR 코드로 주문한 내역입니다. 결제는 매장 카운터에서 진행해 주세요.</p>{customerOrdersLoading ? <div className="empty-orders">주문 내역을 불러오는 중...</div> : !customerOrders.length ? <div className="empty-orders">아직 주문 내역이 없습니다.</div> : <div className="customer-order-list">{customerOrders.map(order => <article className="customer-order-card" key={order.id}><div className="customer-order-head"><div><b>주문 #{String(order.id).slice(0,8).toUpperCase()}</b><small>{new Date(order.created_at).toLocaleString('ko-KR')}</small></div><span className={order.payment_status === 'paid' ? 'paid-label' : 'unpaid-label'}>{order.payment_status === 'paid' ? '결제 완료' : '결제 전'}</span></div><div className="customer-order-items">{(order.items || []).map((item,index) => <div key={index}><span>{item.item_name} × {item.quantity}</span><b>{money(item.line_total)}</b></div>)}</div><div className="customer-order-total"><span>주문 합계</span><b>{money(order.total_amount)}</b></div><div className="customer-order-foot"><span>주문 상태: {statusLabels[order.status] || order.status}</span><span>{order.payment_status === 'paid' ? '결제가 완료되었습니다.' : '카운터에서 결제해 주세요.'}</span></div></article>)}</div>}</section> : <div className="content-grid">
          <section className="menu-section">
            <div className="section-heading"><div><p className="eyebrow">OUR MENU</p><h2>오늘의 메뉴</h2></div><span className="menu-count">{filtered.length} ITEMS</span></div>
            <div className="categories">{categories.map(item => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="menu-grid">{filtered.map(item => <article className="menu-card" key={item.id}><div className="food-art">{item.emoji}<span>{item.category}</span></div><div className="food-info"><h3>{item.name}</h3><p>{item.desc}</p><div className="food-bottom"><b>{money(item.price)}</b><button aria-label={item.name + ' 담기'} onClick={() => add(item)}>+</button></div></div></article>)}</div>
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
          <nav className="tabs admin-tabs"><button className={tab === 'counter' ? 'active' : ''} onClick={() => setTab('counter')}>주문 관리</button><button className={tab === 'tables' ? 'active' : ''} onClick={() => setTab('tables')}>테이블 QR 관리</button></nav>
          {orderError && <p className="form-error">{orderError}</p>}
          {tab === 'counter' ? <>
            <div className="section-heading counter-heading"><span className="live-label">● 주문 {orders.length}건</span><span className="refresh-label">{ordersLoading ? '불러오는 중...' : '최근 주문 100건'}</span></div>
            {!orders.length ? <div className="empty-orders">저장된 주문이 없습니다.</div> : <div className="order-list">{orders.map(order => <article className="order-card" key={order.id}><div className="order-card-head"><b>테이블 {order.table_number}</b><span>{new Date(order.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div><div className="order-detail-items">{(order.order_items || []).map(item => <div key={item.id}><span>{item.item_name} × {item.quantity}</span><b>{money(item.line_total)}</b></div>)}</div><div className="order-card-bottom"><strong>{money(order.total_amount)}</strong><span className={'status status-' + order.status}>{statusLabels[order.status] || order.status}</span></div>
              <div className="order-payment-control"><label>결제 상태<select value={order.payment_status || 'unpaid'} disabled={updatingOrder === order.id} onChange={async e => { const payment_status = e.target.value; setUpdatingOrder(order.id); const { error } = await supabase.from('orders').update({ payment_status }).eq('id', order.id); if (error) setOrderError('결제 상태 변경 실패: ' + error.message); else setOrders(current => current.map(row => row.id === order.id ? { ...row, payment_status } : row)); setUpdatingOrder('') }}><option value="unpaid">결제 전</option><option value="paid">결제 완료</option></select></label></div><div className="order-actions"><label>주문 상태<select value={order.status} disabled={updatingOrder === order.id} onChange={e => updateOrderStatus(order, e.target.value)}><option value="pending">접수 대기</option>{nextStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label></div></article>)}</div>}
          </> : <div className="table-manager">
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

const visibleCustomerOrders = customerOrders.filter(
  order =>
    order.payment_status !== 'paid' &&
    order.status !== 'cancelled'
)
