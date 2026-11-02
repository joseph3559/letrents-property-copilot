// Synthetic demo portfolio (Nairobi, Kenya). All names, phones, and records
// are fictional and generated for the public hackathon demo.

import {
  MaintenanceRequest,
  Property,
  StaffMember,
  Tenant,
  Unit,
} from './types';

export const DEMO_ORG_ID = 'org-sunrise-demo';

export const demoProperties: Property[] = [
  {
    id: 'prop-sunrise',
    orgId: DEMO_ORG_ID,
    name: 'Sunrise Apartments',
    address: 'Ngong Road, Kilimani',
    city: 'Nairobi',
    unitCount: 5,
    landlord: 'Margaret Wambui',
  },
  {
    id: 'prop-acacia',
    orgId: DEMO_ORG_ID,
    name: 'Acacia Heights',
    address: 'Mbagathi Way',
    city: 'Nairobi',
    unitCount: 4,
    landlord: 'Daniel Kiprop',
  },
];

export const demoUnits: Unit[] = [
  { id: 'unit-a101', orgId: DEMO_ORG_ID, propertyId: 'prop-sunrise', unitNumber: 'A101', floor: '1', bedrooms: 2, status: 'occupied' },
  { id: 'unit-a102', orgId: DEMO_ORG_ID, propertyId: 'prop-sunrise', unitNumber: 'A102', floor: '1', bedrooms: 1, status: 'occupied' },
  { id: 'unit-b201', orgId: DEMO_ORG_ID, propertyId: 'prop-sunrise', unitNumber: 'B201', floor: '2', bedrooms: 3, status: 'occupied' },
  { id: 'unit-b202', orgId: DEMO_ORG_ID, propertyId: 'prop-sunrise', unitNumber: 'B202', floor: '2', bedrooms: 2, status: 'vacant' },
  { id: 'unit-c301', orgId: DEMO_ORG_ID, propertyId: 'prop-sunrise', unitNumber: 'C301', floor: '3', bedrooms: 3, status: 'occupied' },
  { id: 'unit-k1', orgId: DEMO_ORG_ID, propertyId: 'prop-acacia', unitNumber: 'K1', floor: 'Ground', bedrooms: 2, status: 'occupied' },
  { id: 'unit-k2', orgId: DEMO_ORG_ID, propertyId: 'prop-acacia', unitNumber: 'K2', floor: 'Ground', bedrooms: 2, status: 'occupied' },
  { id: 'unit-k3', orgId: DEMO_ORG_ID, propertyId: 'prop-acacia', unitNumber: 'K3', floor: '1', bedrooms: 1, status: 'vacant' },
  { id: 'unit-k4', orgId: DEMO_ORG_ID, propertyId: 'prop-acacia', unitNumber: 'K4', floor: '1', bedrooms: 3, status: 'occupied' },
];

export const demoTenants: Tenant[] = [
  { id: 'ten-1', orgId: DEMO_ORG_ID, propertyId: 'prop-sunrise', unitId: 'unit-a101', fullName: 'Brian Otieno', phone: '+254700000101' },
  { id: 'ten-2', orgId: DEMO_ORG_ID, propertyId: 'prop-sunrise', unitId: 'unit-a102', fullName: 'Wanjiku Kamau', phone: '+254700000102' },
  { id: 'ten-3', orgId: DEMO_ORG_ID, propertyId: 'prop-sunrise', unitId: 'unit-b201', fullName: 'David Mwangi', phone: '+254700000103' },
  { id: 'ten-4', orgId: DEMO_ORG_ID, propertyId: 'prop-sunrise', unitId: 'unit-c301', fullName: 'Amina Said', phone: '+254700000104' },
  { id: 'ten-5', orgId: DEMO_ORG_ID, propertyId: 'prop-acacia', unitId: 'unit-k1', fullName: 'Peter Njoroge', phone: '+254700000105' },
  { id: 'ten-6', orgId: DEMO_ORG_ID, propertyId: 'prop-acacia', unitId: 'unit-k2', fullName: 'Grace Achieng', phone: '+254700000106' },
  { id: 'ten-7', orgId: DEMO_ORG_ID, propertyId: 'prop-acacia', unitId: 'unit-k4', fullName: 'Samuel Kiprop', phone: '+254700000107' },
];

