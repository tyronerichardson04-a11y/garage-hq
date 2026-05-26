export function taskStatusDotClass(status) {
  if (status === 'Done') return 'done'
  if (status === 'In Progress') return 'inprogress'
  return 'pending'
}

export function renderTaskRow(task) {
  const cost = (Number(task.cost_parts || 0) + Number(task.cost_labor || 0))
  const costStr = cost > 0 ? `$${cost.toFixed(0)}` : '—'
  return `
    <div class="task-row" data-task-id="${task.id}">
      <span class="task-status-dot ${taskStatusDotClass(task.status)}"></span>
      <span class="task-name">${task.title}</span>
      ${task.category ? `<span class="task-category-chip">${task.category}</span>` : ''}
      <span class="task-cost">${costStr}</span>
      <i class="ti ti-chevron-right task-chevron"></i>
    </div>
  `
}
