import { supabase } from '../lib/supabase.js'
import { getDueUrgency } from '../components/DueRow.js'
import { CATEGORIES } from '../data.js'

export async function renderSchedule(container, allVehicles, tasksByVehicle) {
  // Build filter bar
  const vehicleFilter = `
    <select id="sched-vehicle-filter">
      <option value="">All Vehicles</option>
      ${allVehicles.map(v => `<option value="${v.id}">${v.nickname}</option>`).join('')}
    </select>
  `
  const categoryFilter = `
    <select id="sched-cat-filter">
      <option value="">All Categories</option>
      ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
    </select>
  `

  container.innerHTML = `
    <div class="page-header">
      <h1>Schedule</h1>
    </div>
    <div class="schedule-filters">
      ${vehicleFilter}
      ${categoryFilter}
    </div>
    <div id="schedule-body"></div>
  `

  function renderBody() {
    const vf = document.getElementById('sched-vehicle-filter').value
    const cf = document.getElementById('sched-cat-filter').value

    // Collect all tasks with next_due_*
    const rows = []
    for (const vehicle of allVehicles) {
      if (vf && vehicle.id !== vf) continue
      const tasks = (tasksByVehicle[vehicle.id] || []).filter(t => t.next_due_date || t.next_due_mileage)
      for (const task of tasks) {
        if (cf && task.category !== cf) continue
        const { urgency, dueDateStr, dueMiStr } = getDueUrgency(task, vehicle.current_mileage)
        rows.push({ task, vehicle, urgency, dueDateStr, dueMiStr })
      }
    }

    const overdue   = rows.filter(r => r.urgency === 'overdue')
    const soon      = rows.filter(r => r.urgency === 'soon')
    const upcoming  = rows.filter(r => r.urgency === 'upcoming')

    const body = document.getElementById('schedule-body')
    if (!body) return

    if (rows.length === 0) {
      body.innerHTML = `<div class="empty-state" style="padding:48px 0">No scheduled maintenance found. Log repairs with a "Next Due" date or mileage to see them here.</div>`
      return
    }

    const buildGroup = (items, label, colorClass) => {
      if (items.length === 0) return ''
      return `
        <div class="urgency-group">
          <div class="urgency-header">
            <span class="urgency-label ${colorClass}">${label}</span>
            <span class="urgency-count">${items.length}</span>
          </div>
          ${items.map(r => {
            const whenParts = [r.dueDateStr, r.dueMiStr].filter(Boolean).join(' · ')
            return `
              <div class="schedule-row">
                <div class="schedule-row-main">
                  <div class="schedule-row-title">${r.task.title}</div>
                  <div class="schedule-row-sub">${r.vehicle.nickname}${r.task.category ? ' · ' + r.task.category : ''}</div>
                </div>
                <div class="schedule-row-when ${colorClass}">${whenParts || '—'}</div>
              </div>
            `
          }).join('')}
        </div>
      `
    }

    body.innerHTML = [
      buildGroup(overdue,  'Overdue',                              'red'),
      buildGroup(soon,     'Due within 500 mi or 30 days',        'amber'),
      buildGroup(upcoming, 'Upcoming within 1,500 mi or 90 days', 'neutral'),
    ].join('')
  }

  renderBody()
  document.getElementById('sched-vehicle-filter').addEventListener('change', renderBody)
  document.getElementById('sched-cat-filter').addEventListener('change', renderBody)
}
