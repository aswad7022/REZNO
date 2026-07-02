export const mapProviderConfig = {
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  defaultCenter: {
    latitude: 33.3152,
    longitude: 44.3661,
  },
  defaultZoom: 12,
  maxZoom: 19,
} as const;
