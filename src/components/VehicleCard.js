// VehicleCard — used for any future fleet-grid view
// Currently vehicles are listed in the sidebar; this can be extended.
export function renderVehicleCard(vehicle, tasks) {
  const ymm = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
  return `
    <div class="project-card" data-vehicle-id="${vehicle.id}" style="cursor:pointer">
      ${vehicle.photo_url ? `<img src="${vehicle.photo_url}" alt="${vehicle.nickname}" style="width:100%;height:120px;object-fit:cover;border-radius:4px;margin-bottom:10px">` : ''}
      <div class="project-card-title">${vehicle.nickname}</div>
      ${ymm ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${ymm}</div>` : ''}
      ${vehicle.current_mileage ? `<div style="font-size:12px;color:var(--blue);margin-top:4px"><i class="ti ti-gauge" style="font-size:12px"></i> ${Number(vehicle.current_mileage).toLocaleString()} mi</div>` : ''}
    </div>
  `
}
