export const INITIAL_PROPERTIES = [
  { id: 1, address: "Ul. Marszałkowska 12/4", city: "Warszawa", size: "45m²", rent: 3200, status: "Wynajęte", ownerId: 1, tenantId: 101, nextPayment: "2025-06-10" },
  { id: 2, address: "Ul. Długa 8/12", city: "Kraków", size: "38m²", rent: 2800, status: "Wynajęte", ownerId: 1, tenantId: 102, nextPayment: "2025-06-12" },
  { id: 3, address: "Ul. Piotrkowska 89", city: "Łódź", size: "52m²", rent: 2400, status: "Wolne", ownerId: 2, tenantId: null, nextPayment: null },
];

export const INITIAL_TENANTS = [
  { id: 101, name: "Jan Kowalski", phone: "+48 500 123 456", email: "jan.k@email.com", propertyId: 1,ownerId:1, },
  { id: 102, name: "Anna Nowak", phone: "+48 600 987 654", email: "anna.n@email.com", propertyId: 2,ownerId:1, },
   {
    id: 103,
    name: "Piotr Zieliński",
    phone: "+48 700 222 111",
    email: "piotr@email.com",
    propertyId: null,
    ownerId: 2,
  },
];

export const INITIAL_PAYMENTS = [
  { id: 1, propertyId:  1, tenantId: 101, amount: 3200, date: "2025-05-10", status: "Opłacone", type: "Czynsz" },
  { id: 2, propertyId: 3, tenantId: 102, amount: 2800, date: "2025-05-12", status: "Opłacone", type: "Czynsz" },
  { id: 3, propertyId: 1, tenantId: 101, amount: 3200, date: "2025-06-10", status: "Oczekujące", type: "Czynsz" },
  { id: 4, propertyId: 2, tenantId: 103, amount: 2800, date: "2025-06-01", status: "Zaległe", type: "Czynsz" },
];

export const INITIAL_OWNERS = [
  {
    id: 1,
    name: "Marek Kowalski",
    email: "marek@example.com",
  },
  {
    id: 2,
    name: "Anna Zielińska",
    email: "anna@example.com",
  },
];


export const TENANT_PAYMENTS = [
  {
    id: 1,
    tenantId: 101,
    propertyId: 1,
    amount: 3200,
    dueDate: "2025-06-10",
    status: "Opłacone",
  },
  {
    id: 2,
    tenantId: 102,
    propertyId: 2,
    amount: 2800,
    dueDate: "2025-06-01",
    status: "Zaległe",
  },
];

export const FINANCE_SUMMARY = {
  incomeThisMonth: 6000,
  overdue: 2800,
  expenses: 1200,
  netProfit: 4800,
};

export const EXPENSES = [
  {
    id: 1,
    propertyId: 1,
    category: "Naprawa",
    description: "Hydraulik – kuchnia",
    amount: 450,
    date: "2025-05-18",
  },
  {
    id: 2,
    propertyId: 2,
    category: "Media",
    description: "Prąd – maj",
    amount: 320,
    date: "2025-05-10",
  },
  {
    id: 3,
    propertyId: 3,
    category: "Administracja",
    description: "Czynsz administracyjny",
    amount: 430,
    date: "2025-05-05",
  },
];


