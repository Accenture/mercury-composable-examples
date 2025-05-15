import { ComposableLoader } from './preload/preload.js'; 

async function main() {
    // Load composable functions into memory and auto-start application modules
    await ComposableLoader.initialize();
}
// run the application
main();
