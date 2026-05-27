import { supabase } from '../lib/supabase.js'
import { renderProjectCard, statusBadgeClass, typeBadgeClass, priorityBadgeClass } from '../components/ProjectCard.js'
import { renderTaskRow } from '../components/TaskRow.js'
import { renderDueRow, getDueUrgency } from '../components/DueRow.js'
import { showToast, openModal, closeModal, bindModalClose } from '../components/Modal.js'
import { CATEGORIES, MAINTENANCE_TYPES, PROJECT_STATUSES, TASK_STATUSES, PRIORITIES, PART_STATUSES } from '../data.js'

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function ytdStart() {
  return new Date(new Date().getFullYear(), 0, 1)
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD RENDER
// ─────────────────────────────────────────────────────────────
export async function renderDashboard(container, vehicle, user, refreshApp) {
  if (!vehicle) {
    container.innerHTML = `
      <div class="no-vehicle-state">
        <i class="ti ti-car-garage"></i>
        <h2>No vehicle selected</h2>
        <p>Add a vehicle from the sidebar to get started.</p>
      </div>
    `
    return
  }

  container.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading…</div>`

  // Fetch data
  const [projRes, taskRes, partsRes] = await Promise.all([
    supabase.from('garage_hq_repair_projects').select('*').eq('vehicle_id', vehicle.id).order('created_at', { ascending: false }),
    supabase.from('garage_hq_repair_tasks').select('*').eq('vehicle_id', vehicle.id).order('created_at', { ascending: false }),
    supabase.from('garage_hq_parts_list').select('*').in('project_id', []),
  ])

  const projects = projRes.data || []
  const tasks = taskRes.data || []

  // fetch parts for these projects
  let parts = []
  if (projects.length > 0) {
    const { data } = await supabase.from('garage_hq_parts_list').select('*').in('project_id', projects.map(p => p.id))
    parts = data || []
  }

  // Stats
  const activeProjects = projects.filter(p => ['Planning', 'In Progress'].includes(p.status))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const in30 = new Date(today); in30.setDate(today.getDate() + 30)

  const dueSoon = tasks.filter(t => {
    if (!t.next_due_date && !t.next_due_mileage) return false
    if (t.next_due_date) {
      const due = new Date(t.next_due_date)
      if (due <= in30) return true
    }
    if (t.next_due_mileage && vehicle.current_mileage) {
      if (t.next_due_mileage - vehicle.current_mileage <= 500) return true
    }
    return false
  })

  const ytdStart_ = ytdStart()
  const ytdSpend = tasks
    .filter(t => t.date_performed && new Date(t.date_performed) >= ytdStart_)
    .reduce((sum, t) => sum + Number(t.cost_parts || 0) + Number(t.cost_labor || 0), 0)

  const doneTasks = tasks.filter(t => t.status === 'Done' && t.date_performed).sort((a, b) => new Date(b.date_performed) - new Date(a.date_performed))
  const lastService = doneTasks.length > 0 ? fmtDate(doneTasks[0].date_performed) : 'None'

  // Upcoming maintenance (tasks with next_due_*)
  const upcomingTasks = tasks
    .filter(t => t.next_due_date || t.next_due_mileage)
    .sort((a, b) => {
      const ua = getDueUrgency(a, vehicle.current_mileage)
      const ub = getDueUrgency(b, vehicle.current_mileage)
      const order = { overdue: 0, soon: 1, upcoming: 2 }
      return order[ua.urgency] - order[ub.urgency]
    })
    .slice(0, 8)

  const recentTasks = tasks.filter(t => t.status !== 'Done' || t.date_performed).slice(0, 6)

  const ymm = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')

  container.innerHTML = `
    <!-- PAGE HEADER -->
    <div class="page-header">
      <h1>${vehicle.nickname}</h1>
      ${ymm ? `<span class="chip ymm">${ymm}</span>` : ''}
      ${vehicle.current_mileage ? `<span class="chip mileage"><i class="ti ti-gauge"></i> ${Number(vehicle.current_mileage).toLocaleString()} mi</span>` : ''}
      <div class="page-header-actions">
        <button class="btn-secondary" id="btn-vehicle-settings">
          <i class="ti ti-settings"></i> Settings
        </button>
        <button class="btn-gold" id="btn-log-repair">
          <i class="ti ti-plus"></i> Log Repair
        </button>
      </div>
    </div>

    <!-- STATS -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Active Projects</div>
        <div class="stat-value">${activeProjects.length}</div>
        <div class="stat-sub">${projects.filter(p => p.status === 'Complete').length} complete</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Due Soon</div>
        <div class="stat-value" style="color:${dueSoon.length > 0 ? 'var(--amber)' : 'var(--text-primary)'}">${dueSoon.length}</div>
        <div class="stat-sub">within 500 mi or 30 days</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">YTD Spend</div>
        <div class="stat-value" style="color:var(--gold)">${fmtCurrency(ytdSpend)}</div>
        <div class="stat-sub">${new Date().getFullYear()} total</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Last Service</div>
        <div class="stat-value" style="font-size:16px">${lastService}</div>
        <div class="stat-sub">${doneTasks.length} logged tasks</div>
      </div>
    </div>

    <!-- PROJECTS -->
    ${activeProjects.length > 0 ? `
      <div class="section-header">
        <span class="section-title">Active Projects</span>
        <button class="section-link" id="btn-add-project">+ Add Project</button>
      </div>
      <div class="projects-grid" id="projects-grid">
        ${activeProjects.map(p => renderProjectCard(p, tasks, parts)).join('')}
      </div>
    ` : `
      <div class="section-header">
        <span class="section-title">Projects</span>
        <button class="section-link" id="btn-add-project">+ Add Project</button>
      </div>
      <div class="task-list" style="margin-bottom:28px">
        <div class="empty-state">No active projects — <button class="section-link" id="btn-add-project-2">start one</button></div>
      </div>
    `}

    <!-- RECENT TASKS -->
    <div class="section-header">
      <span class="section-title">Recent Tasks</span>
    </div>
    <div class="task-list" id="recent-tasks-list">
      ${recentTasks.length > 0
        ? recentTasks.map(t => renderTaskRow(t)).join('')
        : '<div class="empty-state">No tasks logged yet.</div>'
      }
    </div>

    <!-- UPCOMING MAINTENANCE -->
    <div class="section-header">
      <span class="section-title">Upcoming Maintenance</span>
    </div>
    <div class="task-list" id="upcoming-list">
      ${upcomingTasks.length > 0
        ? upcomingTasks.map(t => renderDueRow(t, vehicle.nickname, vehicle.current_mileage)).join('')
        : '<div class="empty-state">No scheduled maintenance. Log a repair with next due date/mileage to track it here.</div>'
      }
    </div>

    <!-- MODALS -->
    ${logRepairModalHTML(projects)}
    ${addProjectModalHTML()}
    ${projectPanelHTML()}
    ${addVehicleSettingsHTML(vehicle)}
    ${taskModalHTML()}
    ${addPartModalHTML()}
  `

  bindDashboardEvents({ vehicle, tasks, projects, parts, user, refreshApp })
}

// ─────────────────────────────────────────────────────────────
//  MODAL HTML TEMPLATES
// ─────────────────────────────────────────────────────────────
function logRepairModalHTML(projects) {
  return `
    <div class="modal-backdrop hidden" id="log-repair-backdrop">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Log Repair</span>
          <button class="modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input type="text" id="lr-title" placeholder="e.g. Oil Change" />
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Link to Project</label>
              <select id="lr-project">
                <option value="">— None —</option>
                ${projects.map(p => `<option value="${p.id}">${p.title}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Category</label>
              <select id="lr-category">
                <option value="">— Select —</option>
                ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Maintenance Type</label>
              <select id="lr-type">
                ${MAINTENANCE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Status</label>
              <select id="lr-status">
                ${TASK_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-section-title">Service Details</div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Date Performed</label>
              <input type="date" id="lr-date" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Mileage at Service</label>
              <input type="number" id="lr-mileage" placeholder="e.g. 45200" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Parts Cost ($)</label>
              <input type="number" id="lr-cost-parts" placeholder="0.00" step="0.01" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Labor Cost ($)</label>
              <input type="number" id="lr-cost-labor" placeholder="0.00" step="0.01" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Parts Source</label>
              <input type="text" id="lr-parts-source" placeholder="e.g. AutoZone, RockAuto" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Shop Name</label>
              <input type="text" id="lr-shop" placeholder="e.g. Dealer, DIY" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Labor Hours</label>
              <input type="number" id="lr-labor-hours" placeholder="0.5" step="0.25" />
            </div>
            <div></div>
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea id="lr-notes" placeholder="Any notes, diagnosis, observations…"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Video URL</label>
            <input type="url" id="lr-video" placeholder="https://youtube.com/…" />
          </div>
          <div class="form-section-title">Next Service Due</div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Next Due Date</label>
              <input type="date" id="lr-next-date" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Next Due Mileage</label>
              <input type="number" id="lr-next-mileage" placeholder="e.g. 50200" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-gold" id="lr-save">Save Task</button>
        </div>
      </div>
    </div>
  `
}

function addProjectModalHTML() {
  return `
    <div class="modal-backdrop hidden" id="add-project-backdrop">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">New Project</span>
          <button class="modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Project Title *</label>
            <input type="text" id="ap-title" placeholder="e.g. Brake Job, Suspension Overhaul" />
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Maintenance Type</label>
              <select id="ap-type">
                ${MAINTENANCE_TYPES.map(t => `<option>${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Priority</label>
              <select id="ap-priority">
                ${PRIORITIES.map(p => `<option>${p}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Status</label>
              <select id="ap-status">
                ${PROJECT_STATUSES.map(s => `<option>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Estimated Cost ($)</label>
              <input type="number" id="ap-estimated" placeholder="0" step="1" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Target Start</label>
              <input type="date" id="ap-start" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Target Completion</label>
              <input type="date" id="ap-end" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea id="ap-desc" placeholder="What does this project cover?"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-gold" id="ap-save">Create Project</button>
        </div>
      </div>
    </div>
  `
}

function projectPanelHTML() {
  return `
    <div class="slide-panel-backdrop hidden" id="project-panel-backdrop">
      <div class="slide-panel">
        <div class="slide-panel-header">
          <span class="modal-title" id="panel-project-title">Project</span>
          <button class="modal-close" id="panel-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="slide-panel-body" id="panel-body">
          <div class="loading-state"><div class="spinner"></div> Loading…</div>
        </div>
      </div>
    </div>
    ${taskModalHTML()}
    ${addPartModalHTML()}
  `
}

function taskModalHTML() {
  return `
    <div class="modal-backdrop hidden" id="task-modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title" id="task-modal-title">Task Detail</span>
          <button class="modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" id="task-modal-body"></div>
        <div class="modal-footer">
          <button class="btn-cancel">Close</button>
          <button class="btn-gold" id="task-modal-save">Save</button>
        </div>
      </div>
    </div>
  `
}

function addPartModalHTML() {
  return `
    <div class="modal-backdrop hidden" id="add-part-backdrop">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Add Part</span>
          <button class="modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Part Name *</label>
              <input type="text" id="pt-name" placeholder="e.g. Brake Pads Front" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Part Number</label>
              <input type="text" id="pt-number" placeholder="OEM / aftermarket #" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Supplier</label>
              <input type="text" id="pt-supplier" placeholder="e.g. RockAuto, dealer" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Status</label>
              <select id="pt-status">
                ${PART_STATUSES.map(s => `<option>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Unit Cost ($)</label>
              <input type="number" id="pt-cost" placeholder="0.00" step="0.01" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Quantity</label>
              <input type="number" id="pt-qty" placeholder="1" min="1" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">URL</label>
            <input type="url" id="pt-url" placeholder="https://…" />
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea id="pt-notes" style="min-height:60px" placeholder="Notes…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-gold" id="pt-save">Add Part</button>
        </div>
      </div>
    </div>
  `
}

function addVehicleSettingsHTML(vehicle) {
  return `
    <div class="modal-backdrop hidden" id="vehicle-settings-backdrop">
      <div class="modal modal-wide">
        <div class="modal-header">
          <span class="modal-title">Vehicle Settings — ${vehicle.nickname}</span>
          <button class="modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Nickname *</label>
              <input type="text" id="vs-nickname" value="${vehicle.nickname}" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Current Mileage</label>
              <input type="number" id="vs-mileage" value="${vehicle.current_mileage || ''}" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Year</label>
              <input type="number" id="vs-year" value="${vehicle.year || ''}" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Make</label>
              <input type="text" id="vs-make" value="${vehicle.make || ''}" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Model</label>
              <input type="text" id="vs-model" value="${vehicle.model || ''}" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Trim</label>
              <input type="text" id="vs-trim" value="${vehicle.trim || ''}" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">VIN</label>
              <input type="text" id="vs-vin" value="${vehicle.vin || ''}" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Photo URL</label>
              <input type="url" id="vs-photo" value="${vehicle.photo_url || ''}" placeholder="https://…" />
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-title">Share this vehicle</div>
            <div class="share-input-row">
              <input type="email" id="vs-share-email" placeholder="Invite by email address" />
              <button class="btn-gold" id="vs-share-btn" style="width:auto;padding:8px 14px">Invite</button>
            </div>
            <div id="members-list" style="margin-top:10px"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-danger" id="vs-delete">Delete Vehicle</button>
          <button class="btn-cancel">Cancel</button>
          <button class="btn-gold" id="vs-save">Save Changes</button>
        </div>
      </div>
    </div>
  `
}

// ─────────────────────────────────────────────────────────────
//  EVENT BINDING
// ─────────────────────────────────────────────────────────────
function bindDashboardEvents({ vehicle, tasks, projects, parts, user, refreshApp }) {
  // Log Repair modal
  bindModalClose('log-repair-backdrop')
  document.getElementById('btn-log-repair')?.addEventListener('click', () => openModal('log-repair-backdrop'))

  document.getElementById('lr-save')?.addEventListener('click', async () => {
    const title = document.getElementById('lr-title').value.trim()
    if (!title) { showToast('Title is required', 'error'); return }

    const payload = {
      vehicle_id: vehicle.id,
      title,
      project_id: document.getElementById('lr-project').value || null,
      category: document.getElementById('lr-category').value || null,
      maintenance_type: document.getElementById('lr-type').value,
      status: document.getElementById('lr-status').value,
      date_performed: document.getElementById('lr-date').value || null,
      mileage_at_service: parseInt(document.getElementById('lr-mileage').value) || null,
      cost_parts: parseFloat(document.getElementById('lr-cost-parts').value) || 0,
      cost_labor: parseFloat(document.getElementById('lr-cost-labor').value) || 0,
      parts_source: document.getElementById('lr-parts-source').value || null,
      shop_name: document.getElementById('lr-shop').value || null,
      labor_hours: parseFloat(document.getElementById('lr-labor-hours').value) || null,
      notes: document.getElementById('lr-notes').value || null,
      video_url: document.getElementById('lr-video').value || null,
      next_due_date: document.getElementById('lr-next-date').value || null,
      next_due_mileage: parseInt(document.getElementById('lr-next-mileage').value) || null,
    }

    const { error } = await supabase.from('garage_hq_repair_tasks').insert(payload)
    if (error) { showToast('Error saving task', 'error'); return }
    showToast('Task logged!')
    closeModal('log-repair-backdrop')
    await refreshApp()
  })

  // Add Project
  bindModalClose('add-project-backdrop')
  document.getElementById('btn-add-project')?.addEventListener('click', () => openModal('add-project-backdrop'))
  document.getElementById('btn-add-project-2')?.addEventListener('click', () => openModal('add-project-backdrop'))

  document.getElementById('ap-save')?.addEventListener('click', async () => {
    const title = document.getElementById('ap-title').value.trim()
    if (!title) { showToast('Title is required', 'error'); return }

    const { error } = await supabase.from('garage_hq_repair_projects').insert({
      vehicle_id: vehicle.id,
      owner_id: user.id,
      title,
      maintenance_type: document.getElementById('ap-type').value,
      priority: document.getElementById('ap-priority').value,
      status: document.getElementById('ap-status').value,
      estimated_cost: parseFloat(document.getElementById('ap-estimated').value) || 0,
      target_start_date: document.getElementById('ap-start').value || null,
      target_completion_date: document.getElementById('ap-end').value || null,
      description: document.getElementById('ap-desc').value || null,
    })
    if (error) { showToast('Error creating project', 'error'); return }
    showToast('Project created!')
    closeModal('add-project-backdrop')
    await refreshApp()
  })

  // Project cards → slide panel
  document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      const pid = card.dataset.projectId
      const project = projects.find(p => p.id === pid)
      if (project) openProjectPanel(project, tasks, parts, vehicle, user, refreshApp)
    })
  })

  // Task rows (recent) → task modal
  document.querySelectorAll('#recent-tasks-list .task-row').forEach(row => {
    row.addEventListener('click', () => {
      const tid = row.dataset.taskId
      const task = tasks.find(t => t.id === tid)
      if (task) openTaskModal(task, projects, refreshApp)
    })
  })

  // Vehicle settings
  bindModalClose('vehicle-settings-backdrop')
  document.getElementById('btn-vehicle-settings')?.addEventListener('click', async () => {
    await loadMembersList(vehicle)
    openModal('vehicle-settings-backdrop')
  })

  document.getElementById('vs-save')?.addEventListener('click', () => saveVehicleSettings(vehicle, refreshApp))
  document.getElementById('vs-share-btn')?.addEventListener('click', () => shareVehicle(vehicle))
  document.getElementById('vs-delete')?.addEventListener('click', () => deleteVehicle(vehicle, refreshApp))
}

// ─────────────────────────────────────────────────────────────
//  PROJECT PANEL
// ─────────────────────────────────────────────────────────────
async function openProjectPanel(project, allTasks, allParts, vehicle, user, refreshApp) {
  const backdrop = document.getElementById('project-panel-backdrop')
  if (!backdrop) return
  backdrop.classList.remove('hidden')

  document.getElementById('panel-project-title').textContent = project.title
  document.getElementById('panel-close').onclick = () => backdrop.classList.add('hidden')
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden') })

  const panelBody = document.getElementById('panel-body')

  const projectTasks = allTasks.filter(t => t.project_id === project.id)
  const projectParts = allParts.filter(p => p.project_id === project.id)

  panelBody.innerHTML = `
    <!-- META -->
    <div class="project-meta-grid">
      <div class="meta-cell">
        <div class="meta-cell-label">Status</div>
        <div class="meta-cell-value"><span class="badge ${statusBadgeClass(project.status)}">${project.status}</span></div>
      </div>
      <div class="meta-cell">
        <div class="meta-cell-label">Priority</div>
        <div class="meta-cell-value"><span class="badge ${priorityBadgeClass(project.priority)}">${project.priority}</span></div>
      </div>
      <div class="meta-cell">
        <div class="meta-cell-label">Type</div>
        <div class="meta-cell-value"><span class="badge ${typeBadgeClass(project.maintenance_type)}">${project.maintenance_type || '—'}</span></div>
      </div>
      <div class="meta-cell">
        <div class="meta-cell-label">Budget</div>
        <div class="meta-cell-value">$${Number(project.actual_cost||0).toFixed(0)} / $${Number(project.estimated_cost||0).toFixed(0)}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-cell-label">Target Start</div>
        <div class="meta-cell-value">${project.target_start_date ? new Date(project.target_start_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-cell-label">Target Complete</div>
        <div class="meta-cell-value">${project.target_completion_date ? new Date(project.target_completion_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</div>
      </div>
    </div>

    <hr class="section-hr" />

    <!-- TASKS -->
    <div class="section-header">
      <span class="section-title">Tasks</span>
    </div>
    <div class="task-list" id="panel-tasks" style="margin-bottom:12px">
      ${projectTasks.length > 0
        ? projectTasks.map(t => renderTaskRow(t)).join('')
        : '<div class="empty-state">No tasks yet.</div>'
      }
    </div>
    <button class="btn-inline" id="panel-add-task"><i class="ti ti-plus"></i> Add Task</button>

    <hr class="section-hr" />

    <!-- PARTS -->
    <div class="section-header" style="margin-top:4px">
      <span class="section-title">Parts List</span>
    </div>
    <div id="parts-table-wrap">
      ${renderPartsTable(projectParts)}
    </div>
    <button class="btn-inline" id="panel-add-part"><i class="ti ti-plus"></i> Add Part</button>

    <hr class="section-hr" />

    <!-- DIAGNOSIS NOTES -->
    <div class="form-group">
      <label class="form-label">Diagnosis / Research Notes</label>
      <textarea id="panel-diagnosis" style="min-height:100px">${project.diagnosis_notes || ''}</textarea>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px">
      <button class="btn-gold" id="panel-save-notes" style="width:auto;padding:8px 16px">Save Notes</button>
    </div>
  `

  // Bind panel events
  document.querySelectorAll('#panel-tasks .task-row').forEach(row => {
    row.addEventListener('click', () => {
      const tid = row.dataset.taskId
      const task = allTasks.find(t => t.id === tid)
      if (task) openTaskModal(task, [], refreshApp)
    })
  })

  document.getElementById('panel-add-task')?.addEventListener('click', () => {
    openLogRepairFromPanel(project, vehicle, user, refreshApp)
  })

  document.getElementById('panel-add-part')?.addEventListener('click', () => {
    openAddPartModal(project.id, refreshApp)
  })

  document.getElementById('panel-save-notes')?.addEventListener('click', async () => {
    const notes = document.getElementById('panel-diagnosis').value
    const { error } = await supabase.from('garage_hq_repair_projects').update({ diagnosis_notes: notes }).eq('id', project.id)
    if (error) showToast('Error saving notes', 'error')
    else showToast('Notes saved!')
  })

  // Part status change
  document.querySelectorAll('.part-status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      await supabase.from('parts_list').update({ status: sel.value }).eq('id', sel.dataset.partId)
      showToast('Part status updated!')
    })
  })
}

function renderPartsTable(parts) {
  if (!parts || parts.length === 0) {
    return '<div class="empty-state" style="padding:16px 0">No parts added yet.</div>'
  }
  const partBadgeClass = (s) => {
    const m = { 'Researching':'badge-part-researching', 'Ordered':'badge-part-ordered', 'Received':'badge-part-received', 'Installed':'badge-part-installed' }
    return m[s] || 'badge-part-researching'
  }
  return `
    <table class="parts-table">
      <thead>
        <tr>
          <th>Part</th>
          <th>Part #</th>
          <th>Supplier</th>
          <th>Cost</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${parts.map(p => `
          <tr>
            <td>
              ${p.url ? `<a href="${p.url}" target="_blank">${p.part_name}</a>` : p.part_name}
            </td>
            <td>${p.part_number || '—'}</td>
            <td>${p.supplier || '—'}</td>
            <td>$${(Number(p.unit_cost||0) * Number(p.quantity||1)).toFixed(0)} <span style="color:var(--text-muted);font-size:11px">(×${p.quantity||1})</span></td>
            <td>
              <select class="part-status-select" data-part-id="${p.id}">
                ${PART_STATUSES.map(s => `<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

// ─────────────────────────────────────────────────────────────
//  TASK MODAL
// ─────────────────────────────────────────────────────────────
function openTaskModal(task, projects, refreshApp) {
  bindModalClose('task-modal-backdrop')
  document.getElementById('task-modal-title').textContent = task.title
  document.getElementById('task-modal-body').innerHTML = `
    <div class="form-row">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Status</label>
        <select id="tm-status">
          ${TASK_STATUSES.map(s => `<option value="${s}" ${task.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Category</label>
        <select id="tm-category">
          <option value="">— None —</option>
          ${CATEGORIES.map(c => `<option value="${c}" ${task.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Date Performed</label>
        <input type="date" id="tm-date" value="${task.date_performed||''}" />
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Mileage at Service</label>
        <input type="number" id="tm-mileage" value="${task.mileage_at_service||''}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Parts Cost ($)</label>
        <input type="number" id="tm-cost-parts" value="${task.cost_parts||''}" step="0.01" />
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Labor Cost ($)</label>
        <input type="number" id="tm-cost-labor" value="${task.cost_labor||''}" step="0.01" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea id="tm-notes">${task.notes||''}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Next Due Date</label>
        <input type="date" id="tm-next-date" value="${task.next_due_date||''}" />
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Next Due Mileage</label>
        <input type="number" id="tm-next-mileage" value="${task.next_due_mileage||''}" />
      </div>
    </div>
  `
  openModal('task-modal-backdrop')

  document.getElementById('task-modal-save').onclick = async () => {
    const { error } = await supabase.from('garage_hq_repair_tasks').update({
      status: document.getElementById('tm-status').value,
      category: document.getElementById('tm-category').value || null,
      date_performed: document.getElementById('tm-date').value || null,
      mileage_at_service: parseInt(document.getElementById('tm-mileage').value) || null,
      cost_parts: parseFloat(document.getElementById('tm-cost-parts').value) || 0,
      cost_labor: parseFloat(document.getElementById('tm-cost-labor').value) || 0,
      notes: document.getElementById('tm-notes').value || null,
      next_due_date: document.getElementById('tm-next-date').value || null,
      next_due_mileage: parseInt(document.getElementById('tm-next-mileage').value) || null,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id)

    if (error) showToast('Error updating task', 'error')
    else {
      showToast('Task updated!')
      closeModal('task-modal-backdrop')
      await refreshApp()
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  ADD PART MODAL
// ─────────────────────────────────────────────────────────────
function openAddPartModal(projectId, refreshApp) {
  bindModalClose('add-part-backdrop')
  openModal('add-part-backdrop')

  document.getElementById('pt-save').onclick = async () => {
    const name = document.getElementById('pt-name').value.trim()
    if (!name) { showToast('Part name is required', 'error'); return }

    const { error } = await supabase.from('garage_hq_parts_list').insert({
      project_id: projectId,
      part_name: name,
      part_number: document.getElementById('pt-number').value || null,
      supplier: document.getElementById('pt-supplier').value || null,
      status: document.getElementById('pt-status').value,
      unit_cost: parseFloat(document.getElementById('pt-cost').value) || 0,
      quantity: parseInt(document.getElementById('pt-qty').value) || 1,
      url: document.getElementById('pt-url').value || null,
      notes: document.getElementById('pt-notes').value || null,
    })

    if (error) showToast('Error adding part', 'error')
    else {
      showToast('Part added!')
      closeModal('add-part-backdrop')
      await refreshApp()
    }
  }
}

// Opens log repair but pre-linked to project
function openLogRepairFromPanel(project, vehicle, user, refreshApp) {
  openModal('log-repair-backdrop')
  const sel = document.getElementById('lr-project')
  if (sel) sel.value = project.id
}

// ─────────────────────────────────────────────────────────────
//  VEHICLE SETTINGS
// ─────────────────────────────────────────────────────────────
async function loadMembersList(vehicle) {
  const { data } = await supabase
    .from('garage_hq_vehicle_members')
    .select('user_id, role')
    .eq('vehicle_id', vehicle.id)

  const container = document.getElementById('members-list')
  if (!container) return

  if (!data || data.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:6px 0">No shared members yet.</div>'
    return
  }

  container.innerHTML = data.map(m => `
    <div class="member-row">
      <span class="member-email">${m.user_id}</span>
      <span class="member-role">${m.role}</span>
    </div>
  `).join('')
}

async function shareVehicle(vehicle) {
  const email = document.getElementById('vs-share-email').value.trim()
  if (!email) { showToast('Enter an email address', 'error'); return }

  // Look up user by email via auth — we use a workaround: insert with user lookup
  // Since we can't look up auth.users directly, we need the user to have logged in.
  // For now we store the email and the RLS will match on auth.uid()
  const { data: userData } = await supabase.rpc('get_user_id_by_email', { email_input: email }).maybeSingle()

  if (!userData) {
    showToast('User not found. They must sign up first.', 'error')
    return
  }

  const { error } = await supabase.from('garage_hq_vehicle_members').upsert({
    vehicle_id: vehicle.id,
    user_id: userData,
    role: 'editor',
  })

  if (error) showToast('Error sharing vehicle', 'error')
  else {
    showToast(`Shared with ${email}!`)
    document.getElementById('vs-share-email').value = ''
    await loadMembersList(vehicle)
  }
}

async function saveVehicleSettings(vehicle, refreshApp) {
  const nickname = document.getElementById('vs-nickname').value.trim()
  if (!nickname) { showToast('Nickname is required', 'error'); return }

  const { error } = await supabase.from('garage_hq_vehicles').update({
    nickname,
    current_mileage: parseInt(document.getElementById('vs-mileage').value) || 0,
    year: parseInt(document.getElementById('vs-year').value) || null,
    make: document.getElementById('vs-make').value || null,
    model: document.getElementById('vs-model').value || null,
    trim: document.getElementById('vs-trim').value || null,
    vin: document.getElementById('vs-vin').value || null,
    photo_url: document.getElementById('vs-photo').value || null,
  }).eq('id', vehicle.id)

  if (error) showToast('Error saving settings', 'error')
  else {
    showToast('Vehicle updated!')
    closeModal('vehicle-settings-backdrop')
    await refreshApp()
  }
}

async function deleteVehicle(vehicle, refreshApp) {
  if (!confirm(`Delete "${vehicle.nickname}"? This cannot be undone.`)) return
  const { error } = await supabase.from('garage_hq_vehicles').delete().eq('id', vehicle.id)
  if (error) showToast('Error deleting vehicle', 'error')
  else {
    showToast('Vehicle deleted')
    closeModal('vehicle-settings-backdrop')
    await refreshApp(null)
  }
}
