import { useEffect, useMemo, useState } from 'react'
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
const nextStatuses = [
  { value: 'accepted', label: '주문 확인' },
  { value: 'preparing', label: '조리 시작' },
  { value: 'served', label: '제공 완료' },
  { value: 'cancelled', label: '주문 취소' },
]

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const tableNumber = Number(params.get('table') || 1)
  const [tab, setTab] = useState('menu')
  const [category, setCategory] = useState('전체')
  const [cart, setCart] = useState([])
  const [orders, setOrders] = useState([])
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
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !counterUser) {
      setOrders([])
      return
    }
    let active = true
    const loadOrders = async () => {
      setOrdersLoading(true)
      setOrderError('')
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_number, status, total_amount, created_at, order_items(id, item_name, unit_price, quantity, line_total)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (!active) return
      if (error) setOrderError('주문을 불러오지 못했습니다. 직원 권한과 RLS 설정을 확인해 주세요. ' + error.message)
      else setOrders(data || [])
      setOrdersLoading(false)
    }
    loadOrders()
    const channel = supabase.channel('counter-order-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadOrders)
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [counterUser])

  function add(item) {
    setCart(current => {
      const found = current.find(row => row.id === item.id)
      return found
        ? current.map(row => row.id === item.id ? { ...row, quantity: row.quantity + 1 } : row)
        : [...current, { ...item, quantity: 1 }]
    })
    setNotice(item.name + ' 메뉴를 담았습니다.')
  }
  function changeQuantity(id, amount) {
    setCart(current => current.map(item => item.id === id ? { ...item, quantity: item.quantity + amount } : item).filter(item => item.quantity > 0))
  }
  async function submitOrder() {
    if (!cart.length) return
    if (supabase) {
      const { error } = await supabase.rpc('create_customer_order', {
        p_table_number: tableNumber,
        p_items: cart.map(item => ({ menu_item_id: item.id, quantity: item.quantity })),
        p_payment_method: 'counter',
      })
      if (error) {
        setNotice('주문 접수에 실패했습니다: ' + error.message)
        return
      }
    }
    setCart([])
    setNotice('주문이 접수되었습니다. 카운터에서 결제해 주세요.')
  }

  async function signInCounter(event) {
    event.preventDefault()
    if (!supabase) return
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
    if (error) setAuthError('로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요. ' + error.message)
    else setAuthPassword('')
  }

  async function signOutCounter() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
    else setOrders([])
  }

  async function updateOrderStatus(order, status) {
    if (!supabase) return
    setUpdatingOrder(order.id)
    setOrderError('')
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id)
    if (error) setOrderError('상태 변경에 실패했습니다. ' + error.message)
    else setOrders(current => current.map(item => item.id === order.id ? { ...item, status } : item))
    setUpdatingOrder('')
  }

  const isCounterTab = tab === 'counter'

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark">Q</span><span>TABLE<span className="brand-light"> ORDER</span></span></a>
      <div className="table-chip">TABLE <b>{String(tableNumber).padStart(2, '0')}</b></div>
    </header>
    <main>
      <section className="hero">
        <p className="eyebrow">WELCOME TO OUR TABLE</p>
        <h1>맛있는 시간을<br /><em>주문해 보세요.</em></h1>
        <p className="hero-copy">메뉴를 천천히 살펴보고 편하게 주문해 주세요.</p>
        <div className="hero-stamp">FRESH<br />& TASTY</div>
      </section>
      <nav className="tabs">
        <button className={tab === 'menu' ? 'active' : ''} onClick={() => setTab('menu')}>고객 메뉴</button>
        <button className={tab === 'counter' ? 'active' : ''} onClick={() => setTab('counter')}>카운터 보기 <span className="count">{counterUser ? orders.length : '직원'}</span></button>
      </nav>
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>확인</button></div>}
      {tab === 'menu' ? <div className="content-grid">
        <section className="menu-section">
          <div className="section-heading"><div><p className="eyebrow">OUR MENU</p><h2>오늘의 메뉴</h2></div><span className="menu-count">{filtered.length} ITEMS</span></div>
          <div className="categories">{categories.map(item => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <div className="menu-grid">{filtered.map(item => <article className="menu-card" key={item.id}>
            <div className="food-art">{item.emoji}<span>{item.category}</span></div>
            <div className="food-info"><h3>{item.name}</h3><p>{item.desc}</p><div className="food-bottom"><b>{money(item.price)}</b><button aria-label={item.name + ' 담기'} onClick={() => add(item)}>+</button></div></div>
          </article>)}</div>
        </section>
        <aside className="cart-card">
          <div className="cart-title"><div><p className="eyebrow">YOUR ORDER</p><h2>주문 내역</h2></div><span>{cart.reduce((s, i) => s + i.quantity, 0)}개</span></div>
          {cart.length ? <div className="cart-items">{cart.map(item => <div className="cart-row" key={item.id}><div><b>{item.name}</b><small>{money(item.price)}</small></div><div className="quantity"><button onClick={() => changeQuantity(item.id, -1)}>−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)}>+</button></div></div>)}</div> : <div className="empty-cart"><span>🛍️</span><b>아직 담긴 메뉴가 없어요.</b><small>마음에 드는 메뉴를 선택해 주세요.</small></div>}
          <div className="cart-total"><span>총 주문 금액</span><b>{money(total)}</b></div>
          <button className="order-button" disabled={!cart.length} onClick={submitOrder}>주문하기 <span>→</span></button>
          <p className="payment-note">결제는 매장 카운터에서 진행됩니다.</p>
        </aside>
      </div> : <section className="counter-section">
        {authLoading ? <div className="empty-orders">직원 로그인 상태를 확인하고 있습니다...</div> : !counterUser ? <div className="staff-login">
          <div><p className="eyebrow">STAFF ACCESS</p><h2>카운터 직원 로그인</h2><p className="login-description">등록된 직원 계정으로 로그인하면 저장된 주문을 불러옵니다.</p></div>
          {!isSupabaseConfigured ? <p className="form-error">Supabase 환경변수가 설정되지 않았습니다.</p> : <form onSubmit={signInCounter}>
            <label>이메일<input type="email" autoComplete="username" value={authEmail} onChange={event => setAuthEmail(event.target.value)} placeholder="직원 이메일" required /></label>
            <label>비밀번호<input type="password" autoComplete="current-password" value={authPassword} onChange={event => setAuthPassword(event.target.value)} placeholder="비밀번호" required /></label>
            {authError && <p className="form-error">{authError}</p>}
            <button className="order-button" type="submit">로그인</button>
          </form>}
        </div> : <>
          <div className="counter-toolbar"><div><p className="eyebrow">LIVE ORDERS</p><h2>주문 접수 현황</h2><span className="staff-email">{counterUser.email}</span></div><button className="logout-button" onClick={signOutCounter}>로그아웃</button></div>
          <div className="section-heading counter-heading"><span className="live-label">● 주문 {orders.length}건</span><span className="refresh-label">{ordersLoading ? '불러오는 중...' : '최근 주문 100건'}</span></div>
          {orderError && <p className="form-error">{orderError}</p>}
          {ordersLoading && !orders.length ? <div className="empty-orders">저장된 주문을 불러오는 중입니다...</div> : !orders.length ? <div className="empty-orders">저장된 주문이 없습니다.</div> : <div className="order-list">{orders.map(order => <article className="order-card" key={order.id}>
            <div className="order-card-head"><b>테이블 {order.table_number}</b><span>{new Date(order.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
            <div className="order-detail-items">{(order.order_items || []).map(item => <div key={item.id}><span>{item.item_name} × {item.quantity}</span><b>{money(item.line_total)}</b></div>)}</div>
            <div className="order-card-bottom"><strong>{money(order.total_amount)}</strong><span className={'status status-' + order.status}>{statusLabels[order.status] || order.status}</span></div>
            <div className="order-actions"><label>주문 상태<select value={order.status} disabled={updatingOrder === order.id} onChange={event => updateOrderStatus(order, event.target.value)}><option value="pending">접수 대기</option>{nextStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label></div>
          </article>)}</div>}
        </>}
      </section>}
    </main>
    <footer><span>TABLE ORDER</span><span>편안한 식사 되세요 :)</span></footer>
  </div>
}
