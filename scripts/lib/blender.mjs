/** Locate Blender for the art scripts: `$BLENDER`, then `blender` on PATH, then the macOS app. */
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

const MAC_APP = '/Applications/Blender.app/Contents/MacOS/Blender';

function isExe(p) {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Path to the Blender binary; calls `fail(msg)` (which should exit) when there is none. */
export function findBlender(fail) {
  if (process.env.BLENDER) {
    if (isExe(process.env.BLENDER)) return process.env.BLENDER;
    fail(`BLENDER=${process.env.BLENDER} is not an executable`);
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && isExe(join(dir, 'blender'))) return join(dir, 'blender');
  }
  if (isExe(MAC_APP)) return MAC_APP;
  fail('Blender not found. Install Blender 4.2+ and put `blender` on PATH, or set BLENDER=/path/to/blender.');
}
