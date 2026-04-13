// ============================================================
// Nexus Shop — Frontend API Client
// Backend: FastAPI on http://localhost:8000
// ============================================================

const API_BASE = 'http://localhost:8000/api';

// --- Global State ---
const state = {
    user: JSON.parse(localStorage.getItem('nexus_user')) || null,
    token: localStorage.getItem('nexus_token') || null,
    cart: [],
    allProducts: [],
};

// --- API Helper ---
async function api(method, path, body = null, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.token) headers['Authorization'] = `Bearer ${state.token}`;

    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Something went wrong');
    return data;
}

function formatMoney(amount) { 
    return '₱' + parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); 
}

function toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    el.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ============================================================
// Router
// ============================================================
const app = {};

app.router = {
    currentRoute: 'home',
    navigate: function (route) {
        if (route === 'admin' && (!state.user || !state.user.is_admin)) {
            toast('Admin access required', 'error'); return;
        }
        if (route === 'account' && !state.user) {
            app.auth.showAuthModal(); return;
        }
        const main = document.getElementById('app-content');
        const template = document.getElementById(`view-${route}`);
        if (template) {
            main.innerHTML = template.innerHTML;
            this.currentRoute = route;
            if (route === 'home') app.shop.renderFeatured();
            if (route === 'shop') { app.shop.currentCategory = 'All'; app.shop.renderProducts(); }
            if (route === 'account') app.auth.renderAccount();
            if (route === 'admin') { app.admin.currentTab = 'products'; app.admin.renderProductsTable(); }
            window.scrollTo(0, 0);
        }
    }
};

