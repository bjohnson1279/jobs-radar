import { constants, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const local = fileURLToPath(new URL('../config/settings.local.json', import.meta.url));
if (existsSync(local)) {
    console.log('Local configuration already exists; no changes made.');
} else {
    copyFileSync(new URL('../config/settings.example.json', import.meta.url), local, constants.COPYFILE_EXCL);
    console.log('Created config/settings.local.json. Edit it to customize your search.');
}
