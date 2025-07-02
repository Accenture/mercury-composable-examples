import { TemplateLoader, Utility, Logger } from 'mercury-composable';
import { fileURLToPath } from 'url';
import fs from 'fs';

const log = Logger.getInstance();
const util = new Utility();

const IMPORT_TAG = '${import-statements}';
const SERVICE_TAG = '${service-list}';

class LineMetadata {
    sb = '';
    section = 'import';
}

function handleServiceEntry(md, line) {
    if (line.includes(SERVICE_TAG)) {
        const idx = line.indexOf(SERVICE_TAG);
        const spaces = line.substring(0, idx);
        md.sb += `${spaces}// *** This is a placeholder for successful build ***\n`;
        md.sb += `${spaces}log.info(\`Placeholder for \${platform.getName()} with \${config.getId()}\`);\n`;
        md.section = 'remaining';
        return true;
    } else {
        md.sb += `${line}\n`;
        return false;
    }
}

function handleImportEntry(md, line) {
    if (line.includes(IMPORT_TAG)) {         
        md.sb += '// *** Nothing to import because this is a placeholder ***\n';
        md.section = 'service';
        return true;
    } else {
        md.sb += `${line}\n`;
        return false;
    }
}

function formatOutput(content) {
    const lines = util.split(content, '\r\n');
    let result = '';
    for (const line of lines) {
        if (line.trim() == '//') {
            result += '\n';
        } else {
            result += `${line.trimEnd()}\n`;
        }             
    } 
    return result.trim() + '\n';    
}

async function generatePlaceholder(src, lines) {
    const md = new LineMetadata();
    for (const line of lines) {
        if (md.section == 'import') {
            if (handleImportEntry(md, line)) continue;
        }
        if (md.section == 'service') {
            if (handleServiceEntry(md, line)) continue;
        }
        if (md.section == 'remaining') {
            md.sb += `${line}\n`;
        }
    }
    const targetDir = src + '/preload';
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir);
    }
    const targetFile = src + '/preload/preload.ts';
    fs.writeFileSync(targetFile, formatOutput(md.sb));
    const relativePath = targetFile.substring(src.length);
    log.info(`Composable placeholder (${relativePath}) generated`);
}

function getCurrentFolder() {
    const folder = fileURLToPath(new URL(".", import.meta.url));
    // for windows OS, convert backslash to regular slash and drop drive letter from path
    const path = folder.includes('\\')? folder.replaceAll('\\', '/') : folder;
    const colon = path.indexOf(':');
    return colon == 1? path.substring(colon+1) : path;
}

async function main() {
    const loader = new TemplateLoader();
    const template = loader.getTemplate('preload.template');
    if (template && template.includes(IMPORT_TAG) && template.includes(SERVICE_TAG)) {
        const lines = template.split('\n');
        const root = getCurrentFolder();
        const src = root + 'src';
        await generatePlaceholder(src, lines);
    } else {
        throw new Error(`Invalid preload.template - missing ${IMPORT_TAG} and ${SERVICE_TAG} tags`);
    }
}

main();
