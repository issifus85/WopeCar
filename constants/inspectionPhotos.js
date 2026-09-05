// Canonical 15-photo / 4-category vehicle inspection photo set, shared by
// both photo-capture screens (app/inspection/photos.js and
// app/vendor/inspection/photos.js) and the in-app report viewer
// (app/inspection/report.js), so the category/label/hint data can't drift
// between the three. The PDF Edge Function (supabase/functions/
// generate-inspection-report) can't import this (separate Deno runtime/
// deploy) and keeps its own matching copy - same duplication precedent as
// that function's own SECTIONS checklist copy.
//
// `vehicle_inspection_photos.angle` is a Postgres CHECK constraint (see
// migration 0072_widen_vehicle_inspection_photo_angles) that also allows
// the pre-expansion legacy keys ('back', 'left', 'right' - 'front' and
// 'odometer' are unchanged) so existing submitted inspections never break;
// LEGACY_PHOTO_LABELS exists only so the report viewer can still label
// those old, orphaned rows.
export const PHOTO_CATEGORIES = [
  {
    key: 'exterior',
    title: 'Exterior',
    angles: [
      { key: 'front', label: 'Front', hint: 'bumper & headlights' },
      { key: 'rear', label: 'Rear', hint: 'bumper & tail lights' },
      { key: 'driver_side', label: 'Driver Side', hint: 'full side view' },
      { key: 'passenger_side', label: 'Passenger Side', hint: 'full side view' },
      { key: 'windshield_front', label: 'Front Windshield' },
      { key: 'windshield_rear', label: 'Rear Windshield' },
    ],
  },
  {
    key: 'doors',
    title: 'Doors & Panels',
    angles: [
      { key: 'door_driver_front', label: 'Driver Front Door', hint: 'close-up of door panel' },
      { key: 'door_driver_rear', label: 'Driver Rear Door', hint: 'close-up of door panel' },
      { key: 'door_passenger_front', label: 'Passenger Front Door', hint: 'close-up of door panel' },
      { key: 'door_passenger_rear', label: 'Passenger Rear Door', hint: 'close-up of door panel' },
    ],
  },
  {
    key: 'under_hood_boot',
    title: 'Under Hood & Boot',
    angles: [
      { key: 'engine_bay', label: 'Engine Bay', hint: 'open bonnet' },
      { key: 'boot', label: 'Boot / Trunk', hint: 'spare tyre & safety kit' },
    ],
  },
  {
    key: 'interior',
    title: 'Interior',
    angles: [
      { key: 'interior_front', label: 'Front Interior' },
      { key: 'interior_rear', label: 'Rear Interior' },
      { key: 'odometer', label: 'Odometer', hint: 'current mileage' },
    ],
  },
];

// Flattened, in category order - what every "is this inspection complete"
// check and capture-grid iteration actually uses.
export const PHOTO_ANGLES = PHOTO_CATEGORIES.flatMap((category) =>
  category.angles.map((angle) => ({ ...angle, category: category.key }))
);

export const TOTAL_PHOTO_COUNT = PHOTO_ANGLES.length;

// Orphaned pre-expansion keys - never offered on a fresh capture, kept only
// so the report viewer can still show a label for an old submitted row.
export const LEGACY_PHOTO_LABELS = {
  back: 'Back',
  left: 'Left Side',
  right: 'Right Side',
};

// Label lookup covering both current and legacy angle keys.
export const PHOTO_LABELS = Object.fromEntries([
  ...PHOTO_ANGLES.map((a) => [a.key, a.label]),
  ...Object.entries(LEGACY_PHOTO_LABELS),
]);
