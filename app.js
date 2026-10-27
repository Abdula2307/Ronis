const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let products = [], orders = [], cur = null, tab = 'orders', token = sessionStorage.getItem('rt') || '';

async function api(a, data = {}) {
  const r = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ a, ...data }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && a !== 'login') { token = ''; sessionStorage.removeItem('rt'); renderAdmin(); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong.');
  return j;
}
async function loadProducts() { try { const r = await fetch('/api'); products = r.ok ? await r.json() : []; } catch (e) { products = []; } }
async function loadOrders() { orders = await api('orders'); }

function go(h) { location.hash = h; route(); }
async function route() {
  const a = location.hash === '#admin';
  $('shop').classList.toggle('hide', a); $('adm').classList.toggle('hide', !a);
  await loadProducts();
  if (a) { if (token) { try { await loadOrders(); } catch (e) {} } renderAdmin(); } else renderShop();
}

/* ---------- Shop ---------- */
function renderShop() {
  if (!products.length) { $('grid').innerHTML = '<div class="msg" style="grid-column:1/-1">Products coming soon.</div>'; return; }
  $('grid').innerHTML = products.map(p => {
    const out = p.stock <= 0;
    return `<div class="card"><div class="pic">${p.img ? `<img src="${esc(p.img)}" alt="">` : '📦'}</div><h3>${esc(p.name)}</h3><small>${esc(p.desc)}</small>
    ${p.offer ? `<div class="offer">🎁 ${esc(p.offer)}</div>` : ''}<div class="price">$${Number(p.price).toFixed(2)}</div><div class="left">${out ? 'Sold out' : p.stock + ' left'}</div>
    <button class="btn k sm" ${out ? 'disabled' : ''} onclick="openM('${esc(p.id)}')">Order now →</button></div>`;
  }).join('');
}
function openM(id) { cur = products.find(p => p.id === id); $('oTitle').textContent = 'Order: ' + cur.name; $('oErr').textContent = ''; $('ord').classList.add('on'); }
function closeM() { $('ord').classList.remove('on'); }
async function placeOrder() {
  const name = $('oName').value.trim(), phone = $('oPhone').value.trim(), address = $('oAddr').value.trim(), qty = +$('oQty').value;
  if (!name || !phone || !address || qty < 1) { $('oErr').textContent = 'Please fill in your name, phone number and delivery address.'; return; }
  if (qty > cur.stock) { $('oErr').textContent = 'Only ' + cur.stock + ' left.'; return; }
  try { await api('order', { pid: cur.id, qty, name, phone, address }); }
  catch (e) { $('oErr').textContent = e.message; return; }
  closeM(); ['oName', 'oPhone', 'oAddr'].forEach(i => $(i).value = ''); $('oQty').value = 1;
  alert('Thank you! Your order was received.');
}

/* ---------- Admin ---------- */
function renderAdmin() {
  const b = $('admBody');
  if (!token) {
    b.innerHTML = `<div class="box" style="margin:40px auto"><h3 style="margin:0">Admin login</h3>
    <label>Email</label><input id="aE" type="email" autocomplete="username"><label>Password</label><input id="aP" type="password" autocomplete="current-password">
    <p id="aErr" style="color:#c0392b;font-size:14px"></p><button class="btn k" style="width:100%" onclick="login()">Log in</button></div>`; return;
  }
  const pend = orders.filter(o => o.status === 'pending').length;
  b.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:20px 0">Admin panel</h2><button class="btn sm" onclick="logout()">Log out</button></div>
  <div class="tabs"><button class="btn ${tab === 'orders' ? 'on' : ''}" onclick="tab='orders';renderAdmin()">Orders (${pend} new)</button><button class="btn ${tab === 'products' ? 'on' : ''}" onclick="tab='products';renderAdmin()">Products</button></div>
  <div>${tab === 'orders' ? ordersHTML() : productsHTML()}</div>`;
}
async function login() {
  try { const r = await api('login', { email: $('aE').value, password: $('aP').value }); token = r.token; sessionStorage.setItem('rt', token); await loadOrders(); renderAdmin(); }
  catch (e) { $('aErr').textContent = e.message; }
}
function logout() { token = ''; sessionStorage.removeItem('rt'); renderAdmin(); }
function ordersHTML() {
  if (!orders.length) return '<div class="msg">No orders yet.</div>';
  return orders.map(o => `<div class="row"><div><b>${esc(o.product)}</b> × ${o.qty} — $${o.total} <span class="pill ${o.status === 'confirmed' ? 'ok' : ''}">${esc(o.status)}</span><br>
  <small>👤 ${esc(o.name)} · 📞 ${esc(o.phone)}<br>📍 ${esc(o.address)}<br>${new Date(o.at).toLocaleString()}</small></div>
  <div>${o.status === 'pending' ? `<button class="btn sm" onclick="act('confirm','${esc(o.id)}')">Confirm</button> ` : ''}<button class="btn sm" onclick="if(confirm('Delete order?'))act('delOrder','${esc(o.id)}')">Delete</button></div></div>`).join('');
}
async function act(a, id) { try { await api(a, { id }); await Promise.all([loadOrders(), loadProducts()]); renderAdmin(); } catch (e) { alert(e.message); } }
function productsHTML() {
  return `<div class="row" style="display:block"><b>Add product</b>
  <label>Product picture</label><input type="file" id="pImg" accept="image/*"><label>Product name</label><input id="pName"><label>Description</label><textarea id="pDesc" rows="2"></textarea>
  <label>Price ($)</label><input id="pPrice" type="number" step="0.01"><label>How many left (stock)</label><input id="pStock" type="number">
  <label>Premium offer (optional – leave blank if none)</label><input id="pOffer" placeholder="e.g. Free cable with purchase">
  <p id="pErr" style="color:#c0392b;font-size:14px"></p><button class="btn k" onclick="addP()">Add product</button></div>` +
    (products.length ? products.map(p => `<div class="row"><div><b>${esc(p.name)}</b> — $${Number(p.price).toFixed(2)}<br><small>${p.stock} left${p.offer ? ' · 🎁 ' + esc(p.offer) : ''}</small></div>
    <div><button class="btn sm" onclick="restock('${esc(p.id)}',${p.stock})">Edit stock</button> <button class="btn sm" onclick="if(confirm('Delete product?'))act('delProduct','${esc(p.id)}')">Delete</button></div></div>`).join('') : '<div class="msg">No products yet. Add your first one above.</div>');
}
function shrink(f) { return new Promise(r => { if (!f) return r(''); const i = new Image, u = URL.createObjectURL(f); i.onload = () => { const s = Math.min(1, 500 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = i.width * s; c.height = i.height * s; c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); r(c.toDataURL('image/jpeg', .78)); }; i.onerror = () => r(''); i.src = u; }); }
async function addP() {
  const name = $('pName').value.trim(), price = $('pPrice').value, stock = $('pStock').value;
  if (!name || price === '' || stock === '') { $('pErr').textContent = 'Name, price and stock are required.'; return; }
  try { await api('addProduct', { name, price, stock, desc: $('pDesc').value, offer: $('pOffer').value, img: await shrink($('pImg').files[0]) }); await loadProducts(); renderAdmin(); }
  catch (e) { $('pErr').textContent = e.message; }
}
async function restock(id, s) { const n = prompt('How many left?', s); if (n === null || isNaN(+n) || +n < 0) return; try { await api('setStock', { id, stock: +n }); await loadProducts(); renderAdmin(); } catch (e) { alert(e.message); } }

addEventListener('hashchange', route); route();
