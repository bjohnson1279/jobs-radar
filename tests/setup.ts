import { fileURLToPath } from 'node:url';

// Tests use synthetic fixtures, independent of personal config/environment.
process.env.JOBS_RADAR_CONFIG = fileURLToPath(new URL('./fixtures/settings.json', import.meta.url));