// ============================================================
// Auth
// ============================================================
app.auth = {
    init() {
        this.updateNav();
        document.getElementById('login-form').addEventListener('submit', e => { e.preventDefault(); this.login(); });
        document.getElementById('register-form').addEventListener('submit', e => { e.preventDefault(); this.register(); });
    },
    updateNav() {
        const loginBtn = document.getElementById('nav-login-btn');
        const userMenu = document.getElementById('nav-user-menu');
        const adminLink = document.getElementById('nav-admin');
        if (state.user) {
            loginBtn.style.display = 'none';
            userMenu.style.display = 'flex';
            document.getElementById('nav-username').textContent = state.user.name.split(' ')[0];
            document.getElementById('user-avatar').src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${state.user.email}`;
            adminLink.style.display = state.user.is_admin ? 'block' : 'none';
        } else {
            loginBtn.style.display = 'block';
            userMenu.style.display = 'none';
            adminLink.style.display = 'none';
        }
    },
    showAuthModal() { document.getElementById('auth-modal').classList.add('active'); },
    closeAuthModal() {
        document.getElementById('auth-modal').classList.remove('active');
        document.getElementById('login-form').reset();
        document.getElementById('register-form').reset();
    },
    switchTab(tab) {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');
        document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
        document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
    },
    async register() {
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const is_admin = document.getElementById('reg-is-admin').checked;
        const contact_number = document.getElementById('reg-contact').value;
        const messenger_account = document.getElementById('reg-messenger').value;
        const gcash_number = document.getElementById('reg-gcash').value;
        try {
            const res = await api('POST', '/auth/register', { 
                name, email, password, is_admin, 
                contact_number, messenger_account, gcash_number 
            });
            this._saveSession(res);
            toast(`Welcome, ${res.user.name}!`);
        } catch (e) { toast(e.message, 'error'); }
    },
    async login() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            const res = await api('POST', '/auth/login', { email, password });
            this._saveSession(res);
            toast(`Welcome back, ${res.user.name}!`);
        } catch (e) { toast(e.message, 'error'); }
    },
    _saveSession(res) {
        state.user = res.user;
        state.token = res.access_token;
        localStorage.setItem('nexus_user', JSON.stringify(res.user));
        localStorage.setItem('nexus_token', res.access_token);
        this.closeAuthModal();
        this.updateNav();
        if (app.router.currentRoute === 'account') this.renderAccount();
    },
    logout() {
        state.user = null; state.token = null;
        localStorage.removeItem('nexus_user'); localStorage.removeItem('nexus_token');
        this.updateNav();
        app.router.navigate('home');
        toast('Logged out successfully');
    },
    async renderAccount() {
        if (!state.user) return;
        document.getElementById('acc-name').textContent = state.user.name;
        document.getElementById('acc-email').textContent = state.user.email;
        document.getElementById('acc-role').textContent = state.user.is_admin ? 'Admin' : 'Customer';
        document.getElementById('acc-avatar').src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${state.user.email}`;
        await app.transactions.renderUserOrders();
    }
};

// ============================================================
// Shop
// ============================================================
app.shop = {
    currentCategory: 'All',
    searchTerm: '',
    createCard(p) {
        return `
        <div class="product-card">
            <img src="${p.image_url || 'https://via.placeholder.com/300x200?text=No+Image'}" alt="${p.name}" class="product-img" onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
            <div class="product-info">
                <span class="product-category">${p.category}</span>
                <h3 class="product-title">${p.name}</h3>
                <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px;">${(p.description||'').substring(0,70)}...</p>
                <div class="product-price">${formatMoney(p.price)}</div>
                <div class="product-footer">
                    <span style="font-size:0.8rem;color:var(--text-muted)">Stock: ${p.stock}</span>
                    <button class="btn gradient-btn" style="padding:8px 15px;" onclick="app.cart.addItem(${p.id})" ${p.stock <= 0 ? 'disabled' : ''}>
                        <i class="fa-solid fa-cart-plus"></i> Add
                    </button>
                </div>
            </div>
        </div>`;
    },
    async renderFeatured() {
        const grid = document.getElementById('featured-products');
        if (!grid) return;
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1">Loading...</p>';
        try {
            const products = await api('GET', '/products');
            state.allProducts = products;
            grid.innerHTML = products.slice(0, 4).map(p => this.createCard(p)).join('');
        } catch (e) { grid.innerHTML = `<p style="color:var(--danger);grid-column:1/-1">${e.message}</p>`; }
    },
    async renderProducts() {
        const grid = document.getElementById('main-product-grid');
        if (!grid) return;
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1">Loading...</p>';
        try {
            let url = '/products?';
            if (this.currentCategory !== 'All') url += `category=${this.currentCategory}&`;
            if (this.searchTerm) url += `search=${this.searchTerm}`;
            const products = await api('GET', url);
            state.allProducts = products;
            grid.innerHTML = products.length
                ? products.map(p => this.createCard(p)).join('')
                : '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted)">No products found.</div>';
        } catch (e) { grid.innerHTML = `<p style="color:var(--danger);grid-column:1/-1">${e.message}</p>`; }
    },
    filterCategory(cat) {
        this.currentCategory = cat;
        document.querySelectorAll('#category-filter li').forEach(li => {
            li.classList.toggle('active', li.textContent.trim().startsWith(cat === 'All' ? 'All' : cat));
        });
        this.renderProducts();
    },
    searchProducts(term) { this.searchTerm = term; this.renderProducts(); }
};

// ============================================================
// Cart (client-side only, synced to API on checkout)
// ============================================================
app.cart = {
    toggleCart() {
        document.getElementById('cart-overlay').classList.toggle('active');
        document.getElementById('cart-sidebar').classList.toggle('active');
        this.render();
    },
    addItem(productId) {
        // Find from loaded products
        const product = state.allProducts.find(p => p.id === productId);
        if (!product) { toast('Product not found', 'error'); return; }

        const existing = state.cart.find(i => i.product.id === productId);
        if (existing) {
            if (existing.qty >= product.stock) { toast('Not enough stock', 'error'); return; }
            existing.qty++;
        } else {
            if (product.stock <= 0) { toast('Out of stock', 'error'); return; }
            state.cart.push({ product, qty: 1 });
        }
        this.updateCount();
        if (document.getElementById('cart-sidebar').classList.contains('active')) this.render();
        toast(`"${product.name}" added to cart`);
    },
    removeItem(productId) {
        state.cart = state.cart.filter(i => i.product.id !== productId);
        this.updateCount(); this.render();
    },
    updateQty(productId, delta) {
        const item = state.cart.find(i => i.product.id === productId);
        if (!item) return;
        const newQty = item.qty + delta;
        if (newQty <= 0) { this.removeItem(productId); return; }
        if (newQty > item.product.stock) { toast('Not enough stock', 'error'); return; }
        item.qty = newQty;
        this.render();
    },
    updateCount() {
        document.getElementById('cart-count').textContent = state.cart.reduce((s, i) => s + i.qty, 0);
    },
    getTotal() { return state.cart.reduce((s, i) => s + i.product.price * i.qty, 0); },
    render() {
        const container = document.getElementById('cart-items');
        if (!container) return;
        if (state.cart.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-muted);margin-top:20px">Your cart is empty</div>';
            document.getElementById('cart-total-price').textContent = '₱0.00';
            return;
        }
        container.innerHTML = state.cart.map(item => `
            <div class="cart-item">
                <img src="${item.product.image_url || 'https://via.placeholder.com/60'}" onerror="this.src='https://via.placeholder.com/60'">
                <div class="cart-item-info">
                    <h4>${item.product.name}</h4>
                    <div class="price">${formatMoney(item.product.price)}</div>
                    <div class="cart-item-actions">
                        <button class="qty-btn" onclick="app.cart.updateQty(${item.product.id},-1)">-</button>
                        <span>${item.qty}</span>
                        <button class="qty-btn" onclick="app.cart.updateQty(${item.product.id},1)">+</button>
                        <button class="del-btn" onclick="app.cart.removeItem(${item.product.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>`).join('');
        document.getElementById('cart-total-price').textContent = formatMoney(this.getTotal());
    },
    async checkout() {
        if (state.cart.length === 0) { toast('Cart is empty', 'error'); return; }
        if (!state.user) { this.toggleCart(); app.auth.showAuthModal(); return; }
        
        // Show checkout modal instead of directly placing order
        this.showCheckoutModal();
    },
    showCheckoutModal() {
        const modal = document.getElementById('checkout-modal');
        document.getElementById('checkout-total').textContent = formatMoney(this.getTotal());
        modal.classList.add('active');
    },
    closeCheckoutModal() {
        const modal = document.getElementById('checkout-modal');
        modal.classList.remove('active');
        document.getElementById('checkout-form').reset();
        document.getElementById('payment-details-group').style.display = 'none';
    },
    updatePaymentMethod() {
        const method = document.getElementById('payment-method').value;
        const detailsGroup = document.getElementById('payment-details-group');
        const detailsInput = document.getElementById('payment-details');
        
        if (method === 'contact') {
            detailsGroup.style.display = 'block';
            detailsInput.placeholder = 'Your contact number for delivery';
            detailsInput.value = state.user.contact_number || '';
            detailsInput.required = true;
        } else if (method === 'gcash') {
            detailsGroup.style.display = 'block';
            detailsInput.placeholder = 'Your GCash number used for payment';
            detailsInput.value = state.user.gcash_number || '';
            detailsInput.required = true;
        } else {
            detailsGroup.style.display = 'none';
            detailsInput.required = false;
        }
    },
    async submitOrder() {
        const payment_method = document.getElementById('payment-method').value;
        const payment_details = document.getElementById('payment-details').value;
        
        const items = state.cart.map(i => ({ product_id: i.product.id, quantity: i.qty }));
        try {
            const order = await api('POST', '/orders', { 
                items, 
                payment_method, 
                payment_details 
            }, true);
            state.cart = [];
            this.updateCount();
            this.closeCheckoutModal();
            this.toggleCart();
            toast(`Order ${order.order_number} placed successfully! Waiting for admin approval. 🎉`, 'success');
            // Refresh product list to show updated stock
            if (app.router.currentRoute === 'shop') app.shop.renderProducts();
            if (app.router.currentRoute === 'home') app.shop.renderFeatured();
        } catch (e) { toast(e.message, 'error'); }
    }
};

