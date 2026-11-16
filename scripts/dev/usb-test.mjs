/** Bind an authorized USB test phone to the local Crisis server; never installs or erases data. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const adb = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
if (!existsSync(adb)) throw Error('Android platform-tools not found. Set ADB_PATH.');
const list = spawnSync(adb, ['devices'], { encoding: 'utf8' });
if (list.status !== 0) throw Error('Unable to reach Android debugging tools.');
const entries = list.stdout.split('\n').slice(1).filter(l => l.trim()).map(l => l.trim().split(/\s+/));
const authorized = entries.filter(e => e[1] === 'device');
if (!authorized.length) {
  console.log(entries.some(e => e[1] === 'unauthorized') ? 'Unlock the phone and accept “Allow USB debugging”, then run this again.' : 'No test phone is connected yet. Connect the USB data cable and enable USB debugging.');
  process.exitCode = 2;
} else if (authorized.length > 1) {
  console.log('More than one device is connected. Disconnect the extra devices before linking the test phone.'); process.exitCode = 2;
} else {
  const reverse = spawnSync(adb, ['-s', authorized[0][0], 'reverse', 'tcp:3139', 'tcp:3139'], { encoding: 'utf8' });
  if (reverse.status !== 0) throw Error(reverse.stderr || 'Unable to link the phone.');
  console.log('USB connection ready. The Crisis test APK can reach http://127.0.0.1:3139 while this cable is connected.');
}
