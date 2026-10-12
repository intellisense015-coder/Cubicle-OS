// TITLE: MODULE B DEMO DATA
export const leadRows = [
  { name: "Ayesha Khan", phone: "+92 300 1234567", email: "ayesha@example.com", company: "Northstar Studio", team: "6 people", source: "Website", stage: "Visit scheduled", nextFollowUp: "Today, 3:00 PM" },
  { name: "Omar Farooq", phone: "+92 301 7654321", email: "omar@example.com", company: "Solo workspace", team: "1 person", source: "Referral", stage: "New lead", nextFollowUp: "Tomorrow" },
  { name: "Maha Ali", phone: "+92 333 1122334", email: "maha@example.com", company: "Contour Labs", team: "12 people", source: "Instagram", stage: "Follow-up due", nextFollowUp: "Oct 04, 2026" },
  { name: "Hamza Shah", phone: "+92 322 9988776", email: "hamza@example.com", company: "Freelance", team: "2 people", source: "Website", stage: "Follow-up due", nextFollowUp: "Today" }
];

export const memberRows = [
  { member: "Sana Ahmed", company: "Northstar Studio", space: "Desk 12", rent: "PKR 48,000", status: "Active", joined: "Jan 12, 2026" },
  { member: "Bilal Raza", company: "Contour Labs", space: "Office 03", rent: "PKR 115,000", status: "Payment due", joined: "Feb 04, 2026" },
  { member: "Hira Mahmood", company: "Independent", space: "Desk 08", rent: "PKR 42,000", status: "Active", joined: "Mar 18, 2026" },
  { member: "Usman Tariq", company: "Northstar Studio", space: "Desk 14", rent: "PKR 48,000", status: "Move-out soon", joined: "Nov 20, 2025" }
];

// TITLE: FLOOR PLAN SEAT POSITIONS
const deskPositions = [
  ["21%", "22%"], ["33%", "22%"], ["45%", "22%"], ["57%", "22%"], ["69%", "22%"], ["81%", "22%"],
  ["21%", "39%"], ["33%", "39%"], ["45%", "39%"], ["57%", "39%"], ["69%", "39%"], ["81%", "39%"]
];

// TITLE: FLOOR PLAN DEMO DATA
export const floorSpaces = [
  ...deskPositions.map(([left, top], index) => ({
    id: `desk-${String(index + 1).padStart(2, "0")}`,
    label: `Desk ${String(index + 1).padStart(2, "0")}`,
    type: "Desk",
    zone: "Main Workstation Hall",
    occupant: ["Sana Ahmed", "Bilal Raza", "Hira Mahmood", "Usman Tariq", "Available", "Maha Ali", "Ayesha Khan", "Omar Farooq", "Available", "Hamza Shah", "Nida Karim", "Available"][index],
    company: ["Northstar Studio", "Contour Labs", "Independent", "Northstar Studio", "Unassigned", "Contour Labs", "Northstar Studio", "Solo workspace", "Unassigned", "Freelance", "Pixel House", "Unassigned"][index],
    monthlyRent: ["PKR 48,000", "PKR 115,000", "PKR 42,000", "PKR 48,000", "PKR 0", "PKR 48,000", "PKR 48,000", "PKR 42,000", "PKR 0", "PKR 42,000", "PKR 48,000", "PKR 0"][index],
    paymentStatus: ["Paid", "Payment due", "Paid", "Paid", "Not assigned", "Paid", "Paid", "Paid", "Not assigned", "Payment due", "Paid", "Not assigned"][index],
    status: ["occupied", "due", "occupied", "occupied", "available", "occupied", "occupied", "occupied", "available", "due", "due", "available"][index],
    position: { left, top }
  })),
  { id: "boss-cabin", label: "Boss Cabin", type: "Private office", zone: "Boss Cabin", occupant: "The Cubicle Owner", company: "The Cubicle", monthlyRent: "Internal", paymentStatus: "Internal", status: "occupied", position: { left: "73%", top: "12%" } },
  { id: "accounts", label: "Accounts", type: "Private office", zone: "Accounts", occupant: "Hina Shah", company: "The Cubicle", monthlyRent: "Internal", paymentStatus: "Internal", status: "occupied", position: { left: "73%", top: "31%" } },
  { id: "staff-room", label: "Staff Room", type: "Shared room", zone: "Staff Room", occupant: "Operations Team", company: "The Cubicle", monthlyRent: "Internal", paymentStatus: "Internal", status: "occupied", position: { left: "73%", top: "50%" } },
  { id: "centre-head", label: "Centre Head", type: "Private office", zone: "Centre Head", occupant: "Areeba Malik", company: "The Cubicle", monthlyRent: "Internal", paymentStatus: "Internal", status: "occupied", position: { left: "73%", top: "68%" } },
  { id: "counsellor-room", label: "Counsellor Room", type: "Meeting room", zone: "Counsellor Room", occupant: "Available", company: "Unassigned", monthlyRent: "PKR 0", paymentStatus: "Not assigned", status: "available", position: { left: "73%", top: "86%" } }
];

// TITLE: EMPTY WORKSPACE LAYOUT
export const emptyFloorSpaces = floorSpaces.map((space) => ({
  ...space,
  occupant: "Available",
  company: "Unassigned",
  monthlyRent: "PKR 0",
  paymentStatus: "Not assigned",
  status: "available"
}));
