// node tests.cjs — extracts the engine between /*ENGINE-START*/ and /*ENGINE-END*/ from index.html
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const code = src.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const m = { exports: {} };
new Function('module', code)(m);
const IBD = m.exports;
let n = 0, fail = 0;
const eq = (a, b, msg) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.log('FAIL', msg, '→ got', a, 'expected', b); } };
const ok = (c, msg) => eq(!!c, true, msg);

// Mayo
eq(IBD.mayo({ stool: 0, bleeding: 0, endo: 0, pga: 0 }).level, 'remission', 'mayo 0');
eq(IBD.mayo({ stool: 1, bleeding: 0, endo: 1, pga: 0 }).level, 'remission', 'mayo 2 no subscore >1');
eq(IBD.mayo({ stool: 0, bleeding: 0, endo: 2, pga: 0 }).level, 'mild', 'mayo 2 with endo 2 → not remission');
eq(IBD.mayo({ stool: 1, bleeding: 1, endo: 1, pga: 0 }).level, 'mild', 'mayo 3');
eq(IBD.mayo({ stool: 2, bleeding: 1, endo: 2, pga: 0 }).level, 'mild', 'mayo 5');
eq(IBD.mayo({ stool: 2, bleeding: 2, endo: 2, pga: 0 }).level, 'moderate', 'mayo 6');
eq(IBD.mayo({ stool: 3, bleeding: 3, endo: 2, pga: 2 }).level, 'moderate', 'mayo 10');
eq(IBD.mayo({ stool: 3, bleeding: 3, endo: 3, pga: 2 }).level, 'severe', 'mayo 11');
eq(IBD.mayo({ stool: 3, bleeding: 3, endo: 3, pga: 3 }).score, 12, 'mayo max');
// partial Mayo (endo blank string from select)
let p = IBD.mayo({ stool: 1, bleeding: 0, endo: '', pga: 0 });
eq([p.partial, p.max, p.level], [true, 9, 'remission'], 'partial 1');
eq(IBD.mayo({ stool: 2, bleeding: 2, endo: '', pga: 0 }).level, 'mild', 'partial 4');
eq(IBD.mayo({ stool: 2, bleeding: 2, endo: '', pga: 1 }).level, 'moderate', 'partial 5');
eq(IBD.mayo({ stool: 2, bleeding: 2, endo: '', pga: 2 }).level, 'moderate', 'partial 6');
eq(IBD.mayo({ stool: 3, bleeding: 2, endo: '', pga: 2 }).level, 'severe', 'partial 7');
eq(IBD.mayo({ stool: 1, bleeding: 1, endo: '0', pga: 0 }).partial, false, 'endo "0" string is full Mayo');

// Truelove & Witts
eq(IBD.truelove({ bloodyStools: 6, hr: 95 }).severe, true, 'TW 6 + HR');
eq(IBD.truelove({ bloodyStools: 5, hr: 120, temp: 39 }).severe, false, 'TW 5 stools not severe');
eq(IBD.truelove({ bloodyStools: 8, hr: 80, temp: 37, hb: 12, esr: 10, crp: 5 }).severe, false, 'TW no systemic');
eq(IBD.truelove({ bloodyStools: 8, crp: 31 }).severe, true, 'TW CRP');
eq(IBD.truelove({ bloodyStools: 8, hb: 10.5 }).severe, false, 'TW Hb 10.5 boundary');
eq(IBD.truelove({ bloodyStools: 7 }).possible, true, 'TW possible when labs missing');
eq(IBD.truelove({ bloodyStools: '' }).severe, false, 'TW blank');

