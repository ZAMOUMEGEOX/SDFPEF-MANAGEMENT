import * as turf from '@turf/turf';

const f1 = turf.polygon([[[125, -15], [113, -22], [154, -27], [144, -15], [125, -15]]]);
const f2 = turf.polygon([[[130, -10], [120, -25], [160, -30], [150, -10], [130, -10]]]);
const f3 = turf.polygon([[[135, -5], [125, -20], [165, -25], [155, -5], [135, -5]]]);

try {
  const i = turf.intersect(turf.featureCollection([f1, f2, f3]));
  console.log('intersect fc success', i);
} catch(e) {
  console.log('intersect fc fail:', e.message);
}
