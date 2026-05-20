const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const PRODUCTION_API_BASE = 'https://aidos779-shopbuilder-api.kazi.rocks';
const LOCAL_API_BASE = 'http://localhost:3000';
const isLocalFrontend = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const defaultApiBase = isLocalFrontend ? LOCAL_API_BASE : PRODUCTION_API_BASE;

const state = {
  apiBase: defaultApiBase,
  accessToken: localStorage.getItem('accessToken') || '',
  refreshToken: localStorage.getItem('refreshToken') || '',
  user: readJson('user'),
  stores: [],
  merchants: [],
  products: [],
  warehouses: [],
  discounts: [],
  orders: [],
  payments: [],
  analytics: null,
  queues: null,
  currentStoreId: localStorage.getItem('currentStoreId') || '',
  lastOrder: readJson('lastOrder'),
  loading: false,
};

const routes = {
  '/login': { title: 'Welcome Back', eyebrow: 'Authentication', public: true, render: renderAuth },
  '/register': { title: 'Create Account', eyebrow: 'Authentication', public: true, render: renderAuth },
  '/verify-email': { title: 'Email Verification', eyebrow: 'Account setup', public: true, render: renderVerification },
  '/reset-password': { title: 'Password Reset', eyebrow: 'Account recovery', public: true, render: renderPasswordReset },
  '/dashboard': { title: 'Merchant Dashboard', eyebrow: 'Operations', render: renderDashboard },
  '/stores': { title: 'Stores', eyebrow: 'Tenant workspace', render: renderStores },
  '/products': { title: 'Products', eyebrow: 'Catalog management', render: renderProducts },
  '/inventory': { title: 'Inventory', eyebrow: 'Warehouses and stock', render: renderInventory },
  '/discounts': { title: 'Discounts', eyebrow: 'Promotions', render: renderDiscounts },
  '/storefront': { title: 'Storefront', eyebrow: 'Customer shopping', render: renderStorefront },
  '/cart': { title: 'Cart and Checkout', eyebrow: 'Customer flow', render: renderCart },
  '/orders': { title: 'Orders', eyebrow: 'Fulfillment', render: renderOrders },
  '/payments': { title: 'Payments', eyebrow: 'Mock processor', render: renderPayments },
  '/analytics': { title: 'Analytics', eyebrow: 'Business metrics', render: renderAnalytics },
  '/queues': { title: 'Queue Monitor', eyebrow: 'Jobs and retries', render: renderQueues },
};

