// Run with: node --test tests/trades.test.cjs
// Set TRADE_EXPORT_PATH to include a local encoded export in the regression run.
// Optionally set TRADE_MAX_TRADES=4 for the much larger default search.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { inflateSync } = require('node:zlib');

const root = resolve(__dirname, '..');
const model = readFileSync(resolve(root, 'trade-model.js'), 'utf8');
const app = readFileSync(resolve(root, 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

function createApp() {
    const elements = new Map();
    const pending = [];
    const context = vm.createContext({
        console,
        document: {
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, {
                    value: { planetSelect: 'nauvis', minTrades: '2', maxTrades: '4' }[id],
                    innerHTML: '', style: {}, addEventListener() {}, appendChild() {},
                    // Retain a representative batch instead of concatenating potentially
                    // millions of result cards into one string (unlike a browser DOM).
                    renderedBatches: 0,
                    insertAdjacentHTML(position, html) {
                        this.innerHTML = html;
                        this.renderedBatches++;
                    },
                });
                return elements.get(id);
            },
            createElement() { return {}; },
            querySelector() { return null; },
        },
        setTimeout(callback) { pending.push(callback); },
        atob: text => Buffer.from(text, 'base64').toString('binary'),
        pako: { inflate: bytes => inflateSync(bytes).toString('utf8') },
        FileReader: class {
            readAsText(file) { this.onload({ target: { result: file.text } }); }
        },
    });
    vm.runInContext(model, context);
    vm.runInContext(app, context);
    return {
        context, elements,
        run: source => vm.runInContext(source, context),
        flush() { while (pending.length) pending.shift()(); },
    };
}

function trade(input, output, position = 0, mode = 'normal') {
    return {
        inputs: input, outputs: output, mode, productivity: 0.1,
        rect_pos: { x: position, y: 0 }, axial_pos: { q: position, r: 0 },
    };
}
const item = name => [{ name, count: 1 }];

test('excludes empty/object sides and special trades before indexing, while preserving valid loops', () => {
    const app = createApp();
    const valid = [trade(item('iron'), item('copper')), trade(item('copper'), item('iron'), 1)];
    const excluded = [
        trade({}, {}), trade({}, item('iron')), trade(item('iron'), {}),
        trade([], item('iron')), trade(item('iron'), []),
        trade(null, item('iron')), trade(item('iron'), undefined),
        trade({ length: 1 }, item('iron')), trade(item('iron'), { length: 1 }),
        trade(item('iron'), item('copper'), 2, 'sink'),
        trade(item('iron'), item('copper'), 3, 'generator'),
        trade([...item('iron'), ...item('coal')], item('copper')),
    ];
    app.context.data = {
        trades: { nauvis: [...excluded, ...valid] }, item_values: { nauvis: { iron: 1, copper: 1 } },
    };
    app.run('gameData = data; calculateTradeLoops();');
    app.flush();
    assert.equal(app.run('allCycles.length'), 1);
    assert.equal(app.run('allCycles[0].trades.length'), 2);
    assert.ok(app.run('Number.isFinite(allCycles[0].yield)'));
    assert.equal(app.elements.get('calculateBtn').disabled, false);
    assert.match(app.elements.get('cyclesTableContainer').innerHTML, /iron/);
    assert.match(app.elements.get('cyclesTableContainer').innerHTML, /\[gps=1,0,nauvis\]/);
    app.run("changeSortBy('distance')");
    app.flush();
    assert.equal(app.run('allCycles.length'), 1);
});

test('an export with only empty trades completes without a crash', () => {
    const app = createApp();
    app.context.data = { trades: { nauvis: [trade({}, {})] }, item_values: { nauvis: {} } };
    app.run('gameData = data; calculateTradeLoops();');
    app.flush();
    assert.match(app.elements.get('results').innerHTML, /No trade loops found/);
    assert.equal(app.elements.get('calculateBtn').disabled, false);
});

test('item collection is shared without changing yield traversal order or sorted display', () => {
    const app = createApp();
    app.context.trades = [trade(item('iron'), item('copper')), trade(item('copper'), item('iron'))];
    assert.equal(app.run('TradeModel.getItemNames(trades).join(",")'), 'iron,copper');
    assert.equal(app.run('getItemsInvolved({ trades }).join(",")'), 'copper,iron');
});

test('attached export imports, searches, and renders results', { skip: !process.env.TRADE_EXPORT_PATH }, () => {
    const app = createApp();
    app.context.file = { name: 'all-trades-encoded-json.txt', text: readFileSync(process.env.TRADE_EXPORT_PATH, 'utf8') };
    app.run('handleFileSelect({ target: { files: [file] } });');
    assert.equal(app.elements.get('calculateBtn').disabled, false);
    assert.ok(app.run('gameData.trades.nauvis.some(trade => !Array.isArray(trade.inputs))'));
    app.elements.get('maxTrades').value = process.env.TRADE_MAX_TRADES || '2';
    app.run('calculateTradeLoops();');
    app.flush();
    assert.ok(app.run('allCycles.length > 0'));
    assert.ok(app.run('allCycles.every(cycle => cycle.trades.every(TradeModel.isSimpleTrade))'));
    assert.equal(app.elements.get('calculateBtn').disabled, false);
    assert.match(app.elements.get('cyclesTableContainer').innerHTML, /Copy GPS/);
    assert.ok(app.elements.get('cyclesTableContainer').renderedBatches > 0);
});