// UC plan
let r = IBD.ucPlan({ stool: 1, bleeding: 1, endo: '1', pga: 1, extent: 'E3' }, { bloodyStools: 7, hr: 100 });
eq(r.level, 'asuc', 'ASUC overrides Mayo');
ok(r.meds.some(x => x.includes('infliximab') && x.includes('cyclosporine')), 'ASUC rescue');
ok(r.checks.some(x => x.includes('C. difficile')), 'ASUC C diff');
ok(r.checks.some(x => x.includes('VTE')), 'ASUC VTE');
r = IBD.ucPlan({ stool: 1, bleeding: 1, endo: '1', pga: 1, extent: 'E1' }, {});
eq(r.level, 'mild', 'UC mild');
ok(r.meds[0].includes('塞劑'), 'E1 suppository');
r = IBD.ucPlan({ stool: 1, bleeding: 1, endo: '1', pga: 1, extent: 'E2' }, {});
ok(r.meds[0].includes('灌腸') && r.meds[0].includes('口服'), 'E2 combination');
r = IBD.ucPlan({ stool: 2, bleeding: 2, endo: '2', pga: 2, extent: 'E3' }, {});
eq(r.level, 'moderate', 'UC moderate');
ok(r.meds.some(x => x.includes('AGA 2024')), 'moderate → early advanced');
ok(r.checks.some(x => x.includes('TB')), 'moderate pre-advanced TB');
ok(r.meds.some(x => x.includes('而非 adalimumab')), 'naive → avoid ADA first');
r = IBD.ucPlan({ stool: 2, bleeding: 2, endo: '2', pga: 2, flags: ['advanced'] }, {});
ok(r.meds.some(x => x.includes('upadacitinib、ustekinumab')), 'exposed UC');
r = IBD.ucPlan({ stool: 0, bleeding: 0, endo: '0', pga: 0 }, {});
eq(r.level, 'remission', 'UC remission plan');
eq(r.alerts.length, 0, 'no alerts in remission with endo');
r = IBD.ucPlan({ stool: 0, bleeding: 0, endo: '', pga: 0 }, {});
ok(r.alerts.some(a => a.text.includes('Partial Mayo')), 'partial alert');

// CDAI component checks
const base = { stools: 0, pain: 0, wellbeing: 0, comps: [], antidiarrheal: 0, mass: 0, sex: 'M', hct: 47, weight: 70, stdWeight: 70 };
eq(IBD.cdai(base).score, 0, 'cdai zero');
eq(IBD.cdai({ ...base, stools: 1 }).score, 14, 'stools 1/day → 7×2');
eq(IBD.cdai({ ...base, pain: 1 }).score, 35, 'pain 1 → 7×5');
eq(IBD.cdai({ ...base, wellbeing: 4 }).score, 196, 'wellbeing 4 allowed → 28×7');
eq(IBD.cdai({ ...base, comps: IBD.CDAI_COMPS }).score, 120, '6 categories ×20');
eq(IBD.cdai({ ...base, comps: ['junk'] }).score, 0, 'unknown comp ignored');
eq(IBD.cdai({ ...base, antidiarrheal: 1 }).score, 30, 'antidiarrheal');
eq(IBD.cdai({ ...base, mass: 5 }).score, 50, 'mass definite');
eq(IBD.cdai({ ...base, hct: 40 }).score, 42, 'male hct 40');
eq(IBD.cdai({ ...base, sex: 'F', hct: 40 }).score, 12, 'female hct 40');
eq(IBD.cdai({ ...base, hct: 52 }).parts.hct, 0, 'hct above standard → 0');
eq(IBD.cdai({ ...base, hct: '' }).parts.hct, 0, 'blank hct not 282');
ok(IBD.cdai({ ...base, hct: '' }).missing.includes('Hct'), 'blank hct flagged');
eq(IBD.cdai({ ...base, weight: 63 }).score, 10, 'weight 10% below');
eq(IBD.cdai({ ...base, weight: 100 }).parts.weight, -10, 'weight floor -10');
eq(IBD.cdai({ ...base, stools: 1, weight: 100 }).score, 4, 'overweight subtracts');
eq(IBD.cdai({ ...base, weight: 100, stools: 0 }).score, 0, 'total floored at 0');
eq(IBD.stdWeight(160), 56.3, 'std weight BMI 22');
eq(IBD.cdai({ ...base, stdWeight: '', height: 160, weight: 50.67 }).score, 10, 'std weight from height');
ok(IBD.cdai({ ...base, weight: '', stdWeight: '' }).missing.length === 1, 'weight missing flagged');
// cutoffs
const cut = s => IBD.cdai({ ...base, stools: 0, antidiarrheal: 0, mass: 0, hct: 47 - s / 6 }).level; // hct term only
eq(cut(144), 'remission', 'cdai 144');
eq(cut(150), 'mild', 'cdai 150');
eq(cut(216), 'mild', 'cdai 216');
eq(cut(222), 'modsev', 'cdai 222');
eq(cut(450), 'modsev', 'cdai 450');
eq(cut(456), 'severe', 'cdai 456');

