import { supabase } from './lib/supabase.js'
import { sendMagicLink, verifyOtpCode, getSession, onAuthChange, getUserDisplayName, getUserInitials } from './lib/auth.js'
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

// Track the *visible* viewport height (shrinks when the iPhone keyboard opens)
// so modals and panels can size to the space above the keyboard.
function syncViewportHeight() {
  const vv = window.visualViewport
  const h = vv ? vv.height : window.innerHeight
  document.documentElement.style.setProperty('--vvh', `${h}px`)
  document.documentElement.style.setProperty('--vvtop', `${vv ? vv.offsetTop : 0}px`)
}
syncViewportHeight()
window.visualViewport?.addEventListener('resize', syncViewportHeight)
window.visualViewport?.addEventListener('scroll', syncViewportHeight)
window.addEventListener('resize', syncViewportHeight)

// Touch devices: keep the focused field visible above the keyboard
const isTouch = window.matchMedia('(pointer: coarse)').matches
document.addEventListener('focusin', (e) => {
  if (!isTouch || !e.target.matches('input, select, textarea')) return
  // Scroll only the field's own scroll area. (scrollIntoView would also shift
  // overflow:hidden parents, pushing the panel header + close button off-screen.)
  const field = e.target
  setTimeout(() => {
    const box = field.closest('.modal-body, .slide-panel-body, .page-content')
    if (!box) return
    const f = field.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    if (f.top < b.top + 8 || f.bottom > b.bottom - 8) {
      box.scrollTo({ top: box.scrollTop + (f.top - b.top) - (b.height - f.height) / 2, behavior: 'smooth' })
    }
  }, 300)
})

// Esc closes the top-most open modal/panel (then the nav drawer)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  const open = [...document.querySelectorAll('.modal-backdrop:not(.hidden), .slide-panel-backdrop:not(.hidden)')]
  const top = open.find(el => el.classList.contains('modal-backdrop')) || open[0]
  if (top) top.classList.add('hidden')
  else setNavOpen(false)
})

function setNavOpen(open) {
  document.querySelector('.app-shell')?.classList.toggle('nav-open', open)
}

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
        <p id="auth-sub">We'll email you a 6-digit sign-in code.</p>
        <div id="auth-error" class="auth-error" style="display:none"></div>

        <div id="auth-form">
          <div class="auth-field">
            <label for="auth-email">Email address</label>
            <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email" inputmode="email" autocapitalize="off" />
          </div>
          <button class="btn-primary" id="auth-submit">Send Code</button>
        </div>

        <div id="auth-code-step" style="display:none">
          <div class="auth-field">
            <label for="auth-code">6-digit code</label>
            <input type="text" id="auth-code" class="auth-code-input" inputmode="numeric" pattern="[0-9]*"
                   autocomplete="one-time-code" maxlength="6" placeholder="••••••" />
          </div>
          <button class="btn-primary" id="auth-verify">Sign In</button>
          <p class="auth-hint">On a computer, you can also just tap the link in the email.</p>
          <div class="auth-links">
            <button class="section-link" id="auth-resend" disabled>Resend code (30)</button>
            <button class="section-link" id="auth-change-email">Use a different email</button>
          </div>
        </div>
      </div>
    </div>
  `

  const emailInput = document.getElementById('auth-email')
  const submitBtn  = document.getElementById('auth-submit')
  const codeInput  = document.getElementById('auth-code')
  const verifyBtn  = document.getElementById('auth-verify')
  const resendBtn  = document.getElementById('auth-resend')
  const errEl      = document.getElementById('auth-error')
  let email = ''
  let resendTimer = null

  function showAuthError(msg) {
    errEl.textContent = msg
    errEl.style.display = 'block'
  }
  function clearAuthError() { errEl.style.display = 'none' }

  function startResendCountdown() {
    let left = 30
    resendBtn.disabled = true
    resendBtn.textContent = `Resend code (${left})`
    clearInterval(resendTimer)
    resendTimer = setInterval(() => {
      left -= 1
      if (left <= 0) {
        clearInterval(resendTimer)
        resendBtn.disabled = false
        resendBtn.textContent = 'Resend code'
      } else {
        resendBtn.textContent = `Resend code (${left})`
      }
    }, 1000)
  }

  function showCodeStep() {
    document.getElementById('auth-form').style.display = 'none'
    document.getElementById('auth-code-step').style.display = 'block'
    document.getElementById('auth-sub').innerHTML = `Enter the code we sent to <strong></strong>.`
    document.querySelector('#auth-sub strong').textContent = email
    codeInput.value = ''
    codeInput.focus()
    startResendCountdown()
  }

  submitBtn.addEventListener('click', async () => {
    email = emailInput.value.trim()
    if (!email) { showAuthError('Please enter your email.'); return }
    clearAuthError()
    submitBtn.disabled = true
    submitBtn.textContent = 'Sending…'
    try {
      await sendMagicLink(email)
      showCodeStep()
    } catch (e) {
      showAuthError(e.message || 'Something went wrong. Please try again.')
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Send Code'
    }
  })
  emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitBtn.click() })

  async function verify() {
    const code = codeInput.value.replace(/\D/g, '')
    if (code.length !== 6) { showAuthError('Enter the 6-digit code from the email.'); return }
    clearAuthError()
    verifyBtn.disabled = true
    verifyBtn.textContent = 'Signing in…'
    try {
      await verifyOtpCode(email, code)
      clearInterval(resendTimer)
      // onAuthChange (SIGNED_IN) renders the app
    } catch (e) {
      showAuthError('That code is invalid or expired. Check the latest email or resend.')
      verifyBtn.disabled = false
      verifyBtn.textContent = 'Sign In'
      codeInput.select()
    }
  }

  verifyBtn.addEventListener('click', verify)
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6)
    if (codeInput.value.length === 6) verify()
  })
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') verify() })

  resendBtn.addEventListener('click', async () => {
    clearAuthError()
    resendBtn.disabled = true
    try {
      await sendMagicLink(email)
      document.getElementById('auth-sub').innerHTML = `New code sent to <strong></strong>. Use the latest one.`
      document.querySelector('#auth-sub strong').textContent = email
      codeInput.value = ''
      codeInput.focus()
      startResendCountdown()
    } catch (e) {
      showAuthError(e.message || 'Could not resend. Please wait a minute and try again.')
      resendBtn.disabled = false
    }
  })

  document.getElementById('auth-change-email').addEventListener('click', () => {
    clearInterval(resendTimer)
    clearAuthError()
    document.getElementById('auth-code-step').style.display = 'none'
    document.getElementById('auth-form').style.display = 'block'
    document.getElementById('auth-sub').textContent = "We'll email you a 6-digit sign-in code."
    emailInput.focus()
  })
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
      <div class="nav-scrim" id="nav-scrim"></div>
      <div class="main-area">
        <div class="topbar">
          <button class="nav-toggle" id="nav-toggle" aria-label="Open vehicle menu"><i class="ti ti-menu-2"></i></button>
          <span class="topbar-title">
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
      setNavOpen(false)
      document.getElementById('add-vehicle-backdrop').classList.remove('hidden')
    },
  })

  // Phone/tablet: sidebar is a slide-out drawer
  document.getElementById('nav-toggle')?.addEventListener('click', () => setNavOpen(true))
  document.getElementById('nav-scrim')?.addEventListener('click', () => setNavOpen(false))

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
