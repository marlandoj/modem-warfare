// Tuesday gate: a complete match over the dev harness, from placement to the
// stamp, through the app's real frames, codec and gate (the BroadcastChannel
// carries exactly the base32 text the QR would).
//
//   1. clean match in QR mode: two automated players, mixed hits and misses,
//      sinkings before the end, plays to completion, BOTH phones stamp
//      VERIFIED. (The same match in CHIRP mode runs in transport.js.)
//   2. cheat (false result): B reports one of A's hits as a miss in round 2;
//      A's phone stamps LIAR naming the round; B's phone still verifies A.
//   3. cheat (moved fleet): B's reveal shows a fleet that is not the one it
//      committed to; A stamps LIAR / COMMIT MISMATCH.
//   4. cheat (wrong salt): B reveals the right fleet with a wrong salt; LIAR.
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT } from './lib.js';

export async function run() {
  banner('match: full match over the harness, then three cheats');
  const srv = await startServer();
  const { context, close } = await launch();
  const page = await context.newPage();
  const cap = capture(page, 'match');
  const results = {};
  try {
    await page.goto(`${srv.base}/dev/harness.html`);
    await page.waitForFunction(() => window.harness && window.harness.runMatch && document.querySelectorAll('iframe').length === 2);
    await page.setViewportSize({ width: 1400, height: 1000 });

    // --- 1. clean match -------------------------------------------------
    const clean = await page.evaluate(() => window.harness.runMatch({ cheat: null, transport: 'qr' }));
    results.clean = clean;
    console.log(`clean match: ${clean.rounds.length} rounds in ${clean.seconds} s, session ${clean.session}`);
    for (const r of clean.rounds) {
      const f = (s) => `${s.picks.join(' ')} → ${s.hits.map((h) => (h ? 'HIT' : 'miss')).join('/')} sunk=${s.enemySunk.map((x) => (x ? 1 : 0)).join('')}`;
      console.log(`  round ${r.round}: A ${f(r.a)} | B ${f(r.b)}`);
    }
    console.log('transport:', JSON.stringify(clean.transport));
    console.log('outcome:', JSON.stringify(clean.outcome));
    console.log('audit:', JSON.stringify(clean.audit));
    console.log('stamps:', JSON.stringify(clean.stamp));
    console.log('commitments:', JSON.stringify(clean.commits));
    console.log('gate tallies:', JSON.stringify(clean.gate));
    await page.screenshot({ path: path.join(OUT, 'match-verified.png') });

    assert(clean.errors.length === 0, 'no errors inside instances: ' + clean.errors.join(' | '));
    assert(clean.transport.a === 'qr' && clean.transport.b === 'qr', 'both phones play by QR');
    assert(clean.rounds.length >= 4 && clean.rounds.length <= 12, `match length ${clean.rounds.length} rounds inside the spec envelope`);
    const allHits = clean.rounds.flatMap((r) => [...r.a.hits, ...r.b.hits]);
    assert(allHits.some(Boolean) && allHits.some((h) => !h), 'mixed hits and misses');
    const firstSinkRound = clean.rounds.findIndex((r) => r.a.enemySunk.some(Boolean)) + 1;
    assert(firstSinkRound > 0 && firstSinkRound < clean.rounds.length, `at least one sinking before the end (first at round ${firstSinkRound} of ${clean.rounds.length})`);
    assert(clean.outcome.a.result === 'win' && clean.outcome.b.result === 'loss', 'A wins, B loses, both phones agree');
    assert(clean.outcome.a.finalRound === clean.outcome.b.finalRound, 'both phones agree on the final round');
    assert(clean.audit.a.verdict === 'VERIFIED' && clean.audit.b.verdict === 'VERIFIED', 'both audits VERIFIED');
    assert(clean.stamp.a.word === 'VERIFIED' && clean.stamp.a.sub === 'NO SHIP MOVED', 'A stamps VERIFIED — NO SHIP MOVED');
    assert(clean.stamp.b.word === 'VERIFIED' && clean.stamp.b.sub === 'NO SHIP MOVED', 'B stamps VERIFIED — NO SHIP MOVED');
    assert(clean.commits.aOfB === clean.commits.bActual && clean.commits.bOfA === clean.commits.aActual, 'each phone holds the other\'s real commitment');
    assert(/^[0-9a-f]{32}$/.test(clean.commits.aActual) && !/^0+$/.test(clean.commits.aActual), 'commitment is a real 16-byte digest, not the zero placeholder');
    assert(clean.audit.a.checked >= 1 + clean.rounds.length * 3, 'audit checked the commitment and every shell');
    assert(clean.gate.a.rejectedReasons.WRONG_SESSION === undefined && clean.gate.b.rejectedReasons.WRONG_SESSION === undefined, 'no session confusion');

    // --- 2. cheat: a false result ----------------------------------------
    const lie = await page.evaluate(() => window.harness.runMatch({ cheat: 'result' }));
    results.lie = lie;
    console.log(`cheat result: ${lie.rounds.length} rounds; A audit ${lie.audit.a.verdict} ${JSON.stringify(lie.audit.a.findings.slice(0, 2))}; B audit ${lie.audit.b.verdict}`);
    console.log('stamps:', JSON.stringify(lie.stamp));
    await page.screenshot({ path: path.join(OUT, 'match-liar.png') });
    assert(lie.errors.length === 0, 'no errors inside instances (cheat result)');
    assert(lie.audit.a.verdict === 'LIAR', 'A audits B as LIAR after a false result');
    assert(lie.audit.a.findings.some((f) => f.code === 'FALSE_RESULT' && f.round === 2), 'finding names FALSE_RESULT in round 2: ' + JSON.stringify(lie.audit.a.findings));
    assert(lie.stamp.a.word === 'LIAR', 'A\'s stamp says LIAR');
    assert(lie.audit.b.verdict === 'VERIFIED' && lie.stamp.b.word === 'VERIFIED', 'the honest player still verifies');

    // --- 3. cheat: revealed fleet differs from the commitment ------------
    const moved = await page.evaluate(() => window.harness.runMatch({ cheat: 'fleet' }));
    results.moved = moved;
    console.log(`cheat fleet: A audit ${moved.audit.a.verdict} ${JSON.stringify(moved.audit.a.findings.slice(0, 2))}; B audit ${moved.audit.b.verdict}`);
    assert(moved.errors.length === 0, 'no errors inside instances (cheat fleet)');
    assert(moved.audit.a.verdict === 'LIAR' && moved.audit.a.findings[0].code === 'COMMIT_MISMATCH', 'moved fleet → LIAR / COMMIT_MISMATCH');
    assert(moved.stamp.a.word === 'LIAR' && /COMMIT MISMATCH/.test(moved.stamp.a.sub), 'stamp says LIAR · COMMIT MISMATCH');
    assert(moved.audit.b.verdict === 'VERIFIED', 'the honest player still verifies');

    // --- 4. cheat: right fleet, wrong salt ------------------------------
    const salt = await page.evaluate(() => window.harness.runMatch({ cheat: 'salt' }));
    results.salt = salt;
    console.log(`cheat salt: A audit ${salt.audit.a.verdict} ${JSON.stringify(salt.audit.a.findings.slice(0, 2))}; B audit ${salt.audit.b.verdict}`);
    assert(salt.errors.length === 0, 'no errors inside instances (cheat salt)');
    assert(salt.audit.a.verdict === 'LIAR' && salt.audit.a.findings[0].code === 'COMMIT_MISMATCH', 'wrong salt → LIAR / COMMIT_MISMATCH');
    assert(salt.audit.a.findings.length === 1, 'wrong salt alone: every result still matched, only the commitment failed');

    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log('match: PASS (clean VERIFIED both ways; false result, moved fleet, wrong salt each LIAR)');
    return { ok: true, results };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('match.js')) run().catch((e) => { console.error(e); process.exit(1); });
