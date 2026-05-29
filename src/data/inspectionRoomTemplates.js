export const DEFAULT_INSPECTION_ROOM_TEMPLATES = [
  {
    roomName: "Entrance / hallway",
    items: ["Walls", "Floor", "Ceiling", "Front door", "Lighting", "Smoke alarm"],
  },
  {
    roomName: "Kitchen",
    items: ["Walls", "Floor", "Worktop", "Sink", "Oven", "Hob", "Fridge/freezer", "Cabinets", "Extractor fan"],
  },
  {
    roomName: "Living room",
    items: ["Walls", "Floor/carpet", "Ceiling", "Windows", "Doors", "Heating/radiator", "Lighting"],
  },
  {
    roomName: "Bedroom",
    items: ["Walls", "Floor/carpet", "Ceiling", "Windows", "Doors", "Wardrobe/storage", "Heating/radiator", "Lighting"],
  },
  {
    roomName: "Bathroom",
    items: ["Walls", "Floor", "Toilet", "Sink", "Bath/shower", "Tiles/grout", "Extractor fan", "Lighting"],
  },
  {
    roomName: "Garden / exterior",
    items: ["Garden", "Fence/gate", "Bins", "Exterior walls", "External doors", "Driveway/path"],
  },
  {
    roomName: "Meters",
    items: ["Gas meter", "Electric meter", "Water meter", "Meter readings"],
  },
  {
    roomName: "Keys",
    items: ["Front door keys", "Back door keys", "Communal keys", "Window keys", "Fobs/remotes"],
  },
  {
    roomName: "Appliances",
    items: ["Boiler", "Washing machine", "Dishwasher", "Fridge/freezer", "Cooker/oven", "Extractor"],
  },
];

export function getDefaultInspectionRoomNames() {
  return DEFAULT_INSPECTION_ROOM_TEMPLATES.map((template) => template.roomName);
}

export function getDefaultEvidenceItemsForRoom(roomName) {
  const template = DEFAULT_INSPECTION_ROOM_TEMPLATES.find((room) => room.roomName === roomName);
  return template?.items || [];
}

export function buildDefaultEvidenceItemsPayload(roomNames = getDefaultInspectionRoomNames()) {
  const wanted = new Set(roomNames);
  return DEFAULT_INSPECTION_ROOM_TEMPLATES
    .filter((template) => wanted.has(template.roomName))
    .map((template) => ({
      room_name: template.roomName,
      items: template.items,
    }));
}
