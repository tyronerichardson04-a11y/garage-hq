import { signOut, getUserDisplayName, getUserInitials } from '../lib/auth.js'

export function computeStatusDot(tasks, vehicleMileage) {
  if (!tasks || tasks.length === 0) return 'muted'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30 = new Date(today); in30.setDate(today.getDate() + 30)

  let hasRed = false
  let hasAmber = false

  for (const t of tasks) {
    if (t.next_due_date) {
      const due = new Date(t.next_due_date)
      if (due < today) { hasRed = true; break }
      if (due <= in30) hasAmber = true
    }
    if (t.next_due_mileage && vehicleMileage) {
      const gap = t.next_due_mileage - vehicleMileage
      if (gap <= 0) { hasRed = true; break }
      if (gap <= 500) hasAmber = true
    }
  }

  if (hasRed) return 'red'
  if (hasAmber) return 'amber'
  return 'green'
}

export function renderSidebar({ user, ownedVehicles, sharedVehicles, tasksByVehicle, activeVehicleId, onSelectVehicle, onAddVehicle }) {
  const displayName = getUserDisplayName(user)
  const initials = getUserInitials(user)

  const vehicleItem = (v, shared = false) => {
    const tasks = tasksByVehicle[v.id] || []
    const dot = computeStatusDot(tasks, v.current_mileage)
    const isActive = v.id === activeVehicleId
    return `
      <button class="sidebar-vehicle ${isActive ? 'active' : ''}" data-id="${v.id}">
        <span class="status-dot ${dot}"></span>
        <span class="sidebar-vehicle-name">${v.nickname}</span>
        ${shared ? '<i class="ti ti-users" style="font-size:12px;color:var(--text-muted);flex-shrink:0"></i>' : ''}
      </button>
    `
  }

  return `
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo-icon"><i class="ti ti-tool"></i></div>
        <span class="sidebar-logo-text">Garage HQ</span>
      </div>

      <div class="sidebar-scroll">
        <div class="sidebar-section">
          <div class="sidebar-section-label">My Fleet</div>
          ${ownedVehicles.map(v => vehicleItem(v, false)).join('')}
          <button class="sidebar-add-btn" id="sidebar-add-vehicle">
            <i class="ti ti-plus" style="font-size:14px"></i>
            Add vehicle
          </button>
        </div>

        ${sharedVehicles.length > 0 ? `
          <div class="sidebar-divider"></div>
          <div class="sidebar-section">
            <div class="sidebar-section-label">Shared with me</div>
            ${sharedVehicles.map(v => vehicleItem(v, true)).join('')}
          </div>
        ` : ''}
      </div>

      <div class="sidebar-bottom">
        <div class="sidebar-user">
          <div class="user-avatar">${initials}</div>
          <div class="user-info">
            <div class="user-name">${displayName}</div>
            <div class="user-email">${user.email}</div>
          </div>
          <button class="btn-signout" id="sidebar-signout" title="Sign out">
            <i class="ti ti-logout"></i>
          </button>
        </div>
      </div>
    </aside>
  `
}

export function bindSidebarEvents({ onSelectVehicle, onAddVehicle }) {
  document.querySelectorAll('.sidebar-vehicle').forEach(btn => {
    btn.addEventListener('click', () => onSelectVehicle(btn.dataset.id))
  })

  const addBtn = document.getElementById('sidebar-add-vehicle')
  if (addBtn) addBtn.addEventListener('click', onAddVehicle)

  const signoutBtn = document.getElementById('sidebar-signout')
  if (signoutBtn) signoutBtn.addEventListener('click', async () => {
    await signOut()
    window.location.reload()
  })
}
