export function getDueUrgency(task, vehicleMileage) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30 = new Date(today); in30.setDate(today.getDate() + 30)
  const in90 = new Date(today); in90.setDate(today.getDate() + 90)

  let urgency = 'upcoming'
  let dueDateStr = ''
  let dueMiStr = ''

  if (task.next_due_date) {
    const due = new Date(task.next_due_date)
    if (due < today) urgency = 'overdue'
    else if (due <= in30 && urgency !== 'overdue') urgency = 'soon'
    else if (due <= in90 && urgency === 'upcoming') urgency = 'upcoming'

    const diff = Math.round((due - today) / 86400000)
    if (diff < 0)  dueDateStr = `${Math.abs(diff)}d overdue`
    else if (diff === 0) dueDateStr = 'Today'
    else dueDateStr = `in ${diff}d`
  }

  if (task.next_due_mileage && vehicleMileage) {
    const gap = task.next_due_mileage - vehicleMileage
    if (gap <= 0 && urgency !== 'overdue') urgency = 'overdue'
    else if (gap <= 500 && urgency === 'upcoming') urgency = 'soon'
    dueMiStr = gap <= 0 ? `${Math.abs(gap).toLocaleString()} mi overdue` : `in ${gap.toLocaleString()} mi`
  }

  return { urgency, dueDateStr, dueMiStr }
}

export function renderDueRow(task, vehicleNickname, vehicleMileage) {
  const { urgency, dueDateStr, dueMiStr } = getDueUrgency(task, vehicleMileage)

  const colorMap = { overdue: 'red', soon: 'amber', upcoming: 'blue' }
  const iconMap = {
    overdue: 'ti-alert-triangle',
    soon:    'ti-clock-exclamation',
    upcoming:'ti-clock',
  }
  const color = colorMap[urgency]
  const icon = iconMap[urgency]

  const whenParts = [dueDateStr, dueMiStr].filter(Boolean).join(' · ')

  return `
    <div class="due-row">
      <i class="ti ${icon} due-icon ${color}"></i>
      <div class="due-info">
        <div class="due-title">${task.title}</div>
        <div class="due-sub">${vehicleNickname}${task.category ? ' · ' + task.category : ''}</div>
      </div>
      <div class="due-when ${color}">${whenParts || '—'}</div>
    </div>
  `
}
