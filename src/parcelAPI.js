const { Parcel } = require('@parcel/core');
const Path = require('path');

async function runParcel(mode = 'dev', logLevel = null) {
    const parcelMode = mode.toLowerCase();
    if (!['dev', 'live', 'build'].includes(parcelMode)) {
        throw new Error(`Unknown Parcel mode: ${mode}`);
    }
    const development = parcelMode === 'dev';
    const bundler = new Parcel({
        entries: Path.join(__dirname, 'html/*.html'),
        defaultConfig: require.resolve('@parcel/config-default'),
        mode: development ? 'development' : 'production',
        shouldAutoInstall: false,
        shouldDisableCache: !development,
        logLevel: logLevel === 0 ? 'none' : 'info',
        targets: {
            renderer: {
                context: 'electron-renderer',
                engines: { electron: '43' },
                distDir: Path.resolve(__dirname, development ? '../cache' : '../build'),
                publicUrl: './',
                includeNodeModules: true,
                sourceMap: development,
                optimize: false,
                scopeHoist: false,
            },
        },
        serveOptions: development ? { port: 3000, host: '127.0.0.1' } : false,
        hmrOptions: development ? { port: 3001, host: '127.0.0.1' } : false,
    });
    if (parcelMode === 'build') return bundler.run();
    return bundler.watch((error, event) => {
        if (error) console.error(error);
        if (event?.type === 'buildFailure') console.error(event.diagnostics);
    });
}

module.exports = runParcel;
