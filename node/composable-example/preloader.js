import { TemplateLoader, Logger, Utility, AppConfig, MultiLevelMap, TypeScriptClassScanner, JavaScriptClassScanner } from 'mercury-composable';
import { fileURLToPath } from 'url';
import fs from 'fs';

const log = Logger.getInstance();
const util = new Utility();
const clsMap = {};
const clsParameters = {};

const IMPORT_TAG = '${import-statements}';
const SERVICE_TAG = '${service-list}';

class LineMetadata {
    sb = '';
    section = 'import';
}

function scanClassSignature(clsList, map, packageName) {
    const items = util.split(clsList, ', ');
    let csv = '';
    for (const cls of items) {
        // validate the signature for method and parameters
        if ('initialize' == map.getElement(`methods.${cls}`) && map.exists(`parameters.${cls}`)) {
            const params = map.getElement(`parameters.${cls}`);
            if (Array.isArray(params)) {
                clsParameters[cls] = params;
                csv += csv.length == 0? cls : `,${cls}`;
                log.info(`Class ${cls}`);
            }
        }
    }
    if (csv) {
        clsMap[csv] = packageName;
    }    
}

async function scanPackage(packageName) {
    const parent = getCurrentFolder();
    const target = `node_modules/${packageName}/dist`;
    const relativePath = `./node_modules/${packageName}/dist`;
    log.info(`Scanning ${relativePath}`);
    const scanner = new JavaScriptClassScanner(parent, target, 'preload');
    try {
        const result = await scanner.scan();
        const map = new MultiLevelMap(result);
        if (map.exists('classes')) {
            const allClasses = map.getElement('classes');
            for (const clsList of Object.keys(allClasses)) {
                scanClassSignature(clsList, map, packageName);
            }            
        }    
    } catch(e) {
        const message = String(e);
        if (message.includes('no such file')) {
            log.error(`Unable to scan package - ${packageName} does not exist`);
        } else {
            log.error(`Unable to scan ${packageName} - ${message}`);
        }        
    }
}

function buildRegistrationStatement(c, cls, spaces) {
    const parameters = clsParameters[c];
    let input = null;
    for (const p of parameters) {
        if (input) {
            input += `, ${p}`;
        } else {
            input = `${p}, new ${cls}()`;
        }
    }
    return `${spaces}platform.register(${input});\n`;    
}

function handleServiceEntry(md, line, names) {
    if (typeof line == 'string' && line.includes(SERVICE_TAG)) {
        const idx = line.indexOf(SERVICE_TAG);
        const spaces = line.substring(0, idx);
        if (Array.isArray(names)) {
            for (const cls of names) {
                const composite = util.split(cls, ', ');
                for (const c of composite) {      
                    md.sb += buildRegistrationStatement(c, cls, spaces);                        
                }                    
            }
        }
        md.section = 'remaining';
        return true;
    } else {
        md.sb += `${line}\n`;
        return false;
    }
}

function handleImportEntry(md, line, names) {
    if (typeof line == 'string' && line.includes(IMPORT_TAG)) {
        if (Array.isArray(names)) {
            for (const cls of names) {
                const filePath = clsMap[cls];
                md.sb += `import { ${cls} } from '${filePath}';\n`;
            }
        }
        md.section = 'service';
        return true;
    } else {
        md.sb += `${line}\n`;
        return false;
    }
}

async function generatePreLoader(src, lines) {
    const names = Object.keys(clsMap);
    const md = new LineMetadata();    
    for (const line of lines) {
        if (md.section == 'import') {
            if (handleImportEntry(md, line, names)) continue;
        }
        if (md.section == 'service') {
            if (handleServiceEntry(md, line, names)) continue;
        }
        if (md.section == 'remaining') {
            md.sb += `${line}\n`;
        }
    }
    md.sb = mergeImportStatements(md.sb);
    const targetDir = src + '/preload';
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir);
    }
    const targetFile = src + '/preload/preload.ts';
    await fs.promises.writeFile(targetFile, md.sb);
    const relativePath = targetFile.substring(src.length);
    log.info(`Composable class loader (${relativePath}) generated`);
}

function findMultipleImport(packageName, lines) {
    const result = [];
    let n = 0;
    for (const line of lines) {
        const text = line.trim();
        if (text.startsWith("import {") && text.endsWith(`'${packageName}';`)) {
            result.push(n);
        }
        n++;
    }
    return result;
}

