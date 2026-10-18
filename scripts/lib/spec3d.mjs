/**
 * Validation for 3D fighter specs (`scripts/blender/specs/<id>.json`, TASKS-LOOP §2.11).
 * Pure: returns a list of problems, empty when the spec is fine.
 */
export const PAL_KEYS = ['body', 'detail', 'trim', 'prop'];
export const PRIM_TYPES = ['sphere', 'capsule', 'cone', 'box', 'cylinder', 'torus'];
export const ANIM_STYLES = ['biped', 'blob', 'hover'];
/** Puppet animations and their frame counts (`scripts/blender/lib/puppet.py` ANIMS). */
export const ANIMS = [['idle', 4], ['run', 6], ['attack', 3], ['hurt', 1]];
export const DIRS5 = ['S', 'SE', 'E', 'NE', 'N'];
export const DIRS8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
/** Amplitude keys a spec may override in `anim.amp`. */
export const ANIM_AMPS = ['bob', 'step', 'lift', 'swing', 'lean', 'breathe', 'earSway', 'earDrag', 'tailWag',
  'windup', 'strike', 'twist', 'lunge', 'squash', 'float', 'hop'];
export const ANIM_ROLES = ['body', 'head', 'armR', 'armL', 'footR', 'footL', 'earR', 'earL', 'tail'];

/** Every atlas frame name `<anim>_<dir>_<i>` for a spec, grouped per direction. */
export function frameNames(dirs = 5) {
  return (dirs === 8 ? DIRS8 : DIRS5).flatMap((d) => ANIMS.flatMap(([a, n]) => Array.from({ length: n }, (_, i) => `${a}_${d}_${i}`)));
}
/** Feature generators in `scripts/blender/lib/features.py` and the parts each one adds. */
export const FEATURE_FNS = { earsLong: ['ear_r', 'ear_r_tip', 'ear_l', 'ear_l_tip'], tailBattery: ['tail', 'tail_band', 'tail_cap'] };
/** Feature keys that hold a colour (pal key or #RRGGBB). */
export const FEATURE_COLOUR_KEYS = ['c', 'tip', 'band', 'cap'];

const HEX = /^#[0-9a-fA-F]{6}$/;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);

