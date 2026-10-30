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
const money = value => new Intl.NumberFormat('ko-KR').format(value) + '원'

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const tableNumber = Number(params.get('table') || 1)
  const [tab, setTab] = useState('menu')
  const [category, setCategory] = useState('전체')
  const [cart, setCart] = useState([])
  const [orders, setOrders] = useState([])
  const [notice, setNotice] = useState('')
  const categories = ['전체', ...new Set(menu.map(item => item.category))]
  const filtered = category === '전체' ? menu : menu.filter(item => item.category === category)
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])

  useEffect(() => {
    if (!supabase) return
    const channel = supabase.channel('counter-order-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        if (payload.eventType === 'INSERT') {
          setOrders(current => [payload.new, ...current])
        }
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

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
      const { data, error } = await supabase.rpc('create_customer_order', {
        p_table_number: tableNumber,
        p_items: cart.map(item => ({ menu_item_id: item.id, quantity: item.quantity })),
        p_payment_method: 'counter',
      })
      if (error) {
        setNotice('주문 접수에 실패했습니다: ' + error.message)
        return
      }
      setOrders(current => [{ id: data, table_number: tableNumber, total_amount: total, status: 'pending', created_at: new Date().toISOString(), demo_items: cart }, ...current])
    } else {
      setOrders(current => [{ id: crypto.randomUUID(), table_number: tableNumber, total_amount: total, status: 'pending', created_at: new Date().toISOString(), demo_items: cart }, ...current])
    }
    setCart([])
    setNotice('주문이 접수되었습니다. 카운터에서 결제해 주세요.')
  }

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
        <button className={tab === 'counter' ? 'active' : ''} onClick={() => setTab('counter')}>카운터 보기 <span className="count">{orders.length}</span></button>
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
        <div className="section-heading"><div><p className="eyebrow">LIVE ORDERS</p><h2>주문 접수 현황</h2></div><span className="live-label">● 주문 {orders.length}건</span></div>
        {!orders.length ? <div className="empty-orders">아직 접수된 주문이 없습니다.</div> : <div className="order-list">{orders.map(order => <article className="order-card" key={order.id}><div className="order-card-head"><b>테이블 {order.table_number}</b><span>{new Date(order.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div><p>{order.demo_items?.map(i => i.name + ' × ' + i.quantity).join(', ') || '주문 상세는 직원 인증 화면에서 확인할 수 있습니다.'}</p><strong>{money(order.total_amount || 0)}</strong><span className="status">{order.status === 'pending' ? '접수 대기' : order.status}</span></article>)}</div>}
        <p className="counter-hint">실서비스에서는 직원 로그인과 주문 조회 권한(RLS)을 설정한 뒤 카운터 화면을 운영해야 합니다.</p>
      </section>}
    </main>
    <footer><span>TABLE ORDER</span><span>편안한 식사 되세요 :)</span></footer>
  </div>
}
