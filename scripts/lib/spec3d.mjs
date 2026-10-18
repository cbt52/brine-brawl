/**
 * Validation for 3D fighter specs (`scripts/blender/specs/<id>.json`, TASKS-LOOP §2.11).
 * Pure: returns a list of problems, empty when the spec is fine.
 */
export const PAL_KEYS = ['body', 'detail', 'trim', 'prop'];
export const PRIM_TYPES = ['sphere', 'capsule', 'cone', 'box', 'cylinder'];
export const ANIM_STYLES = ['biped', 'blob', 'hover'];

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
    const prims = Array.isArray(p?.prims) ? p.prims : [];
    if (!prims.length) errs.push(`${at}.prims must be a non-empty array`);
    prims.forEach((q, j) => {
      const pat = `${at}.prims[${j}]`;
      if (!PRIM_TYPES.includes(q?.type)) errs.push(`${pat}.type must be one of ${PRIM_TYPES.join('|')}`);
      if (!isVec3(q?.at)) errs.push(`${pat}.at must be [x, y, z]`);
      if (!isVec3(q?.size) || q.size.some((s) => s <= 0)) errs.push(`${pat}.size must be 3 positive numbers`);
      if (q?.rot !== undefined && !isVec3(q.rot)) errs.push(`${pat}.rot must be [x, y, z] degrees`);
    });
    if (typeof p?.name === 'string') seen.add(p.name);
  });

  if (!Array.isArray(spec.features)) errs.push('features must be an array');
  if (spec.face !== null && typeof spec.face !== 'object') errs.push('face must be an object or null');
  if (!ANIM_STYLES.includes(spec.anim?.style)) errs.push(`anim.style must be one of ${ANIM_STYLES.join('|')}`);
  return errs;
}