// HBI
eq(IBD.hbi({ wellbeing: 1, pain: 1, stools: 2, mass: 0, comps: [] }).level, 'remission', 'hbi 4');
eq(IBD.hbi({ wellbeing: 1, pain: 1, stools: 3, mass: 0, comps: [] }).level, 'mild', 'hbi 5');
eq(IBD.hbi({ wellbeing: 2, pain: 2, stools: 3, mass: 0, comps: [] }).level, 'mild', 'hbi 7');
eq(IBD.hbi({ wellbeing: 2, pain: 2, stools: 4, mass: 0, comps: [] }).level, 'modsev', 'hbi 8');
eq(IBD.hbi({ wellbeing: 4, pain: 3, stools: 6, mass: 3, comps: [] }).level, 'modsev', 'hbi 16');
eq(IBD.hbi({ wellbeing: 4, pain: 3, stools: 7, mass: 3, comps: [] }).level, 'severe', 'hbi 17');
eq(IBD.hbi({ wellbeing: 0, pain: 0, stools: '', mass: 0, comps: ['a', 'b'] }).score, 2, 'hbi comps');

// CD plan
const cdBase = { index: 'CDAI', ...base, location: 'L1', behavior: 'B1', risks: [], prior: 'naive' };
r = IBD.cdPlan({ ...cdBase, stools: 3, pain: 1, wellbeing: 1 }, {}); // 42+35+49=126
eq(r.level, 'remission', 'cd remission');
r = IBD.cdPlan({ ...cdBase, stools: 4, pain: 2, wellbeing: 1 }, {}); // 56+70+49=175
eq(r.level, 'mild', 'cd mild');
ok(r.meds[0].includes('budesonide'), 'L1 mild → budesonide');
ok(!r.meds.some(x => x.includes('AGA 2025')), 'low-risk mild not escalated');
r = IBD.cdPlan({ ...cdBase, stools: 4, pain: 2, wellbeing: 1, risks: ['young'] }, {});
ok(r.meds.some(x => x.includes('AGA 2025')), 'mild + high risk → advanced');
ok(r.alerts.some(a => a.text.includes('高風險')), 'high risk alert');
r = IBD.cdPlan({ ...cdBase, stools: 6, pain: 2, wellbeing: 2 }, {}); // 84+70+98=252
eq(r.level, 'modsev', 'cd modsev');
ok(r.meds.some(x => x.includes('Rec 3')), 'naive → Rec 3');
ok(r.meds.some(x => x.includes('Rec 9')), 'IFX combo');
r = IBD.cdPlan({ ...cdBase, stools: 6, pain: 2, wellbeing: 2, prior: 'tnf' }, {});
ok(r.meds.some(x => x.includes('Rec 4')), 'tnf exposed → Rec 4');
r = IBD.cdPlan({ ...cdBase, stools: 10, pain: 3, wellbeing: 4 }, {}); // 140+105+196=441 +... 
ok(['modsev', 'severe'].includes(r.level), 'high cdai');
r = IBD.cdPlan({ ...cdBase, stools: 12, pain: 3, wellbeing: 4 }, {}); // 168+105+196=469
eq(r.level, 'severe', 'cd severe');
ok(r.meds[0].includes('住院'), 'severe → admit');
r = IBD.cdPlan({ ...cdBase, mass: 5 }, {});
ok(r.abscessSuspect && r.alerts[0].level === 'danger', 'definite mass → abscess alert');
r = IBD.cdPlan({ ...cdBase, behavior: 'B3' }, {});
ok(r.abscessSuspect && r.highRisk, 'B3');
r = IBD.cdPlan({ ...cdBase, comps: ['anal'], stools: 6, pain: 2, wellbeing: 2 }, {});
ok(r.perianal && r.meds.some(x => x.includes('肛門廔管')), 'perianal fistula → IFX');
r = IBD.cdPlan({ ...cdBase, behavior: 'B2' }, {});
ok(r.nutrition.some(x => x.includes('低渣')), 'stricture diet');
// HBI route
r = IBD.cdPlan({ ...cdBase, index: 'HBI' }, { wellbeing: 2, pain: 2, stools: 5, mass: 0, comps: [] });
eq([r.indexLabel, r.score, r.level], ['Harvey-Bradshaw Index', 9, 'modsev'], 'cd via HBI');
r = IBD.cdPlan({ ...cdBase, index: 'HBI' }, { wellbeing: 0, pain: 0, stools: 0, mass: 3, comps: ['abscess'] });
ok(r.abscessSuspect, 'HBI abscess');
// summary
ok(IBD.summary('CD', r).includes('Harvey-Bradshaw'), 'summary');