function mergeImportStatements(content) {
    let lines = util.split(content, '\r\n');
    const config = AppConfig.getInstance();
    const packages = config.getProperty('web.component.scan');
    const packageMap = {};
    if (packages) {
        const packageList = util.split(packages, ', ');
        for (const p of packageList) {
            const frequency = findMultipleImport(p, lines);
            if (frequency.length > 1) {
                packageMap[p] = frequency;
            }
        }
    }   
    for (const k of Object.keys(packageMap)) {
        const v = packageMap[k];
        lines = consolidateImportStatements(lines, k, v);
    }
    let result = '';
    for (const line of lines) {
        if (line != undefined) {
            if (line.trim() == '//') {
                result += '\n';
            } else {
                result += `${line.trimEnd()}\n`;
            }            
        }  
    } 
    return result.trim() + '\n';
}

function consolidateImportStatements(lines, packageName, indexes) {    
    const clsList = [];
    for (const i of indexes) {
        const line = lines[i];
        const start = line.indexOf('{');
        const end = line.indexOf('}');
        const items = util.split(line.substring(start+1, end), ', ');
        for (const item of items) {
            clsList.push(item);
        }
    }
    let sb = 'import { ';
    for (const cls of clsList) {
        sb += `${cls}, `;
    }
    const consolidated = `${sb.substring(0, sb.length-2)} } from '${packageName}';`;
    // consolidate multiple import statements from the same package into the first occurance
    lines[indexes[0]] = consolidated;
    // and delete the duplicated import statements from the same package
    for (let i=1; i < indexes.length; i++) {
        delete lines[indexes[i]];
    }
    return lines;
}

function getCurrentFolder() {
    const folder = fileURLToPath(new URL(".", import.meta.url));
    // for windows OS, convert backslash to regular slash and drop drive letter from path
    const path = folder.includes('\\')? folder.replaceAll('\\', '/') : folder;
    const colon = path.indexOf(':');
    return colon == 1? path.substring(colon+1) : path;
}

function findClass(parents, params, cls, csv) {
    if (Array.isArray(parents) && parents.includes('Composable')) {
        clsParameters[cls] = params;
        log.info(`Class ${cls}`);
        return csv.length == 0? cls : `,${cls}`;
    }
    return null;
}

function getClass(map, items) {
    let csv = '';
    for (const cls of items) {
        // validate the signature for method, parameters and parent class inheritance
        if ('initialize' == map.getElement(`methods.${cls}`) && map.exists(`parameters.${cls}`)) {
            const params = map.getElement(`parameters.${cls}`);
            if (Array.isArray(params)) {
                const parents = map.getElement(`parents.${cls}.implements`);
                const v = findClass(parents, params, cls, csv);
                if (v) {
                    csv += v;
                }
            }
        }
    } 
    return csv;  
}

async function main() {
    const root = getCurrentFolder();
    const src = root + 'src';
    const resources = src + '/resources';
    // initialize configuration manager to use 'src/resources/application.yml' config file
    const config = AppConfig.getInstance(resources);
    const packages = config.getProperty('web.component.scan');
    if (packages) {
        const packageList = util.split(packages, ', ');
        for (const p of packageList) {
            await scanPackage(p);
        }
    }
    log.info('Scanning ./src');
    const scanner = new TypeScriptClassScanner(src, 'preload');
    const result = await scanner.scan();
    const map = new MultiLevelMap(result);
    if (map.exists('classes')) {
        const allClasses = map.getElement('classes');
        for (const clsList of Object.keys(allClasses)) {
            // update path because the preload folder is one level deeper
            const path = allClasses[clsList];
            const items = util.split(clsList, ', ');
            const csv = getClass(map, items);
            if (csv) {
                clsMap[csv] = path;
            }
        }            
    }  
    const loader = new TemplateLoader();
    const template = loader.getTemplate('preload.template');
    if (template && template.includes(IMPORT_TAG) && template.includes(SERVICE_TAG)) {
        await generatePreLoader(src, util.split(template, '\r\n'));
    } else {
        throw new Error(`Invalid preload.template - missing ${IMPORT_TAG} and ${SERVICE_TAG} tags`);
    }
}

main();
