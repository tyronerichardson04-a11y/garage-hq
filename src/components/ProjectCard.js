export function statusBadgeClass(status) {
  const map = {
    'Planning':    'badge-status-planning',
    'In Progress': 'badge-status-inprogress',
    'Complete':    'badge-status-complete',
    'On Hold':     'badge-status-onhold',
  }
  return map[status] || 'badge-status-planning'
}

export function typeBadgeClass(type) {
  const map = {
    'Preventative':  'badge-type-preventative',
    'Corrective':    'badge-type-corrective',
    'Major Overhaul':'badge-type-overhaul',
  }
  return map[type] || 'badge-type-preventative'
}

export function priorityBadgeClass(priority) {
  const map = {
    'Low':      'badge-priority-low',
    'Medium':   'badge-priority-medium',
    'High':     'badge-priority-high',
    'Critical': 'badge-priority-critical',
  }
  return map[priority] || 'badge-priority-medium'
}

export function renderProjectCard(project, tasks, parts) {
  const projectTasks = tasks.filter(t => t.project_id === project.id)
  const done = projectTasks.filter(t => t.status === 'Done').length
  const total = projectTasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const partsCount = parts.filter(p => p.project_id === project.id).length
  const actual = Number(project.actual_cost || 0)
  const estimated = Number(project.estimated_cost || 0)

  return `
    <div class="project-card" data-project-id="${project.id}">
      <div class="project-card-header">
        <div class="project-card-title">${project.title}</div>
      </div>
      <div class="project-badges">
        <span class="badge ${statusBadgeClass(project.status)}">${project.status}</span>
        <span class="badge ${typeBadgeClass(project.maintenance_type)}">${project.maintenance_type || ''}</span>
        <span class="badge ${priorityBadgeClass(project.priority)}">${project.priority}</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="project-card-meta">
        <div class="project-budget">
          <span class="budget-actual">$${actual.toFixed(0)}</span>
          <span class="budget-of">of</span>
          <span class="budget-estimated">$${estimated.toFixed(0)}</span>
        </div>
        <div style="display:flex;gap:10px;color:var(--text-muted);font-size:11px">
          <span><i class="ti ti-list-check" style="font-size:12px;vertical-align:-1px"></i> ${done}/${total}</span>
          ${partsCount > 0 ? `<span><i class="ti ti-package" style="font-size:12px;vertical-align:-1px"></i> ${partsCount}</span>` : ''}
        </div>
      </div>
    </div>
  `
}