// ============================================================
// Transactions
// ============================================================
app.transactions = {
    async renderUserOrders() {
        const tbody = document.getElementById('user-orders');
        const emptyMsg = document.getElementById('no-orders-msg');
        if (!tbody) return;
        try {
            const orders = await api('GET', '/orders/my', null, true);
            if (orders.length === 0) {
                tbody.closest('.table-responsive').style.display = 'none';
                emptyMsg.style.display = 'block';
                return;
            }
            emptyMsg.style.display = 'none';
            tbody.closest('.table-responsive').style.display = 'block';
            tbody.innerHTML = orders.map(o => {
                const statusColor = o.admin_approved ? 'var(--success)' : 'var(--warning)';
                const statusText = o.status || 'Pending';
                return `
                <tr>
                    <td><strong>${o.order_number}</strong></td>
                    <td>${new Date(o.created_at).toLocaleDateString()}</td>
                    <td>${o.items.reduce((s, i) => s + i.quantity, 0)} items</td>
                    <td>${formatMoney(o.total_amount)}</td>
                    <td><span style="background:${statusColor};padding:3px 10px;border-radius:12px;font-size:0.8rem">${statusText}</span></td>
                </tr>`;
            }).join('');
        } catch (e) { toast('Failed to load orders', 'error'); }
    }
};

