// Pure trade helpers shared by the search and result views.
const TradeModel = (() => {
    function isSimpleTrade(trade) {
        // Empty exported Lua tables can be encoded as {} instead of [].
        // Only one-input, one-output trades can participate in this search.
        return trade.mode !== 'sink' && trade.mode !== 'generator' &&
            Array.isArray(trade.inputs) && trade.inputs.length === 1 &&
            Array.isArray(trade.outputs) && trade.outputs.length === 1;
    }

    function getItemNames(trades) {
        const items = new Set();
        for (const trade of trades) {
            for (const item of trade.inputs) items.add(item.name);
            for (const item of trade.outputs) items.add(item.name);
        }
        return Array.from(items);
    }

    return { isSimpleTrade, getItemNames };
})();
