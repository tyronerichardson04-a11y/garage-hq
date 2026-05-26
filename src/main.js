import { supabase } from './lib/supabase.js'
import { sendMagicLink, getSession, onAuthChange, getUserDisplayName, getUserInitials } from './lib/auth.js'
import { renderSidebar, bindSidebarEvents } from './components/Sidebar.js'
import { renderDashboard } from './pages/Dashboard.js'
import { renderSchedule } from './pages/Schedule.js'
import { renderSpend } from './pages/Spend.js'
import { CATEGORIES, MAINTENANCE_TYPES, PROJECT_STATUSES, PRIORITIES } from './data.js'

// ─────────────────────────────────────────────────────────────
//  APP STATE
// ─────────────────────────────────────────────────────────────
let state = {
  user: null,
  session: null,
  ownedVehicles: [],
  sharedVehicles: [],
  tasksByVehicle: {},        // { vehicleId: [tasks] }
  activeVehicleId: null,
  activePage: 'fleet',       // fleet | schedule | spend
}

const app = document.getElementById('app')

// ─────────────────────────────────────────────────────────────
//  AUTH FLOW
// ─────────────────────────────────────────────────────────────
function renderAuth() {
  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="logo-icon"><i class="ti ti-tool"></i></div>
          <span class="logo-text">Garage HQ</span>
        </div>
        <h2>Sign in</h2>
        <p>We'll send a magic link to your email.</p>
        <div id="auth-error" class="auth-error" style="display:none"></div>
        <div id="auth-form">
          <div class="auth-field">
            <label>Email address</label>
            <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email" />
          </div>
          <button class="btn-primary" id="auth-submit">Send Magic Link</button>
        </div>
        <div id="auth-confirm" style="display:none">
          <div class="auth-confirm">
            <div class="confirm-icon"><i class="ti ti-mail-check"></i></div>
            <h3>Check your email</h3>
            <p>We sent a magic link to <strong id="confirm-email"></strong>. Click it to sign in.</p>
          </div>
        </div>
      </div>
    </div>
  `

  const emailInput = document.getElementById('auth-email')
  const submitBtn  = document.getElementById('auth-submit')
  const errEl      = document.getElementById('auth-error')

  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim()
    if (!email) { showAuthError('Please enter your email.'); return }
    submitBtn.disabled = true
    submitBtn.textContent = 'Sending…'
    try {
      await sendMagicLink(email)
      document.getElementById('auth-form').style.display = 'none'
      document.getElementById('auth-confirm').style.display = 'block'
      document.getElementById('confirm-email').textContent = email
    } catch (e) {
      showAuthError(e.message || 'Something went wrong. Please try again.')
      submitBtn.disabled = false
      submitBtn.textContent = 'Send Magic Link'
    }
  })

  emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitBtn.click() })

  function showAuthError(msg) {
    errEl.textContent = msg
    errEl.style.display = 'block'
  }
}

// ─────────────────────────────────────────────────────────────
//  DATA LOADING
// ─────────────────────────────────────────────────────────────
async function loadVehicleData() {
  const uid = state.user.id

  // Owned vehicles
  const { data: owned } = await supabase
    .from('garage_hq_vehicles')
    .select('*')
    .eq('owner_id', uid)
    .order('created_at')

  // Shared vehicles
  const { data: memberships } = await supabase
    .from('garage_hq_vehicle_members')
    .select('vehicle_id, role')
    .eq('user_id', uid)

  let shared = []
  if (memberships && memberships.length > 0) {
    const sharedIds = memberships.map(m => m.vehicle_id)
    const ownedIds = (owned || []).map(v => v.id)
    const foreignIds = sharedIds.filter(id => !ownedIds.includes(id))
    if (foreignIds.length > 0) {
      const { data } = await supabase.from('garage_hq_vehicles').select('*').in('id', foreignIds)
      shared = data || []
    }
  }

  state.ownedVehicles = owned || []
  state.sharedVehicles = shared

  // Load tasks for all vehicles
  const allVehicles = [...state.ownedVehicles, ...state.sharedVehicles]
  state.tasksByVehicle = {}

  if (allVehicles.length > 0) {
    const { data: tasks } = await supabase
      .from('garage_hq_repair_tasks')
      .select('*')
      .in('vehicle_id', allVehicles.map(v => v.id))

    for (const v of allVehicles) {
      state.tasksByVehicle[v.id] = (tasks || []).filter(t => t.vehicle_id === v.id)
    }
  }

  // Set active vehicle if not set or stale
  const allIds = allVehicles.map(v => v.id)
  if (!state.activeVehicleId || !allIds.includes(state.activeVehicleId)) {
    state.activeVehicleId = allVehicles[0]?.id || null
  }
}

// ─────────────────────────────────────────────────────────────
//  MAIN APP RENDER
// ─────────────────────────────────────────────────────────────
async function renderApp() {
  await loadVehicleData()

  const allVehicles = [...state.ownedVehicles, ...state.sharedVehicles]
  const activeVehicle = allVehicles.find(v => v.id === state.activeVehicleId) || null

  const displayName = getUserDisplayName(state.user)
  const initials    = getUserInitials(state.user)

  app.innerHTML = `
    <div class="app-shell">
      <div id="sidebar-mount"></div>
      <div class="main-area">
        <div class="topbar">
          <span style="font-size:15px;font-weight:700;letter-spacing:-0.2px;color:var(--text-primary)">
            ${activeVehicle ? activeVehicle.nickname : 'Garage HQ'}
          </span>
          <div class="topbar-nav">
            <button class="topbar-tab ${state.activePage === 'fleet' ? 'active' : ''}" data-page="fleet">
              <i class="ti ti-car"></i> Fleet
            </button>
            <button class="topbar-tab ${state.activePage === 'schedule' ? 'active' : ''}" data-page="schedule">
              <i class="ti ti-calendar"></i> Schedule
            </button>
            <button class="topbar-tab ${state.activePage === 'spend' ? 'active' : ''}" data-page="spend">
              <i class="ti ti-report-money"></i> Spend
            </button>
          </div>
        </div>
        <div class="page-content" id="page-content">
          <div class="loading-state"><div class="spinner"></div> Loading…</div>
        </div>
      </div>
    </div>
    <div class="toast-container" id="toast-container"></div>
    ${addVehicleModalHTML()}
  `

  // Render sidebar
  const sidebarMount = document.getElementById('sidebar-mount')
  sidebarMount.innerHTML = renderSidebar({
    user: state.user,
    ownedVehicles: state.ownedVehicles,
    sharedVehicles: state.sharedVehicles,
    tasksByVehicle: state.tasksByVehicle,
    activeVehicleId: state.activeVehicleId,
    onSelectVehicle: null,
    onAddVehicle: null,
  })

  bindSidebarEvents({
    onSelectVehicle: (id) => {
      state.activeVehicleId = id
      state.activePage = 'fleet'
      renderApp()
    },
    onAddVehicle: () => {
      document.getElementById('add-vehicle-backdrop').classList.remove('hidden')
    },
  })

  // Bind nav tabs
  document.querySelectorAll('.topbar-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activePage = btn.dataset.page
      renderPage()
      document.querySelectorAll('.topbar-tab').forEach(b => b.classList.toggle('active', b === btn))
    })
  })

  // Bind add vehicle modal
  bindAddVehicleModal()

  // Render active page
  renderPage()
}

async function renderPage() {
  const content = document.getElementById('page-content')
  if (!content) return

  const allVehicles = [...state.ownedVehicles, ...state.sharedVehicles]
  const activeVehicle = allVehicles.find(v => v.id === state.activeVehicleId) || null

  const refreshApp = async (newVehicleId) => {
    if (newVehicleId !== undefined) state.activeVehicleId = newVehicleId
    await renderApp()
  }

  if (state.activePage === 'fleet') {
    await renderDashboard(content, activeVehicle, state.user, refreshApp)
  } else if (state.activePage === 'schedule') {
    await renderSchedule(content, allVehicles, state.tasksByVehicle)
  } else if (state.activePage === 'spend') {
    await renderSpend(content, allVehicles, state.tasksByVehicle)
  }
}

// ─────────────────────────────────────────────────────────────
//  ADD VEHICLE MODAL
// ─────────────────────────────────────────────────────────────
function addVehicleModalHTML() {
  return `
    <div class="modal-backdrop hidden" id="add-vehicle-backdrop">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Add Vehicle</span>
          <button class="modal-close" id="av-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nickname *</label>
            <input type="text" id="av-nickname" placeholder="e.g. Daily Driver, Track Car, The Beast" />
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Year</label>
              <input type="number" id="av-year" placeholder="2020" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Make</label>
              <input type="text" id="av-make" placeholder="Ford, GM, Dodge…" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Model</label>
              <input type="text" id="av-model" placeholder="F-150, Camaro…" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Trim</label>
              <input type="text" id="av-trim" placeholder="LT, GT, Sport…" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Current Mileage</label>
              <input type="number" id="av-mileage" placeholder="45000" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">VIN</label>
              <input type="text" id="av-vin" placeholder="Optional" maxlength="17" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Photo URL</label>
            <input type="url" id="av-photo" placeholder="https://…" />
            <img class="photo-preview" id="av-photo-preview" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" id="av-cancel">Cancel</button>
          <button class="btn-gold" id="av-save">Add Vehicle</button>
        </div>
      </div>
    </div>
  `
}

function bindAddVehicleModal() {
  const backdrop = document.getElementById('add-vehicle-backdrop')
  if (!backdrop) return

  const close = () => backdrop.classList.add('hidden')
  document.getElementById('av-close')?.addEventListener('click', close)
  document.getElementById('av-cancel')?.addEventListener('click', close)
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close() })

  // Photo preview
  document.getElementById('av-photo')?.addEventListener('input', (e) => {
    const preview = document.getElementById('av-photo-preview')
    const url = e.target.value.trim()
    if (url) { preview.src = url; preview.classList.add('visible') }
    else preview.classList.remove('visible')
  })

  document.getElementById('av-save')?.addEventListener('click', async () => {
    const nickname = document.getElementById('av-nickname').value.trim()
    if (!nickname) {
      showInlineToast('Nickname is required', 'error')
      return
    }

    const { data, error } = await supabase.from('garage_hq_vehicles').insert({
      owner_id: state.user.id,
      nickname,
      year: parseInt(document.getElementById('av-year').value) || null,
      make: document.getElementById('av-make').value || null,
      model: document.getElementById('av-model').value || null,
      trim: document.getElementById('av-trim').value || null,
      vin: document.getElementById('av-vin').value || null,
      current_mileage: parseInt(document.getElementById('av-mileage').value) || 0,
      photo_url: document.getElementById('av-photo').value || null,
    }).select().single()

    if (error) { showInlineToast('Error adding vehicle', 'error'); return }

    state.activeVehicleId = data.id
    state.activePage = 'fleet'
    close()
    await renderApp()
  })
}

function showInlineToast(msg, type = 'success') {
  const container = document.getElementById('toast-container')
  if (!container) { console.warn('No toast container'); return }
  const icon = type === 'success' ? 'ti-circle-check' : 'ti-circle-x'
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.innerHTML = `<i class="ti ${icon} ${type}"></i> ${msg}`
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3200)
}

// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
async function boot() {
  const session = await getSession()

  if (session) {
    state.user = session.user
    state.session = session
    await renderApp()
  } else {
    renderAuth()
  }

  onAuthChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      state.user = session.user
      state.session = session
      await renderApp()
    } else if (event === 'SIGNED_OUT') {
      state.user = null
      state.session = null
      state.ownedVehicles = []
      state.sharedVehicles = []
      state.tasksByVehicle = {}
      state.activeVehicleId = null
      renderAuth()
    }
  })
}

boot()