export const demoStaff: StaffMember[] = [
  {
    id: 'staff-caretaker', orgId: DEMO_ORG_ID, fullName: 'John Barasa', role: 'Caretaker',
    phone: '+254711000201', propertyIds: ['prop-sunrise', 'prop-acacia'],
    skills: ['general', 'cleaning', 'security', 'other'], available: true,
  },
  {
    id: 'staff-plumber', orgId: DEMO_ORG_ID, fullName: 'Peter Omondi', role: 'Plumber',
    phone: '+254711000202', propertyIds: ['prop-sunrise', 'prop-acacia'],
    skills: ['plumbing', 'water_supply'], available: true,
  },
  {
    id: 'staff-electrician', orgId: DEMO_ORG_ID, fullName: 'James Kariuki',
    role: 'Electrician', phone: '+254711000203', propertyIds: ['prop-sunrise'],
    skills: ['electrical', 'hvac'], available: true,
  },
  {
    id: 'staff-security', orgId: DEMO_ORG_ID, fullName: 'Daniel Mutua', role: 'Security Officer',
    phone: '+254711000204', propertyIds: ['prop-sunrise', 'prop-acacia'],
    skills: ['security'], available: false,
  },
  {
    id: 'staff-manager', orgId: DEMO_ORG_ID, fullName: 'Faith Njeri', role: 'Property Manager',
    phone: '+254711000205', propertyIds: ['prop-sunrise', 'prop-acacia'],
    skills: ['general', 'structural', 'other'], available: true,
  },
  {
    id: 'staff-hvac', orgId: DEMO_ORG_ID, fullName: 'Kevin Oduor', role: 'HVAC Technician',
    phone: '+254711000206', propertyIds: ['prop-acacia'],
    skills: ['hvac', 'electrical', 'water_supply'], available: true,
  },
];

function seedRequest(partial: Partial<MaintenanceRequest> & Pick<MaintenanceRequest, 'id'>): MaintenanceRequest {
  const now = new Date().toISOString();
  return {
    orgId: DEMO_ORG_ID,
    reference: `MNT-${partial.id.slice(-4).toUpperCase()}`,
    propertyId: 'prop-sunrise',
    unitId: null,
    title: 'Seeded request',
    description: 'Seeded maintenance request.',
    category: 'general',
    urgency: 'normal',
    status: 'pending',
    requestedBy: 'user-demo-manager',
    assignedTo: null,
    safetyRisk: null,
    duplicateOfId: null,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export const demoMaintenanceSeed: MaintenanceRequest[] = [
  seedRequest({
    id: 'mnt-seed-1', reference: 'MNT-1001', unitId: 'unit-a101',
    title: 'Leaking kitchen pipe', description: 'Kitchen sink pipe dripping steadily; bucket placed under sink.',
    category: 'plumbing', urgency: 'high', status: 'in_progress',
    assignedTo: 'staff-plumber',
  }),
  seedRequest({
    id: 'mnt-seed-2', reference: 'MNT-1002', unitId: null,
    title: 'Broken main entrance lock', description: 'Main entrance lock jammed; residents cannot secure the building at night.',
    category: 'security', urgency: 'high', status: 'pending',
  }),
  seedRequest({
    id: 'mnt-seed-3', reference: 'MNT-1003', unitId: null,
    title: 'Corridor lights not working', description: 'Second-floor corridor lights flickering and going off.',
    category: 'electrical', urgency: 'normal', status: 'pending',
  }),
  seedRequest({
    id: 'mnt-seed-4', reference: 'MNT-1004', propertyId: 'prop-acacia', unitId: 'unit-k1',
    title: 'Low water pressure', description: 'Tenant reports very low water pressure in bathroom taps since yesterday.',
    category: 'water_supply', urgency: 'normal', status: 'resolved',
    assignedTo: 'staff-plumber',
  }),
  seedRequest({
    id: 'mnt-seed-5', reference: 'MNT-1005', unitId: 'unit-c301',
    title: 'Roof leak above bedroom', description: 'Water stains on bedroom ceiling after heavy rain; active dripping during storms.',
    category: 'structural', urgency: 'high', status: 'pending',
  }),
  seedRequest({
    id: 'mnt-seed-6', reference: 'MNT-1006', propertyId: 'prop-acacia', unitId: null,
    title: 'Water pump malfunction', description: 'Borehole pump trips the breaker shortly after starting.',
    category: 'water_supply', urgency: 'high', status: 'in_progress',
    assignedTo: 'staff-hvac',
  }),
];