// ---------- NHI 第八節 ----------
const cdA = { disease: 'CD', age: 30, card: true, imaging: true, tx5asa: true, txSteroid: true, txImm: true, months: 7, cdai: 320, notSurgical: true, excl: [] };
let q = IBD.nhi(cdA);
eq([q.eligible, q.rule.startsWith('8.2.4.7.1')], [true, true], 'CD adult path 1');
q = IBD.nhi({ ...cdA, months: 6 });
eq(q.eligible, false, 'CD 超過六個月: 6 not enough');
q = IBD.nhi({ ...cdA, cdai: 299 });
eq(q.eligible, false, 'CD CDAI 299');
q = IBD.nhi({ ...cdA, cdai: 120, sideEffect: true });
eq(q.eligible, true, 'CD severe side effect bypasses CDAI 300');
q = IBD.nhi({ ...cdA, notSurgical: false });
eq(q.eligible, false, 'CD path1 requires not surgical');
q = IBD.nhi({ ...cdA, notSurgical: false, cdai: 120, fistula: true });
eq(q.eligible, true, 'CD fistula path CDAI ≥100');
q = IBD.nhi({ ...cdA, notSurgical: false, cdai: 120, fistula: true, txImm: false });
eq(q.eligible, false, 'CD fistula path needs all three');
q = IBD.nhi({ ...cdA, notSurgical: false, cdai: 120, fistula: true, txImm: false, fistulaSurgery: true });
eq(q.eligible, true, 'CD fistula path via surgery');
q = IBD.nhi({ ...cdA, notSurgical: false, cdai: 99, fistula: true });
eq(q.eligible, false, 'CD fistula CDAI 99');
q = IBD.nhi({ ...cdA, notSurgical: false, cdai: 150, surgery2: true, months: 1 });
eq(q.eligible, true, 'CD 2 surgeries/yr (no month req)');
q = IBD.nhi({ ...cdA, card: false });
eq(q.eligible, false, 'CD needs card');
q = IBD.nhi({ ...cdA, imaging: false });
eq(q.eligible, false, 'CD needs imaging');
q = IBD.nhi({ ...cdA, excl: ['tb'] });
eq(q.eligible, false, 'TB exclusion');
q = IBD.nhi({ ...cdA, tx5asa: false, txImm: false, months: 7 });
eq(q.eligible, true, 'CD path1 及/或 → steroid alone ok');
q = IBD.nhi({ ...cdA, reapply: true, months: 4, tx5asa: false, txImm: false });
eq(q.eligible, true, 'CD reapply >3 months');
q = IBD.nhi({ ...cdA, reapply: true, months: 3 });
eq(q.eligible, false, 'CD reapply 3 months not enough');
q = IBD.nhi(cdA);
let upa = q.drugs.find(d => d.id === 'upa');
eq(upa.avail, false, 'CD upa needs bio failure');
eq(q.drugs.filter(d => d.avail).map(d => d.id), ['ada', 'ifx', 'vdz', 'ust', 'rzb'], 'CD naive drugs');
q = IBD.nhi({ ...cdA, bioFail: true });
eq(q.drugs.find(d => d.id === 'upa').avail, true, 'CD upa after bio fail');
q = IBD.nhi({ ...cdA, bioFail: true, thrombRisk: true });
eq(q.drugs.find(d => d.id === 'upa').avail, false, 'CD upa thrombosis risk');
ok(!q.drugs.some(d => /mirikizumab|guselkumab/i.test(d.name)), 'CD no miri/gus');
// pediatric CD
const cdP = { disease: 'CD', age: 12, card: true, imaging: true, txSteroid: true, txImm: true, months: 4, pcdai: 35, excl: [] };
q = IBD.nhi(cdP);
eq([q.ped, q.eligible, q.rule.startsWith('8.2.4.7.2')], [true, true, true], 'ped CD path1');
eq(IBD.nhi({ ...cdP, pcdai: 30 }).eligible, false, 'PCDAI >30 strict');
eq(IBD.nhi({ ...cdP, months: 3 }).eligible, false, 'ped >3 months strict');
eq(IBD.nhi({ ...cdP, pcdai: 10, fistulaPed: true, growth: true }).eligible, true, 'ped fistula + growth');
eq(IBD.nhi({ ...cdP, age: 5 }).eligible, false, 'ped CD <6');
eq(IBD.nhi(cdP).drugs.find(d => d.id === 'rzb').avail, false, 'ped RZB <16');
eq(IBD.nhi({ ...cdP, age: 16 }).drugs.find(d => d.id === 'rzb').avail, true, 'ped RZB 16');
eq(IBD.nhi({ ...cdP, excl: ['preg'] }).eligible, true, 'ped CD pregnancy not listed');
// UC adult
const ucA = { disease: 'UC', age: 40, card: true, extent: 'E3', tx5asa: true, txSteroid: true, txImm: true, months: 6, mayo: 9, endo: 2, excl: [] };
q = IBD.nhi(ucA);
eq([q.eligible, q.rule.startsWith('8.2.4.9.1')], [true, true], 'UC adult path1 (≥6 months)');
eq(IBD.nhi({ ...ucA, mayo: 8 }).eligible, false, 'UC Mayo 8');
eq(IBD.nhi({ ...ucA, endo: 1 }).eligible, false, 'UC endo 1');
eq(IBD.nhi({ ...ucA, extent: 'E1' }).eligible, false, 'UC proctitis excluded');
eq(IBD.nhi({ ...ucA, txImm: false }).eligible, false, 'UC needs immunomodulator');
eq(IBD.nhi({ ...ucA, txImm: false, sideEffect: true }).eligible, true, 'UC side effect');
eq(IBD.nhi({ ...ucA, months: 5 }).eligible, false, 'UC 5 months');
eq(IBD.nhi({ ...ucA, card: false }).eligible, false, 'UC path1 needs card');
const asuc = { disease: 'UC', age: 40, extent: 'E3', mayo: 12, endoOk: true, bxExcl: true, cdiffExcl: true, ivSteroid5d: true, excl: [] };
eq(IBD.nhi(asuc).eligible, true, 'UC ASUC path (no card needed)');
eq(IBD.nhi({ ...asuc, mayo: 11 }).eligible, false, 'ASUC needs Mayo 12');
eq(IBD.nhi({ ...asuc, cdiffExcl: false }).eligible, false, 'ASUC needs C diff excluded');
q = IBD.nhi(ucA);
eq(q.drugs.filter(d => d.avail).map(d => d.id), ['gol', 'ada', 'vdz', 'ifx', 'ust'], 'UC naive drugs');
eq(IBD.nhi({ ...ucA, bioFail: true }).drugs.filter(d => d.avail).length, 7, 'UC all 7 after bio fail');
ok(!q.drugs.some(d => /risankizumab|ozanimod/i.test(d.name)), 'UC no RZB/ozanimod');
// UC pediatric
const ucP = { disease: 'UC', age: 10, card: true, extent: 'E3', tx5asa: true, txSteroid: true, txImm: true, months: 3, pucai: 40, excl: [] };
q = IBD.nhi(ucP);
eq([q.eligible, q.rule.startsWith('8.2.4.9.2')], [true, true], 'ped UC path1');
eq(q.drugs.map(d => d.avail), [true, false], 'ped UC: IFX yes, ADA only 5–<6');
eq(IBD.nhi({ ...ucP, age: 5.5 }).drugs.map(d => d.avail), [false, true], 'ped UC age 5.5');
eq(IBD.nhi({ ...ucP, pucai: 30 }).eligible, false, 'PUCAI 30');
// missing age
eq(IBD.nhi({ ...ucA, age: '' }).eligible, false, 'age required');