const navItems = [
  ['Dashboard', '/dashboard', ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER']],
  ['Stores', '/stores', ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER']],
  ['Products', '/products', ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER']],
  ['Inventory', '/inventory', ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER']],
  ['Discounts', '/discounts', ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER']],
  ['Storefront', '/storefront', ['CUSTOMER', 'MERCHANT_OWNER', 'STORE_MANAGER', 'SUPER_ADMIN', 'PLATFORM_ADMIN']],
  ['Cart', '/cart', ['CUSTOMER', 'MERCHANT_OWNER', 'STORE_MANAGER', 'SUPER_ADMIN', 'PLATFORM_ADMIN']],
  ['Orders', '/orders', ['CUSTOMER', 'MERCHANT_OWNER', 'STORE_MANAGER', 'SUPER_ADMIN', 'PLATFORM_ADMIN']],
  ['Payments', '/payments', ['CUSTOMER', 'MERCHANT_OWNER', 'STORE_MANAGER', 'SUPER_ADMIN', 'PLATFORM_ADMIN']],
  ['Analytics', '/analytics', ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER']],
  ['Queues', '/queues', ['SUPER_ADMIN', 'PLATFORM_ADMIN']],
];

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function saveSession(result) {
  state.accessToken = result.accessToken || state.accessToken;
  state.refreshToken = result.refreshToken || state.refreshToken;
  state.user = result.user || state.user || decodeJwt(state.accessToken);
  localStorage.setItem('accessToken', state.accessToken);
  localStorage.setItem('refreshToken', state.refreshToken);
  localStorage.setItem('user', JSON.stringify(state.user));
  renderChrome();
}

function clearSession() {
  ['accessToken', 'refreshToken', 'user', 'currentStoreId', 'lastOrder'].forEach((key) => localStorage.removeItem(key));
  Object.assign(state, {
    accessToken: '',
    refreshToken: '',
    user: null,
    stores: [],
    merchants: [],
    products: [],
    warehouses: [],
    discounts: [],
    orders: [],
    payments: [],
    analytics: null,
    queues: null,
    currentStoreId: '',
    lastOrder: null,
  });
  renderChrome();
}

function toast(message, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  $('#toastHost').appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

async function api(path, options = {}, retry = true) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;

  const response = await fetch(`${state.apiBase}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (response.status === 401 && retry && state.refreshToken) {
    try {
      const refreshed = await fetch(`${state.apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refreshToken }),
      });
      const refreshData = await refreshed.json();
      if (!refreshed.ok) throw new Error(refreshData?.error?.message || refreshData?.error || 'Session expired');
      saveSession(refreshData);
      return api(path, options, false);
    } catch {
      clearSession();
      location.hash = '#/login';
      throw new Error('Your session expired. Please sign in again.');
    }
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || response.statusText);
  }
  return data;
}

const getRoute = () => {
  const hash = location.hash.replace(/^#/, '') || '/dashboard';
  return routes[hash] ? hash : '/dashboard';
};

const isStaff = () => ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'MERCHANT_OWNER', 'STORE_MANAGER'].includes(state.user?.role);
const isAdmin = () => ['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(state.user?.role);
const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const rows = (payload, key) => Array.isArray(payload) ? payload : payload?.[key] || [];
const currentStore = () => state.stores.find((store) => store.id === state.currentStoreId) || state.stores[0] || null;
const currentStoreId = () => state.currentStoreId || currentStore()?.id || '';

function renderChrome() {
  const path = getRoute();
  const route = routes[path];
  $('#pageTitle').textContent = route.title;
  $('#eyebrow').textContent = route.eyebrow;
  $('#sessionPill').textContent = state.user ? `${state.user.email} - ${state.user.role}` : 'Signed out';
  $('#logoutButton').hidden = !state.user;

  $('#nav').innerHTML = navItems
    .filter(([, , roles]) => state.user && roles.includes(state.user.role))
    .map(([label, href]) => `<a class="${path === href ? 'active' : ''}" href="#${href}">${label}</a>`)
    .join('');

  const picker = $('#storePicker');
  picker.hidden = !state.user;
  picker.innerHTML = [
    `<option value="">${state.stores.length ? 'All stores' : 'No store selected'}</option>`,
    ...state.stores.map((store) => `<option value="${store.id}">${escapeHtml(store.name)}</option>`),
  ].join('');
  picker.value = state.currentStoreId;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function formValues(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach((key) => data[key] === '' && delete data[key]);
  return data;
}

function csv(value = '') {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function card(title, value, sub = '') {
  return `<article class="metric"><small>${title}</small><strong>${value}</strong><span>${sub}</span></article>`;
}

function emptyState(title, body) {
  return `<div class="empty"><strong>${title}</strong><p>${body}</p></div>`;
}

function skeleton(label = 'Loading') {
  return `<div class="loading"><span></span>${label}</div>`;
}

function guardedMerchantMessage() {
  if (!state.user) return emptyState('Sign in required', 'Login or register to continue the demo flow.');
  if (!isStaff()) return emptyState('Merchant tools are hidden', 'Customer accounts use the storefront, cart, checkout, and orders pages.');
  return '';
}

async function hydrate() {
  if (!state.user) return;
  const tasks = [];
  if (isStaff()) {
    tasks.push(api('/stores?limit=100').then((data) => { state.stores = rows(data, 'stores'); }));
    tasks.push(api('/merchants?limit=100').then((data) => { state.merchants = rows(data, 'merchants'); }).catch(() => { state.merchants = []; }));
    tasks.push(api('/products?limit=100').then((data) => { state.products = rows(data, 'products'); }));
    tasks.push(api('/inventory/warehouses?limit=100').then((data) => { state.warehouses = rows(data, 'warehouses'); }).catch(() => { state.warehouses = []; }));
  } else {
    tasks.push(api('/products?limit=100').then((data) => {
      state.products = rows(data, 'products');
      state.stores = uniqueStoresFromProducts(state.products);
    }));
  }
  await Promise.allSettled(tasks);
  if (!state.currentStoreId && state.stores[0]) state.currentStoreId = state.stores[0].id;
  localStorage.setItem('currentStoreId', state.currentStoreId || '');
}

function uniqueStoresFromProducts(products) {
  const seen = new Map();
  products.forEach((product) => {
    if (product.store?.id) seen.set(product.store.id, product.store);
  });
  return [...seen.values()];
}

async function navigate() {
  const path = getRoute();
  const route = routes[path];
  if (!route.public && !state.user) {
    location.hash = '#/login';
    return;
  }
  renderChrome();
  $('#app').innerHTML = skeleton('Preparing workspace');
  try {
    await hydrate();
    if (state.user) await refreshProductsWithVariants();
    renderChrome();
    await route.render(path);
    bindCommonForms();
  } catch (error) {
    $('#app').innerHTML = emptyState('Something needs attention', error.message);
    toast(error.message, 'error');
  }
}

function renderAuth(path) {
  const isRegister = path === '/register';
  $('#app').innerHTML = `
    <section class="auth-grid">
      <div class="hero-panel">
        <h2>${isRegister ? 'Launch a merchant workspace or shop as a customer.' : 'Run the whole demo from the browser.'}</h2>
        <p>Tokens are stored automatically, requests include Bearer auth, and expired sessions are refreshed when possible.</p>
        <div class="hero-actions">
          <a class="button ${isRegister ? 'secondary' : ''}" href="#/login">Login</a>
          <a class="button ${isRegister ? '' : 'secondary'}" href="#/register">Register</a>
        </div>
      </div>
      <form id="${isRegister ? 'registerForm' : 'loginForm'}" class="panel form-panel">
        <h2>${isRegister ? 'Register' : 'Login'}</h2>
        <label>Email<input name="email" type="email" autocomplete="email" required /></label>
        <label>Password<input name="password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="8" required /></label>
        ${isRegister ? `
          <label>Role<select name="role" id="roleSelect"><option value="MERCHANT_OWNER">Merchant owner</option><option value="CUSTOMER">Customer</option></select></label>
          <label data-merchant-field>Tenant name<input name="tenantName" placeholder="Acme Commerce" /></label>
          <label data-merchant-field>Merchant name<input name="merchantName" placeholder="Acme Retail Ltd" /></label>
          <label data-merchant-field>Phone<input name="phone" placeholder="+1 555 0100" /></label>
          <label data-merchant-field>Address<input name="address" placeholder="Main street 1" /></label>
        ` : ''}
        <button type="submit">${isRegister ? 'Create account' : 'Login'}</button>
        <a class="text-link" href="#/reset-password">Reset password</a>
      </form>
    </section>
  `;
  if (isRegister) {
    $('#roleSelect').addEventListener('change', (event) => {
      $$('[data-merchant-field]').forEach((field) => { field.hidden = event.target.value === 'CUSTOMER'; });
    });
  }
}

async function renderVerification() {
  const token = new URLSearchParams(location.hash.split('?')[1] || location.search).get('token') || '';
  if (token) {
    try {
      const result = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
      $('#app').innerHTML = `
        <section class="narrow">
          <div class="panel empty">
            <strong>Email verified</strong>
            <p>${escapeHtml(result.message || 'You can now log in.')}</p>
            <a class="button" href="#/login">Go to login</a>
          </div>
        </section>
      `;
      return;
    } catch (error) {
      $('#app').innerHTML = `
        <section class="narrow">
          <div class="panel empty">
            <strong>Verification failed</strong>
            <p>${escapeHtml(error.message)}</p>
            <a class="button secondary" href="#/verify-email">Enter token manually</a>
          </div>
        </section>
      `;
      return;
    }
  }
  $('#app').innerHTML = `
    <section class="narrow">
      <form id="verifyForm" class="panel form-panel">
        <h2>Verify email</h2>
        <label>Verification token<input name="token" value="${escapeHtml(token)}" required /></label>
        <button type="submit">Verify email</button>
      </form>
    </section>
  `;
}

function renderPasswordReset() {
  const token = new URLSearchParams(location.hash.split('?')[1] || location.search).get('token') || '';
  $('#app').innerHTML = `
    <section class="auth-grid">
      <form id="forgotForm" class="panel form-panel">
        <h2>Request reset</h2>
        <label>Email<input name="email" type="email" required /></label>
        <button type="submit">Send reset email</button>
      </form>
      <form id="resetForm" class="panel form-panel">
        <h2>Set new password</h2>
        <label>Reset token<input name="token" value="${escapeHtml(token)}" required /></label>
        <label>New password<input name="newPassword" type="password" minlength="8" required /></label>
        <button type="submit">Reset password</button>
      </form>
    </section>
  `;
}

async function renderDashboard() {
  if (!isStaff()) {
    location.hash = '#/storefront';
    return;
  }
  const storeId = currentStoreId();
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  const analytics = await api(`/analytics${query}`).catch(() => null);
  state.analytics = analytics;
  $('#app').innerHTML = `
    <section class="metrics-grid">
      ${card('Revenue', money(analytics?.revenue), 'Captured paid orders')}
      ${card('Orders', analytics?.orders || 0, `${analytics?.paidOrders || 0} paid`)}
      ${card('Products', analytics?.products || state.products.length, 'Tenant catalog')}
      ${card('Active carts', analytics?.activeCarts || 0, 'In-progress checkout')}
    </section>
    <section class="two-column">
      <div class="panel">
        <div class="section-head"><h2>Fast setup</h2><a class="button small" href="#/stores">Manage stores</a></div>
        ${state.stores.length ? renderStoreTable(state.stores.slice(0, 5)) : emptyState('Create your first store', 'Stores anchor products, warehouses, carts, checkout, and analytics.')}
      </div>
      <div class="panel">
        <div class="section-head"><h2>Recent products</h2><a class="button small secondary" href="#/products">Products</a></div>
        ${state.products.length ? renderProductList(state.products.slice(0, 4), false) : emptyState('No products yet', 'Create a product and generate variants before adding stock.')}
      </div>
    </section>
  `;
}

function renderStores() {
  $('#app').innerHTML = guardedMerchantMessage() || `
    <section class="two-column">
      <form id="storeForm" class="panel form-panel">
        <h2>Create store</h2>
        <label>Store name<input name="name" placeholder="Downtown Flagship" required /></label>
        <label>Description<textarea name="description" placeholder="Main retail location"></textarea></label>
        <label>Merchant<select name="merchantId" required>${state.merchants.map((merchant) => `<option value="${merchant.id}">${escapeHtml(merchant.name)}</option>`).join('')}</select></label>
        <button type="submit">Create store</button>
      </form>
      <div class="panel">
        <div class="section-head"><h2>Your stores</h2><button id="refreshStores" class="ghost-button" type="button">Refresh</button></div>
        ${state.stores.length ? renderStoreTable(state.stores) : emptyState('No stores found', 'Merchant registration creates a tenant; add a store here to begin selling.')}
      </div>
    </section>
  `;
}

function renderStoreTable(stores) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Merchant</th><th>Products</th><th>Orders</th><th></th></tr></thead>
        <tbody>${stores.map((store) => `
          <tr>
            <td><strong>${escapeHtml(store.name)}</strong><small>${escapeHtml(store.description || store.id)}</small></td>
            <td>${escapeHtml(store.merchant?.name || 'Merchant')}</td>
            <td>${store._count?.products || 0}</td>
            <td>${store._count?.orders || 0}</td>
            <td><button class="small ghost-button" data-select-store="${store.id}" type="button">Use</button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderProducts() {
  $('#app').innerHTML = guardedMerchantMessage() || `
    <section class="two-column wide-left">
      <div class="panel">
        <div class="section-head"><h2>Catalog</h2><button id="refreshProducts" class="ghost-button" type="button">Refresh</button></div>
        ${state.products.length ? renderProductList(state.products, true) : emptyState('No products yet', 'Create a product, then add variants and inventory.')}
      </div>
      <div class="stack">
        <form id="productForm" class="panel form-panel">
          <h2>Create product</h2>
          <label>Name<input name="name" placeholder="Premium T-Shirt" required /></label>
          <label>Price<input name="price" type="number" min="0" step="0.01" value="29.99" required /></label>
          <label>Category<input name="category" placeholder="Apparel" /></label>
          <label>Store<select name="storeId">${storeOptions()}</select></label>
          <label>Description<textarea name="description" placeholder="Short product description"></textarea></label>
          <button type="submit">Save product</button>
        </form>
        <form id="variantForm" class="panel form-panel">
          <h2>Generate variants</h2>
          <label>Product<select name="productId" required>${productOptions()}</select></label>
          <label>Sizes<input name="sizes" placeholder="S, M, L" /></label>
          <label>Colors<input name="colors" placeholder="Black, White" /></label>
          <label>Materials<input name="materials" placeholder="Cotton" /></label>
          <button type="submit">Create SKU matrix</button>
        </form>
      </div>
    </section>
  `;
}

function renderProductList(products, actions) {
  return `<div class="product-grid">${products.map((product) => `
    <article class="product-card">
      <div class="product-art">${escapeHtml(product.name).slice(0, 2).toUpperCase()}</div>
      <div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.description || product.category || 'No description')}</p>
        <div class="chips">
          <span>${money(product.price)}</span>
          <span>${product._count?.variants || product.variants?.length || 0} variants</span>
          ${product.store?.name ? `<span>${escapeHtml(product.store.name)}</span>` : ''}
        </div>
      </div>
      ${actions ? `<div class="card-actions"><button class="small secondary" data-edit-product="${product.id}" type="button">Edit</button><button class="small danger" data-delete-product="${product.id}" type="button">Delete</button></div>` : ''}
    </article>`).join('')}</div>`;
}

function renderInventory() {
  $('#app').innerHTML = guardedMerchantMessage() || `
    <section class="two-column">
      <div class="stack">
        <form id="warehouseForm" class="panel form-panel">
          <h2>Create warehouse</h2>
          <label>Name<input name="name" placeholder="Central Warehouse" required /></label>
          <label>Store<select name="storeId">${storeOptions(true)}</select></label>
          <label>Priority<input name="priority" type="number" value="100" required /></label>
          <label>Region<input name="region" placeholder="North" /></label>
          <label>Address<input name="address" placeholder="Warehouse address" /></label>
          <button type="submit">Create warehouse</button>
        </form>
        <form id="stockForm" class="panel form-panel">
          <h2>Set stock</h2>
          <label>Warehouse<select name="warehouseId" required>${warehouseOptions()}</select></label>
          <label>Variant<select name="variantId" required>${variantOptions()}</select></label>
          <label>Quantity<input name="quantity" type="number" min="1" value="10" required /></label>
          <button type="submit">Update inventory</button>
        </form>
      </div>
      <div class="panel">
        <div class="section-head"><h2>Inventory table</h2><button id="refreshInventory" class="ghost-button" type="button">Refresh</button></div>
        ${renderInventoryTable()}
      </div>
    </section>
  `;
}

function renderInventoryTable() {
  const variants = allVariants();
  if (!variants.length) return emptyState('No variants available', 'Generate product variants before setting warehouse stock.');
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>SKU</th><th>Product</th><th>Stock</th><th>Reserved</th><th>Available</th></tr></thead>
        <tbody>${variants.map(({ variant, product }) => `
          <tr>
            <td><strong>${escapeHtml(variant.sku)}</strong><small>${[variant.size, variant.color, variant.material].filter(Boolean).join(' / ') || 'Default'}</small></td>
            <td>${escapeHtml(product.name)}</td>
            <td>${variant.stock || 0}</td>
            <td>${variant.reservedStock || 0}</td>
            <td>${(variant.stock || 0) - (variant.reservedStock || 0)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

async function renderDiscounts() {
  state.discounts = rows(await api(`/discounts?limit=100${currentStoreId() ? `&storeId=${encodeURIComponent(currentStoreId())}` : ''}`).catch(() => ({ discounts: [] })), 'discounts');
  $('#app').innerHTML = guardedMerchantMessage() || `
    <section class="two-column">
      <form id="discountForm" class="panel form-panel">
        <h2>Create discount</h2>
        <label>Code<input name="code" placeholder="SAVE10" required /></label>
        <label>Type<select name="type"><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option></select></label>
        <label>Value<input name="value" type="number" min="0.01" step="0.01" value="10" required /></label>
        <label>Store<select name="storeId">${storeOptions(true)}</select></label>
        <label>Max redemptions<input name="maxRedemptions" type="number" min="1" /></label>
        <label class="inline"><input name="stackable" type="checkbox" /> Stackable</label>
        <button type="submit">Create discount</button>
      </form>
      <div class="panel">
        <div class="section-head"><h2>Active promos</h2><button id="refreshDiscounts" class="ghost-button" type="button">Refresh</button></div>
        ${state.discounts.length ? renderDiscountTable() : emptyState('No discounts yet', 'Create a promo code and use it during checkout.')}
      </div>
    </section>
  `;
}

function renderDiscountTable() {
  return `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Used</th><th>Status</th></tr></thead><tbody>${state.discounts.map((discount) => `
    <tr><td><strong>${escapeHtml(discount.code)}</strong></td><td>${discount.type}</td><td>${discount.type === 'PERCENTAGE' ? `${discount.value}%` : money(discount.value)}</td><td>${discount.redemptions || 0}</td><td>${discount.active ? 'Active' : 'Inactive'}</td></tr>
  `).join('')}</tbody></table></div>`;
}

function renderStorefront() {
  const products = currentStoreId() ? state.products.filter((product) => product.store?.id === currentStoreId() || product.storeId === currentStoreId()) : state.products;
  $('#app').innerHTML = `
    <section class="storefront-toolbar panel">
      <div><h2>${currentStore()?.name || 'Browse products'}</h2><p>Select a store from the header to filter the storefront.</p></div>
      <a class="button secondary" href="#/cart">Open cart</a>
    </section>
    ${products.length ? `<section class="shop-grid">${products.map(renderShopProduct).join('')}</section>` : emptyState('No products to browse', 'A merchant needs to create products and variants first.')}
  `;
}

function renderShopProduct(product) {
  const variant = (product.variants || [])[0];
  const canBuy = Boolean(variant && (variant.stock - variant.reservedStock) > 0);
  return `
    <article class="shop-card">
      <div class="shop-art">${escapeHtml(product.name).slice(0, 2).toUpperCase()}</div>
      <div class="shop-body">
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.description || 'Ready to sell through ShopBuilder checkout.')}</p>
        <strong>${money(product.price)}</strong>
        <small>${variant ? `${variant.stock - variant.reservedStock} available` : 'No variants yet'}</small>
      </div>
      <button data-add-cart="${variant?.id || ''}" data-store-id="${product.store?.id || product.storeId || currentStoreId()}" ${canBuy ? '' : 'disabled'} type="button">Add to cart</button>
    </article>
  `;
}

async function renderCart() {
  const storeId = currentStoreId();
  let cart = null;
  if (state.user && storeId) cart = await api(`/cart?storeId=${encodeURIComponent(storeId)}`).catch(() => null);
  $('#app').innerHTML = `
    <section class="two-column">
      <div class="panel">
        <div class="section-head"><h2>Cart</h2><a class="button small secondary" href="#/storefront">Continue shopping</a></div>
        ${renderCartItems(cart)}
      </div>
      <form id="checkoutForm" class="panel form-panel">
        <h2>Checkout</h2>
        <label>Store<select name="storeId" required>${storeOptions(false, storeId)}</select></label>
        <label>Discount codes<input name="discountCodes" placeholder="SAVE10, FREESHIP" /></label>
        <label>Order notes<textarea name="notes" placeholder="Delivery instructions"></textarea></label>
        <label>Card number<input name="cardNumber" placeholder="4242 4242 4242 4242" /></label>
        <button type="submit">Place order and capture payment</button>
        ${state.lastOrder ? `<a class="text-link" href="#/orders">Last order: ${escapeHtml(state.lastOrder.orderNumber || state.lastOrder.id)}</a>` : ''}
      </form>
    </section>
  `;
}

function renderCartItems(cart) {
  if (!currentStoreId()) return emptyState('Select a store', 'Choose a store in the header before using the cart.');
  if (!cart?.items?.length) return emptyState('Cart is empty', 'Add a product from the storefront to start checkout.');
  return `
    <div class="cart-list">
      ${cart.items.map((item) => `
        <div class="cart-row">
          <div><strong>${escapeHtml(item.variant.product.name)}</strong><small>${escapeHtml(item.variant.sku)}</small></div>
          <input data-cart-qty="${item.variantId}" type="number" min="1" value="${item.quantity}" />
          <button class="small danger" data-remove-cart="${item.variantId}" type="button">Remove</button>
        </div>`).join('')}
    </div>
    <div class="total-row"><span>Subtotal</span><strong>${money(cart.subtotal)}</strong></div>
  `;
}

async function renderOrders() {
  const query = currentStoreId() && isStaff() ? `?storeId=${encodeURIComponent(currentStoreId())}` : '';
  state.orders = rows(await api(`/orders${query}`), 'orders');
  $('#app').innerHTML = `
    <section class="panel">
      <div class="section-head"><h2>Orders</h2><button id="refreshOrders" class="ghost-button" type="button">Refresh</button></div>
      ${state.orders.length ? renderOrderTable() : emptyState('No orders yet', 'Checkout creates orders here automatically.')}
    </section>
  `;
}

function renderOrderTable() {
  return `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Store</th><th>Status</th><th>Total</th><th>Items</th><th></th></tr></thead><tbody>${state.orders.map((order) => `
    <tr>
      <td><strong>${escapeHtml(order.orderNumber)}</strong><small>${new Date(order.createdAt).toLocaleString()}</small></td>
      <td>${escapeHtml(order.store?.name || '')}</td>
      <td><span class="status-pill">${order.status}</span></td>
      <td>${money(order.totalAmount)}</td>
      <td>${order._count?.items || order.items?.length || 0}</td>
      <td>${isStaff() ? statusButton(order) : `<button class="small danger" data-cancel-order="${order.id}" ${order.status !== 'PENDING' ? 'disabled' : ''} type="button">Cancel</button>`}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function statusButton(order) {
  const next = { PENDING: 'PAID', PAID: 'PACKED', PACKED: 'SHIPPED', SHIPPED: 'DELIVERED' }[order.status];
  return next ? `<button class="small secondary" data-order-status="${order.id}" data-status="${next}" type="button">Mark ${next}</button>` : '';
}

async function renderPayments() {
  state.orders = rows(await api('/orders').catch(() => ({ orders: [] })), 'orders');
  state.payments = rows(await api('/payments').catch(() => ({ payments: [] })), 'payments');
  $('#app').innerHTML = `
    <section class="two-column">
      <form id="paymentForm" class="panel form-panel">
        <h2>Create payment intent</h2>
        <label>Order<select name="orderId" required>${state.orders.map((order) => `<option value="${order.id}">${escapeHtml(order.orderNumber)} - ${money(order.totalAmount)}</option>`).join('')}</select></label>
        <label>Card number<input name="cardNumber" placeholder="Ends with 3184 to require 3DS" /></label>
        <button type="submit">Create intent</button>
      </form>
      <div class="panel">
        <div class="section-head"><h2>Payments</h2><button id="refreshPayments" class="ghost-button" type="button">Refresh</button></div>
        ${state.payments.length ? renderPaymentTable() : emptyState('No payments yet', 'Checkout can create and capture mock payments automatically.')}
      </div>
    </section>
  `;
}

function renderPaymentTable() {
  return `<div class="table-wrap"><table><thead><tr><th>Payment</th><th>Order</th><th>Status</th><th>Amount</th><th></th></tr></thead><tbody>${state.payments.map((payment) => `
    <tr><td><strong>${payment.id.slice(0, 8)}</strong><small>${payment.requires3ds ? '3DS required' : payment.provider}</small></td><td>${escapeHtml(payment.order?.orderNumber || payment.orderId)}</td><td>${payment.status}</td><td>${money(payment.amount)}</td><td>${payment.status === 'AUTHORIZED' ? `<button class="small secondary" data-capture-payment="${payment.id}" type="button">Capture</button>` : payment.status === 'REQUIRES_ACTION' ? `<button class="small secondary" data-3ds-payment="${payment.id}" data-token="${payment.threeDSecureToken}" type="button">Complete 3DS</button>` : ''}</td></tr>
  `).join('')}</tbody></table></div>`;
}

async function renderAnalytics() {
  state.analytics = await api(`/analytics${currentStoreId() ? `?storeId=${encodeURIComponent(currentStoreId())}` : ''}`).catch(() => state.analytics);
  const analytics = state.analytics || {};
  const statuses = analytics.ordersByStatus || {};
  const max = Math.max(1, ...Object.values(statuses));
  $('#app').innerHTML = guardedMerchantMessage() || `
    <section class="metrics-grid">
      ${card('Revenue', money(analytics.revenue), 'Paid orders')}
      ${card('Orders', analytics.orders || 0, `${analytics.paidOrders || 0} paid`)}
      ${card('Products', analytics.products || 0, 'Catalog count')}
      ${card('Conversion proxy', `${Math.round((analytics.conversionProxy || 0) * 100)}%`, 'Orders vs carts')}
    </section>
    <section class="panel">
      <div class="section-head"><h2>Orders by status</h2><button id="refreshAnalytics" class="ghost-button" type="button">Refresh</button></div>
      <div class="bar-list">${Object.entries(statuses).map(([label, value]) => `<div><span>${label}</span><b style="width:${(value / max) * 100}%"></b><em>${value}</em></div>`).join('') || emptyState('No order data', 'Orders will populate this chart after checkout.')}</div>
    </section>
  `;
}

async function renderQueues() {
  if (!isAdmin()) {
    $('#app').innerHTML = emptyState('Admin role required', 'Queue statistics are available to SUPER_ADMIN and PLATFORM_ADMIN accounts.');
    return;
  }
  state.queues = await api('/admin/queues');
  $('#app').innerHTML = `
    <section class="queue-grid">
      ${Object.entries(state.queues).map(([name, counts]) => `
        <article class="panel queue-card">
          <div class="section-head"><h2>${name}</h2><span class="status-pill">${counts.failed || 0} failed</span></div>
          <div class="metrics-grid compact">
            ${card('Waiting', counts.waiting || 0)}
            ${card('Active', counts.active || 0)}
            ${card('Completed', counts.completed || 0)}
            ${card('Delayed', counts.delayed || 0)}
          </div>
        </article>`).join('')}
    </section>
  `;
}

function storeOptions(optional = false, selected = state.currentStoreId) {
  return `${optional ? '<option value="">All stores</option>' : ''}${state.stores.map((store) => `<option value="${store.id}" ${store.id === selected ? 'selected' : ''}>${escapeHtml(store.name)}</option>`).join('')}`;
}

function productOptions() {
  return state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)}</option>`).join('');
}

function warehouseOptions() {
  return state.warehouses.map((warehouse) => `<option value="${warehouse.id}">${escapeHtml(warehouse.name)}</option>`).join('');
}

function variantOptions() {
  return allVariants().map(({ variant, product }) => `<option value="${variant.id}">${escapeHtml(product.name)} - ${escapeHtml(variant.sku)}</option>`).join('');
}

function allVariants() {
  return state.products.flatMap((product) => (product.variants || []).map((variant) => ({ product, variant })));
}

async function refreshProductsWithVariants() {
  state.products = rows(await api(`/products?limit=100${currentStoreId() ? `&storeId=${encodeURIComponent(currentStoreId())}` : ''}`), 'products');
  const detailed = await Promise.all(state.products.map((product) => api(`/products/${product.id}`).catch(() => product)));
  state.products = detailed;
}

async function refreshAll() {
  await hydrate();
  await refreshProductsWithVariants();
  if (isStaff()) {
    state.discounts = rows(await api(`/discounts?limit=100${currentStoreId() ? `&storeId=${encodeURIComponent(currentStoreId())}` : ''}`).catch(() => ({ discounts: [] })), 'discounts');
    state.warehouses = rows(await api(`/inventory/warehouses?limit=100${currentStoreId() ? `&storeId=${encodeURIComponent(currentStoreId())}` : ''}`).catch(() => ({ warehouses: [] })), 'warehouses');
    state.analytics = await api(`/analytics${currentStoreId() ? `?storeId=${encodeURIComponent(currentStoreId())}` : ''}`).catch(() => null);
  }
}

function bindCommonForms() {
  $('#loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      saveSession(await api('/auth/login', { method: 'POST', body: JSON.stringify(formValues(event.target)) }));
      await refreshAll();
      toast('Login successful');
      location.hash = isStaff() ? '#/dashboard' : '#/storefront';
    });
  });

  $('#registerForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      const data = formValues(event.target);
      const result = await api('/auth/register', { method: 'POST', body: JSON.stringify(data) });
      toast(result.message || 'Registration successful. Check email for verification.');
      location.hash = '#/verify-email';
    });
  });

  $('#verifyForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      const result = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify(formValues(event.target)) });
      toast(result.message || 'Email verified');
      location.hash = '#/login';
    });
  });

  $('#forgotForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => toast((await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify(formValues(event.target)) })).message));
  });

  $('#resetForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      toast((await api('/auth/reset-password', { method: 'POST', body: JSON.stringify(formValues(event.target)) })).message);
      location.hash = '#/login';
    });
  });

  $('#storeForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      const store = await api('/stores', { method: 'POST', body: JSON.stringify(formValues(event.target)) });
      state.currentStoreId = store.id;
      localStorage.setItem('currentStoreId', store.id);
      toast('Store created');
      await refreshAll();
      await renderStores();
      bindCommonForms();
      renderChrome();
    });
  });

  $('#productForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      const data = formValues(event.target);
      data.price = Number(data.price);
      await api('/products', { method: 'POST', body: JSON.stringify(data) });
      toast('Product created');
      await refreshAll();
      await renderProducts();
      bindCommonForms();
    });
  });

  $('#variantForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      const data = formValues(event.target);
      await api('/products/save-variants', {
        method: 'POST',
        body: JSON.stringify({ productId: data.productId, sizes: csv(data.sizes), colors: csv(data.colors), materials: csv(data.materials) }),
      });
      toast('Variants generated with SKUs');
      await refreshAll();
      await renderProducts();
      bindCommonForms();
    });
  });

  $('#warehouseForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      const data = formValues(event.target);
      data.priority = Number(data.priority || 100);
      await api('/inventory/warehouses', { method: 'POST', body: JSON.stringify(data) });
      toast('Warehouse created');
      await refreshAll();
      await renderInventory();
      bindCommonForms();
    });
  });

  $('#stockForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      const data = formValues(event.target);
      await api(`/inventory/warehouses/${data.warehouseId}/variants/${data.variantId}`, { method: 'PUT', body: JSON.stringify({ quantity: Number(data.quantity) }) });
      toast('Stock updated');
      await refreshAll();
      await renderInventory();
      bindCommonForms();
    });
  });

  $('#discountForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      const data = formValues(event.target);
      data.value = Number(data.value);
      data.stackable = data.stackable === 'on';
      if (data.maxRedemptions) data.maxRedemptions = Number(data.maxRedemptions);
      await api('/discounts', { method: 'POST', body: JSON.stringify(data) });
      toast('Discount created');
      await refreshAll();
      await renderDiscounts();
      bindCommonForms();
    });
  });

  $('#checkoutForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      const data = formValues(event.target);
      const order = await api('/cart/checkout', {
        method: 'POST',
        body: JSON.stringify({ storeId: data.storeId, notes: data.notes, discountCodes: csv(data.discountCodes) }),
      });
      state.lastOrder = order;
      localStorage.setItem('lastOrder', JSON.stringify(order));
      const payment = await api('/payments/intents', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id, cardNumber: data.cardNumber || '4242424242424242' }),
      });
      if (payment.requires3ds) {
        await api(`/payments/${payment.id}/3ds`, { method: 'POST', body: JSON.stringify({ token: payment.threeDSecureToken }) });
      }
      await api(`/payments/${payment.id}/capture`, { method: 'POST', body: JSON.stringify({}) });
      toast('Order placed and payment captured');
      await refreshAll();
      location.hash = '#/orders';
    });
  });

  $('#paymentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submit(async () => {
      await api('/payments/intents', { method: 'POST', body: JSON.stringify(formValues(event.target)) });
      toast('Payment intent created');
      await renderPayments();
      bindCommonForms();
    });
  });

}

async function handleDocumentClick(event) {
  const target = event.target.closest('button, a');
  if (!target) return;
  try {
    if (target.dataset.selectStore) {
      state.currentStoreId = target.dataset.selectStore;
      localStorage.setItem('currentStoreId', state.currentStoreId);
      toast('Store selected');
      await refreshAll();
      await navigate();
    } else if (target.dataset.deleteProduct) {
      await submit(async () => {
        await api(`/products/${target.dataset.deleteProduct}`, { method: 'DELETE' });
        toast('Product deleted');
        await refreshAll();
        await navigate();
      });
    } else if (target.dataset.editProduct) {
      const product = state.products.find((item) => item.id === target.dataset.editProduct);
      const name = prompt('Product name', product?.name || '');
      if (name) {
        await submit(async () => {
          await api(`/products/${target.dataset.editProduct}`, { method: 'PATCH', body: JSON.stringify({ name }) });
          toast('Product updated');
          await refreshAll();
          await navigate();
        });
      }
    } else if (target.dataset.addCart) {
      await submit(async () => {
        await api('/cart/items', {
          method: 'POST',
          body: JSON.stringify({ storeId: target.dataset.storeId || currentStoreId(), variantId: target.dataset.addCart, quantity: 1 }),
        });
        state.currentStoreId = target.dataset.storeId || currentStoreId();
        localStorage.setItem('currentStoreId', state.currentStoreId);
        toast('Added to cart');
      });
    } else if (target.dataset.removeCart) {
      await submit(async () => {
        await api(`/cart/items/${target.dataset.removeCart}?storeId=${encodeURIComponent(currentStoreId())}`, { method: 'DELETE' });
        toast('Item removed');
        await navigate();
      });
    } else if (target.dataset.orderStatus) {
      await submit(async () => {
        await api(`/orders/${target.dataset.orderStatus}/status`, { method: 'PATCH', body: JSON.stringify({ status: target.dataset.status }) });
        toast('Order status updated');
        await navigate();
      });
    } else if (target.dataset.cancelOrder) {
      await submit(async () => {
        await api(`/orders/${target.dataset.cancelOrder}/cancel`, { method: 'POST', body: JSON.stringify({}) });
        toast('Order cancelled');
        await navigate();
      });
    } else if (target.dataset.capturePayment) {
      await submit(async () => {
        await api(`/payments/${target.dataset.capturePayment}/capture`, { method: 'POST', body: JSON.stringify({}) });
        toast('Payment captured');
        await navigate();
      });
    } else if (target.dataset['3dsPayment']) {
      await submit(async () => {
        await api(`/payments/${target.dataset['3dsPayment']}/3ds`, { method: 'POST', body: JSON.stringify({ token: target.dataset.token }) });
        toast('3DS completed');
        await navigate();
      });
    } else if (target.id?.startsWith('refresh')) {
      await refreshAll();
      await navigate();
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function submit(task) {
  if (state.loading) return;
  state.loading = true;
  document.body.classList.add('busy');
  try {
    await task();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.loading = false;
    document.body.classList.remove('busy');
  }
}

$('#apiBase').value = state.apiBase;
$('#apiBase').addEventListener('change', (event) => {
  state.apiBase = event.target.value.trim();
  localStorage.setItem('apiBase', state.apiBase);
  toast('API endpoint updated');
});

$('#storePicker').addEventListener('change', async (event) => {
  state.currentStoreId = event.target.value;
  localStorage.setItem('currentStoreId', state.currentStoreId);
  await refreshAll().catch(() => {});
  navigate();
});

$('#logoutButton').addEventListener('click', async () => {
  try {
    if (state.refreshToken) await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: state.refreshToken }) });
  } catch {
    // Local logout still completes if the refresh token was already invalid.
  }
  clearSession();
  toast('Logged out');
  location.hash = '#/login';
});

document.addEventListener('click', handleDocumentClick);
document.addEventListener('change', async (event) => {
  if (!event.target.matches('[data-cart-qty]')) return;
  await submit(async () => {
    await api(`/cart/items/${event.target.dataset.cartQty}`, {
      method: 'PATCH',
      body: JSON.stringify({ storeId: currentStoreId(), quantity: Number(event.target.value) }),
    });
    toast('Cart updated');
    await navigate();
  });
});

window.addEventListener('hashchange', navigate);
refreshAll().catch(() => {}).finally(navigate);
