export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container')
  if (!container) return

  const icon = type === 'success' ? 'ti-circle-check' : 'ti-circle-x'
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.innerHTML = `<i class="ti ${icon} ${type}"></i> ${message}`
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3200)
}

export function openModal(id) {
  const el = document.getElementById(id)
  if (el) el.classList.remove('hidden')
}

export function closeModal(id) {
  const el = document.getElementById(id)
  if (el) el.classList.add('hidden')
}

export function bindModalClose(id) {
  const backdrop = document.getElementById(id)
  if (!backdrop) return

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(id)
  })

  backdrop.querySelectorAll('.modal-close, .btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => closeModal(id))
  })
}
