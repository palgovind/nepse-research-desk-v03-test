const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function ema(values,period){');
const end = source.indexOf('function macd(values)', start);
if (start < 0 || end < 0) throw new Error('Could not locate technical indicator functions in app.js');
const context = { isoToday: () => '2026-11-19' };
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nthis.indicators={ema,emaSeries,rsiSeries,atrSeries,signalState,aggregateBars,timeframeAnalysis};', context);
const { emaSeries, rsiSeries, atrSeries, signalState, aggregateBars, timeframeAnalysis } = context.indicators;

test('Wilder RSI returns 50 for flat prices, 100 for rising and 0 for falling prices', () => {
  assert.equal(rsiSeries(Array(40).fill(100), 14).at(-1), 50);
  assert.equal(rsiSeries(Array.from({length:40}, (_,i)=>100+i), 14).at(-1), 100);
  assert.equal(rsiSeries(Array.from({length:40}, (_,i)=>140-i), 14).at(-1), 0);
});

test('EMA(9) of RSI has a nine-valid-observation warm-up', () => {
  const rs = rsiSeries(Array.from({length:40}, (_,i)=>100+i), 14);
  const first = rs.findIndex(v => v !== null);
  const ema = emaSeries(rs.slice(first), 9);
  assert.equal(ema.findIndex(v => v !== null), 8);
});

test('ATR(14) uses true range and Wilder smoothing', () => {
  const bars = Array.from({length:40}, (_,i)=>({high:102+i, low:99+i, close:101+i}));
  assert.equal(atrSeries(bars, 14).at(-1), 3);
});

test('crossover detection distinguishes a new cross from a persistent state', () => {
  assert.equal(signalState([40,52],[45,48]).cross, 'Bullish crossover');
  assert.equal(signalState([52,54],[48,50]).cross, 'No new crossover');
  assert.equal(signalState([55,45],[50,50]).cross, 'Bearish crossover');
  assert.equal(signalState([40,52],[45,48]).combined, 'Bullish confirmation');
});

test('weekly aggregation groups daily rows and monthly analysis reports insufficient history', () => {
  const rows = Array.from({length:180}, (_,i)=>{
    const d = new Date(Date.UTC(2026,0,1+i));
    const date = d.toISOString().slice(0,10);
    return {date, open:100+i, high:102+i, low:99+i, close:101+i, volume:1000};
  });
  const weekly = aggregateBars(rows, 'weekly');
  assert.ok(weekly.length > 20 && weekly.length < rows.length);
  const monthly = timeframeAnalysis(rows, 'monthly');
  assert.equal(monthly.state.rsi, null);
  assert.equal(monthly.state.above50, null);
});
