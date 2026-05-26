export const repairTemplates = [
  { name: 'Oil Change', category: 'Engine', maintenance_type: 'Preventative', mileage_interval: 5000, time_interval_days: 180, typical_labor_hours: 0.5, diy_friendly: true },
  { name: 'Tire Rotation', category: 'Tires', maintenance_type: 'Preventative', mileage_interval: 7500, time_interval_days: 180, typical_labor_hours: 0.5, diy_friendly: true },
  { name: 'Brake Inspection', category: 'Brakes', maintenance_type: 'Preventative', mileage_interval: 15000, time_interval_days: 365, typical_labor_hours: 1, diy_friendly: true },
  { name: 'Cabin Air Filter', category: 'HVAC', maintenance_type: 'Preventative', mileage_interval: 15000, time_interval_days: 365, typical_labor_hours: 0.25, diy_friendly: true },
  { name: 'Engine Air Filter', category: 'Engine', maintenance_type: 'Preventative', mileage_interval: 20000, time_interval_days: 730, typical_labor_hours: 0.25, diy_friendly: true },
  { name: 'Transmission Fluid', category: 'Drivetrain', maintenance_type: 'Preventative', mileage_interval: 30000, time_interval_days: null, typical_labor_hours: 1, diy_friendly: false },
  { name: 'Coolant Flush', category: 'Engine', maintenance_type: 'Preventative', mileage_interval: 30000, time_interval_days: 730, typical_labor_hours: 1, diy_friendly: false },
  { name: 'Spark Plugs', category: 'Engine', maintenance_type: 'Preventative', mileage_interval: 60000, time_interval_days: null, typical_labor_hours: 2, diy_friendly: true },
  { name: 'Brake Pad Replacement', category: 'Brakes', maintenance_type: 'Corrective', mileage_interval: null, time_interval_days: null, typical_labor_hours: 2, diy_friendly: true },
  { name: 'Battery Replacement', category: 'Electrical', maintenance_type: 'Corrective', mileage_interval: null, time_interval_days: null, typical_labor_hours: 0.5, diy_friendly: true },
]

export const CATEGORIES = ['Engine', 'Brakes', 'Tires', 'Electrical', 'HVAC', 'Drivetrain', 'Suspension', 'Body', 'Other']

export const MAINTENANCE_TYPES = ['Preventative', 'Corrective', 'Major Overhaul']

export const PROJECT_STATUSES = ['Planning', 'In Progress', 'Complete', 'On Hold']

export const TASK_STATUSES = ['Pending', 'In Progress', 'Done']

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

export const PART_STATUSES = ['Researching', 'Ordered', 'Received', 'Installed']