/** @returns {string[]} */
export function validateSpec(spec) {
  const errs = [];
  if (!spec || typeof spec !== 'object') return ['spec must be an object'];
  if (typeof spec.id !== 'string' || !/^[a-z0-9-]+$/.test(spec.id)) errs.push('id must be a lowercase slug');
  const pal = spec.pal ?? {};
  for (const k of PAL_KEYS) if (!HEX.test(pal[k] ?? '')) errs.push(`pal.${k} must be #RRGGBB`);
  if (spec.dirs !== 5 && spec.dirs !== 8) errs.push('dirs must be 5 or 8');
  if (!isNum(spec.scale) || spec.scale <= 0) errs.push('scale must be a positive number');

  const parts = Array.isArray(spec.parts) ? spec.parts : [];
  if (!parts.length) errs.push('parts must be a non-empty array');
  const seen = new Set();
  parts.forEach((p, i) => {
    const at = `parts[${i}]`;
    if (typeof p?.name !== 'string' || !p.name) errs.push(`${at}.name missing`);
    else if (seen.has(p.name)) errs.push(`${at}.name "${p.name}" is duplicated`);
    if (p?.parent != null && !seen.has(p.parent)) errs.push(`${at}.parent "${p.parent}" must name an earlier part`);
    if (p?.c !== undefined && !PAL_KEYS.includes(p.c) && !HEX.test(p.c)) errs.push(`${at}.c must be a pal key or #RRGGBB`);
    if (p?.remesh !== undefined && (!isNum(p.remesh) || p.remesh <= 0)) errs.push(`${at}.remesh must be a positive voxel size`);
    if (p?.pivot !== undefined && !isVec3(p.pivot)) errs.push(`${at}.pivot must be [x, y, z]`);
    if (p?.rot !== undefined && !isVec3(p.rot)) errs.push(`${at}.rot must be [x, y, z] degrees`);
    const prims = Array.isArray(p?.prims) ? p.prims : [];
    if (!prims.length) errs.push(`${at}.prims must be a non-empty array`);
    prims.forEach((q, j) => {
      const pat = `${at}.prims[${j}]`;
      if (!PRIM_TYPES.includes(q?.type)) errs.push(`${pat}.type must be one of ${PRIM_TYPES.join('|')}`);
      if (!isVec3(q?.at)) errs.push(`${pat}.at must be [x, y, z]`);
      if (!isVec3(q?.size) || q.size.some((s) => s <= 0)) errs.push(`${pat}.size must be 3 positive numbers`);
      if (q?.rot !== undefined && !isVec3(q.rot)) errs.push(`${pat}.rot must be [x, y, z] degrees`);
      if (q?.type === 'torus' && isVec3(q.size) && q.size[2] >= Math.min(q.size[0], q.size[1])) {
        errs.push(`${pat}.size z (tube) must be smaller than the ring`);
      }
      const w = q?.waves;
      if (w !== undefined && !(Array.isArray(w) && (w.length === 2 || w.length === 3) && Number.isInteger(w[0]) && w.slice(1).every(isNum))) {
        errs.push(`${pat}.waves must be [count, amp, radial?]`);
      }
    });
    if (typeof p?.name === 'string') seen.add(p.name);
  });

  if (!Array.isArray(spec.features)) errs.push('features must be an array');
  (Array.isArray(spec.features) ? spec.features : []).forEach((f, i) => {
    const at = `features[${i}]`;
    const adds = FEATURE_FNS[f?.fn];
    if (!adds) errs.push(`${at}.fn must be one of ${Object.keys(FEATURE_FNS).join('|')}`);
    if (!isVec3(f?.at)) errs.push(`${at}.at must be [x, y, z]`);
    if (f?.parent != null && !seen.has(f.parent)) errs.push(`${at}.parent "${f.parent}" must name a part`);
    for (const k of FEATURE_COLOUR_KEYS) {
      if (f?.[k] !== undefined && !PAL_KEYS.includes(f[k]) && !HEX.test(f[k])) errs.push(`${at}.${k} must be a pal key or #RRGGBB`);
    }
    for (const name of adds ?? []) {
      if (seen.has(name)) errs.push(`${at} adds part "${name}" which already exists`);
      seen.add(name);
    }
  });
  if (spec.face !== null && typeof spec.face !== 'object') errs.push('face must be an object or null');
  if (spec.face && typeof spec.face === 'object') {
    const f = spec.face;
    if (!parts.some((p) => p?.name === f.part)) errs.push('face.part must name a spec part');
    for (const k of ['eyeDx', 'eyeZ']) if (!isNum(f[k])) errs.push(`face.${k} must be a number`);
    if (f.nose !== undefined && !HEX.test(f.nose)) errs.push('face.nose must be #RRGGBB');
  }
  if (!ANIM_STYLES.includes(spec.anim?.style)) errs.push(`anim.style must be one of ${ANIM_STYLES.join('|')}`);
  for (const [k, v] of Object.entries(spec.anim?.amp ?? {})) {
    if (!ANIM_AMPS.includes(k)) errs.push(`anim.amp.${k} is not an amplitude (${ANIM_AMPS.join('|')})`);
    else if (!isNum(v)) errs.push(`anim.amp.${k} must be a number`);
  }
  for (const k of Object.keys(spec.anim?.roles ?? {})) {
    if (!ANIM_ROLES.includes(k)) errs.push(`anim.roles.${k} is not a role (${ANIM_ROLES.join('|')})`);
  }
  if (spec.anim?.attackArm !== undefined && !['r', 'l', 'both', 'none'].includes(spec.anim.attackArm)) {
    errs.push('anim.attackArm must be r|l|both|none');
  }
  return errs;
}

/** Every [key, #hex] the model paints with (parts and features; face decals excluded). */
export function specColours(spec) {
  const keys = new Set(spec.parts.map((p) => p.c ?? 'body'));
  for (const f of spec.features ?? []) for (const k of FEATURE_COLOUR_KEYS) if (f[k]) keys.add(f[k]);
  return [...keys].map((c) => [c, spec.pal[c] ?? c]);
}
