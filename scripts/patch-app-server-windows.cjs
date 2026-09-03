const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'win32') process.exit(0);

const target = path.resolve('node_modules/@privos_ai/app-server/dist/relay/standalone-identity.js');
if (!fs.existsSync(target)) throw new Error(`Cannot patch missing SDK file: ${target}`);

const original = fs.readFileSync(target, 'utf8');
const oldCondition = "if (!stat.isFile() || stat.uid !== uid || stat.gid !== gid || (stat.mode & 0o777) !== 0o600) {";
const patchedCondition = "const posixMetadataInvalid = process.platform !== 'win32' && (stat.uid !== uid || stat.gid !== gid || (stat.mode & 0o777) !== 0o600);\n    if (!stat.isFile() || posixMetadataInvalid) {";

if (original.includes(patchedCondition)) process.exit(0);
if (!original.includes(oldCondition)) {
	throw new Error('The installed app-server identity guard has changed; refusing an unverified patch.');
}
fs.writeFileSync(target, original.replace(oldCondition, patchedCondition), 'utf8');
console.log('[postinstall] Applied NTFS identity-mode compatibility patch; Windows ACL is enforced by the app start script.');
