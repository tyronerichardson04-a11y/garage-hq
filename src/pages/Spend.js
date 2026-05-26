import { supabase } from '../lib/supabase.js'

function fmtCurrency(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function ytdStart() {
  return new Date(new Date().getFullYear(), 0, 1)
}

export async function renderSpend(container, allVehicles, tasksByVehicle) {
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading…</div>`

  const ytd = ytdStart()
  let totalParts = 0
  let totalLabor = 0

  // Per vehicle spend data
  const vehicleData = allVehicles.map(vehicle => {
    const tasks = tasksByVehicle[vehicle.id] || []
    const ytdTasks = tasks.filter(t => t.date_performed && new Date(t.date_performed) >= ytd)

    const parts = ytdTasks.reduce((s, t) => s + Number(t.cost_parts || 0), 0)
    const labor = ytdTasks.reduce((s, t) => s + Number(t.cost_labor || 0), 0)
    totalParts += parts
    totalLabor += labor

    // By category
    const catMap = {}
    for (const t of ytdTasks) {
      const cat = t.category || 'Other'
      catMap[cat] = (catMap[cat] || 0) + Number(t.cost_parts || 0) + Number(t.cost_labor || 0)
    }
    const categories = Object.entries(catMap).sort((a, b) => b[1] - a[1])

    // Last 5 done tasks
    const recentDone = tasks
      .filter(t => t.status === 'Done' && t.date_performed)
      .sort((a, b) => new Date(b.date_performed) - new Date(a.date_performed))
      .slice(0, 5)

    return { vehicle, parts, labor, ytd: parts + labor, categories, recentDone }
  })

  const maxCatSpend = Math.max(...vehicleData.flatMap(d => d.categories.map(c => c[1])), 1)

  container.innerHTML = `
    <div class="page-header">
      <h1>Spend</h1>
    </div>

    <div class="spend-total-banner">
      <div class="spend-banner-item">
        <div class="banner-label">Total YTD Spend</div>
        <div class="banner-value gold">${fmtCurrency(totalParts + totalLabor)}</div>
      </div>
      <div class="spend-banner-item">
        <div class="banner-label">Parts</div>
        <div class="banner-value">${fmtCurrency(totalParts)}</div>
      </div>
      <div class="spend-banner-item">
        <div class="banner-label">Labor</div>
        <div class="banner-value">${fmtCurrency(totalLabor)}</div>
      </div>
      <div class="spend-banner-item">
        <div class="banner-label">Vehicles Tracked</div>
        <div class="banner-value">${allVehicles.length}</div>
      </div>
    </div>

    ${vehicleData.map((d, i) => `
      <div class="accordion-vehicle">
        <div class="accordion-header ${i === 0 ? 'open' : ''}" data-idx="${i}">
          <div class="accordion-vehicle-name">${d.vehicle.nickname}</div>
          <div class="accordion-ytd">${fmtCurrency(d.ytd)}</div>
          <i class="ti ti-chevron-down accordion-toggle"></i>
        </div>
        <div class="accordion-body ${i === 0 ? 'open' : ''}">
          <div class="spend-split">
            <div class="spend-split-item">
              <div class="spend-split-label">Parts</div>
              <div class="spend-split-value parts">${fmtCurrency(d.parts)}</div>
            </div>
            <div class="spend-split-item">
              <div class="spend-split-label">Labor</div>
              <div class="spend-split-value labor">${fmtCurrency(d.labor)}</div>
            </div>
          </div>

          ${d.categories.length > 0 ? `
            <div class="recent-tasks-label">Spend by Category (YTD)</div>
            <div class="category-bars">
              ${d.categories.map(([cat, amt]) => `
                <div class="cat-bar-row">
                  <div class="cat-bar-label">${cat}</div>
                  <div class="cat-bar-track">
                    <div class="cat-bar-fill" style="width:${Math.round((amt / maxCatSpend) * 100)}%"></div>
                  </div>
                  <div class="cat-bar-amount">${fmtCurrency(amt)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${d.recentDone.length > 0 ? `
            <div class="recent-tasks-label">Last ${d.recentDone.length} Completed Tasks</div>
            <div class="task-list">
              ${d.recentDone.map(t => {
                const cost = Number(t.cost_parts || 0) + Number(t.cost_labor || 0)
                const date = t.date_performed ? new Date(t.date_performed+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'
                return `
                  <div class="task-row" style="cursor:default">
                    <span class="task-status-dot done"></span>
                    <span class="task-name">${t.title}</span>
                    <span class="task-category-chip" style="color:var(--text-muted)">${date}</span>
                    <span class="task-cost">${cost > 0 ? fmtCurrency(cost) : '—'}</span>
                  </div>
                `
              }).join('')}
            </div>
          ` : '<div class="empty-state">No completed tasks logged this year.</div>'}
        </div>
      </div>
    `).join('')}
  `

  // Accordion toggle
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling
      const isOpen = body.classList.contains('open')
      body.classList.toggle('open', !isOpen)
      header.classList.toggle('open', !isOpen)
    })
  })
}