// continuation
eq(IBD.nhiCont({ disease: 'CD', baseCdai: 320, curCdai: 140 }).status, 'effective', 'CD cont effective');
eq(IBD.nhiCont({ disease: 'CD', baseCdai: 320, curCdai: 220 }).status, 'partial', 'CD cont partial (drop 100)');
eq(IBD.nhiCont({ disease: 'CD', baseCdai: 320, curCdai: 230 }).status, 'fail', 'CD cont fail');
eq(IBD.nhiCont({ disease: 'CD', fistulaFewer: true }).status, 'partial', 'CD fistula fewer');
eq(IBD.nhiCont({ disease: 'CD', curCdai: 400, fistulaHealed: true }).status, 'effective', 'CD fistula healed');
eq(IBD.nhiCont({ disease: 'UC', stage: 'first', basePMayo: 8, baseBleed: 3, curPMayo: 6, curBleed: 2 }).status, 'effective', 'UC first cont');
eq(IBD.nhiCont({ disease: 'UC', stage: 'first', basePMayo: 8, baseBleed: 3, curPMayo: 5, curBleed: 3 }).status, 'fail', 'UC first cont bleeding not reduced');
eq(IBD.nhiCont({ disease: 'UC', stage: 'second', mayo: 6, endo: 1 }).status, 'effective', 'UC second cont');
eq(IBD.nhiCont({ disease: 'UC', stage: 'second', mayo: 6, endo: 2 }).status, 'fail', 'UC second endo 2');
eq(IBD.nhiCont({ disease: 'UC', stage: 'first', basePMayo: 8 }).status, 'pending', 'UC pending');

console.log(`${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
