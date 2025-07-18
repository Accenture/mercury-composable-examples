import fs from 'fs';
import { fileURLToPath } from "url";

function getCurrentFolder() {
    const folder = fileURLToPath(new URL(".", import.meta.url));
    // for windows OS, convert backslash to regular slash and drop drive letter from path
    const filePath = folder.includes('\\')? folder.replaceAll('\\', '/') : folder;
    const colon = filePath.indexOf(':');
    return colon === 1? filePath.substring(colon+1) : filePath;
}

function getFolder(target) {
    return getCurrentFolder() + target;
}

function removeDirectory(folder) {
    if (fs.existsSync(folder)) {
        fs.readdirSync(folder).forEach(f => {
            const path = `${folder}/${f}`
            const stats = fs.statSync(path);
            if (stats.isDirectory()) {
                removeDirectory(path);
            } else {
                fs.rmSync(path);
            }
        })
        fs.rmdirSync(folder);
    }
}

const coverage = getFolder('coverage');
const dist = getFolder('dist');
const tmp = getFolder('tmp');

removeDirectory(coverage);
removeDirectory(dist);
removeDirectory(tmp);