// ============================================================
// Admin Panel (CRUD)
// ============================================================
app.admin = {
    currentTab: 'products',
    switchTab(tabName) {
        this.currentTab = tabName;
        const productsView = document.getElementById('admin-products-view');
        const txView = document.getElementById('admin-transactions-view');
        if (tabName === 'products') {
            productsView.style.display = 'block'; txView.style.display = 'none';
            this.renderProductsTable();
        } else {
            productsView.style.display = 'none'; txView.style.display = 'block';
            this.renderTransactionsTable();
        }
    },
    openProductModal(id = null) {
        const modal = document.getElementById('product-modal');
        document.getElementById('product-form').reset();
        if (id) {
            const p = state.allProducts.find(pr => pr.id === id);
            if (p) {
                document.getElementById('product-modal-title').textContent = 'Edit Product';
                document.getElementById('prod-id').value = p.id;
                document.getElementById('prod-name').value = p.name;
                document.getElementById('prod-price').value = p.price;
                document.getElementById('prod-category').value = p.category;
                document.getElementById('prod-image').value = p.image_url || '';
                document.getElementById('prod-stock').value = p.stock;
                document.getElementById('prod-desc').value = p.description || '';
            }
        } else {
            document.getElementById('product-modal-title').textContent = 'Add New Product';
            document.getElementById('prod-id').value = '';
        }
        modal.classList.add('active');
    },
    closeProductModal() { document.getElementById('product-modal').classList.remove('active'); },
    async saveProduct() {
        const id = document.getElementById('prod-id').value;
        const payload = {
            name: document.getElementById('prod-name').value,
            price: parseFloat(document.getElementById('prod-price').value),
            category: document.getElementById('prod-category').value,
            image_url: document.getElementById('prod-image').value,
            stock: parseInt(document.getElementById('prod-stock').value),
            description: document.getElementById('prod-desc').value,
        };
        try {
            if (id) {
                await api('PUT', `/products/${id}`, payload, true);
                toast('Product updated');
            } else {
                await api('POST', '/products', payload, true);
                toast('Product created');
            }
            this.closeProductModal();
            const products = await api('GET', '/products');
            state.allProducts = products;
            this.renderProductsTable();
        } catch (e) { toast(e.message, 'error'); }
    },
    async deleteProduct(id) {
        if (!confirm('Delete this product?')) return;
        try {
            await api('DELETE', `/products/${id}`, null, true);
            toast('Product deleted');
            const products = await api('GET', '/products');
            state.allProducts = products;
            // Remove from cart too
            state.cart = state.cart.filter(i => i.product.id !== id);
            app.cart.updateCount();
            this.renderProductsTable();
        } catch (e) { toast(e.message, 'error'); }
    },
    async renderProductsTable() {
        const tbody = document.getElementById('admin-product-list');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Loading...</td></tr>';
        try {
            const products = await api('GET', '/products');
            state.allProducts = products;
            tbody.innerHTML = products.map(p => `
                <tr>
                    <td><img src="${p.image_url || 'https://via.placeholder.com/40'}" style="width:40px;height:40px;object-fit:cover;border-radius:4px" onerror="this.src='https://via.placeholder.com/40'"></td>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.category}</td>
                    <td>${formatMoney(p.price)}</td>
                    <td>${p.stock}</td>
                    <td>
                        <button class="btn outline-btn" style="padding:5px 10px;font-size:0.8rem" onclick="app.admin.openProductModal(${p.id})">Edit</button>
                        <button class="btn danger-btn" style="padding:5px 10px;font-size:0.8rem;margin-left:5px" onclick="app.admin.deleteProduct(${p.id})">Delete</button>
                    </td>
                </tr>`).join('');
        } catch (e) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger)">${e.message}</td></tr>`; }
    },
    async renderTransactionsTable() {
        const tbody = document.getElementById('admin-transactions-list');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Loading...</td></tr>';
        try {
            const orders = await api('GET', '/orders', null, true);
            tbody.innerHTML = orders.length ? orders.map(o => {
                const statusColor = o.admin_approved ? 'var(--success)' : 'var(--warning)';
                const statusText = o.status || 'Pending';
                const approveBtn = o.admin_approved 
                    ? '<span style="color:var(--success)">✓ Approved</span>' 
                    : `<button class="btn primary-btn" style="padding:5px 10px;font-size:0.8rem" onclick="app.admin.approveOrder(${o.id})">Approve</button>`;
                
                return `
                <tr>
                    <td><strong>${o.order_number}</strong></td>
                    <td>${o.user ? o.user.name : 'Unknown'}<br><small style="color:var(--text-muted)">${o.user ? o.user.email : ''}</small></td>
                    <td>${o.user && o.user.contact_number ? o.user.contact_number : 'N/A'}<br>
                        ${o.user && o.user.messenger_account ? `<small style="color:var(--text-muted)">FB: ${o.user.messenger_account}</small>` : ''}</td>
                    <td><span style="text-transform:capitalize">${o.payment_method || 'N/A'}</span></td>
                    <td>${o.payment_details || 'N/A'}</td>
                    <td><strong style="color:var(--secondary)">${formatMoney(o.total_amount)}</strong></td>
                    <td><span style="color:${statusColor}">${statusText}</span></td>
                    <td>${approveBtn}</td>
                </tr>`;
            }).join('')
                : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No orders yet</td></tr>';
        } catch (e) { tbody.innerHTML = `<tr><td colspan="8" style="color:var(--danger)">${e.message}</td></tr>`; }
    },
    async approveOrder(orderId) {
        if (!confirm('Approve this order?')) return;
        try {
            await api('PUT', `/orders/${orderId}/approve`, null, true);
            toast('Order approved successfully! 🎉', 'success');
            this.renderTransactionsTable();
        } catch (e) { toast(e.message, 'error'); }
    },
    async loadCustomers() {
        try {
            const customers = await api('GET', '/orders/customers', null, true);
            let msg = 'Customers who placed orders:\n\n';
            customers.forEach(c => {
                msg += `• ${c.name} (${c.email})\n`;
                if (c.contact_number) msg += `  Contact: ${c.contact_number}\n`;
                if (c.messenger_account) msg += `  Messenger: ${c.messenger_account}\n`;
                if (c.gcash_number) msg += `  GCash: ${c.gcash_number}\n`;
                msg += '\n';
            });
            alert(msg);
        } catch (e) { toast(e.message, 'error'); }
    }
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    app.auth.init();
    app.cart.updateCount();
    app.router.navigate('home');
});
